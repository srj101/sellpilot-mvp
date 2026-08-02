#!/usr/bin/env bash
# Frees the ports this project's local dev workflow needs, then launches
# Redis (Docker), MinIO (Docker), a self-hosted Whisper transcription server (Docker),
# Next.js, and the worker.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Processes belonging to Docker Desktop's own networking stack (or, for
# colima users, colima/lima's SSH port-forwarding tunnel) must never be
# killed just because they happen to own a published port - that would take
# Docker itself down. Everything else on the port is fair game.
#
# colima (QEMU + sshfs) forwards every published container port through a
# single SSH multiplex process, so on macOS that process - not the container -
# shows up as the owner of ports like 6379. Killing it drops the SSH tunnel
# used for the Docker socket too, taking Docker itself down.
docker_process_names=("com.docker.backend" "com.docker.build" "Docker Desktop" "com.docker.vpnkit" "vpnkit" "vpnkit-bridge" "ssh.sock [mux]")

is_docker_process() {
    local name="$1"
    for docker_name in "${docker_process_names[@]}"; do
        [[ "$name" == "$docker_name" ]] && return 0
    done
    return 1
}

clear_port() {
    local port="$1"
    local pids
    pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
    for pid in $pids; do
        local comm name
        comm=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")
        name=$(basename "${comm:-unknown}")
        if is_docker_process "$name"; then
            echo -e "\033[90mPort $port is held by Docker's own networking ($name) - leaving it alone.\033[0m"
            continue
        fi
        echo -e "\033[33mPort $port is held by PID $pid ($name) - killing it.\033[0m"
        kill -9 "$pid" 2>/dev/null || true
    done
}

echo -e "\033[36m== Freeing ports ==\033[0m"
clear_port 3000  # Next.js
clear_port 3001  # Worker health check
clear_port 6379  # Redis
clear_port 4566  # LocalStack (AWS Emulation)
clear_port 9000  # Local Whisper transcription server

# If some OTHER container (not ours) already published one of our ports,
# stop it instead of fighting Docker's own proxy process for the port.
stop_other_container() {
    local port="$1" ours="$2"
    local name
    docker ps --filter "publish=$port" --format '{{.Names}}' 2>/dev/null | while read -r name; do
        if [[ -n "$name" && "$name" != "$ours" ]]; then
            echo -e "\033[33mContainer '$name' is already publishing port $port - stopping it.\033[0m"
            docker stop "$name" >/dev/null
        fi
    done
}

if ! docker info >/dev/null 2>&1; then
    echo -e "\033[31mDocker does not seem to be running - start Docker Desktop and re-run.\033[0m"
    exit 1
fi

stop_other_container 6379 "local-redis"
stop_other_container 4566 "local-aws"

echo -e "\033[36m== Launching services ==\033[0m"

ensure_container() {
    local name="$1"; shift
    if ! docker ps -a --filter "name=^${name}\$" --format '{{.Names}}' | grep -q .; then
        echo -e "\033[33mCreating $name container...\033[0m"
        docker run -d --name "$name" --restart unless-stopped "$@" >/dev/null
    else
        local running
        running=$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo false)
        if [[ "$running" != "true" ]]; then
            echo -e "\033[33mStarting existing $name container...\033[0m"
            docker start "$name" >/dev/null
        fi
    fi
}

ensure_container local-redis -p 6379:6379 redis:7-alpine
ensure_container local-aws -p 4566:9000 -p 9001:9001 \
    -e "MINIO_ROOT_USER=mock-key" -e "MINIO_ROOT_PASSWORD=mock-secret" \
    minio/minio server /data --console-address ":9001"
# OpenAI-compatible self-hosted transcription server (multi-arch, CPU mode) — apps/worker
# points TRANSCRIPTION_BASE_URL at this by default. Swapping to OpenAI's real Whisper API
# (or any other OpenAI-compatible host) in production is an env-var change only, no code
# or container change — see apps/worker/src/config.ts.
ensure_container local-whisper -p 9000:9000 \
    -e "WHISPER_MODEL=small" -e "WHISPER_LANGUAGE=auto" -e "WHISPER_DEVICE=cpu" \
    -e "WHISPER_API_KEY=local-dev-whisper-key" \
    hwdsl2/whisper-server

pids=()
cleanup() {
    echo -e "\n\033[36mShutting down dev servers...\033[0m"
    for pid in "${pids[@]}"; do
        kill "$pid" 2>/dev/null
    done
}
trap cleanup EXIT INT TERM

run_prefixed() {
    local label="$1" color="$2"; shift 2
    ( "$@" 2>&1 | sed -u "s/^/${color}[$label]\033[0m /" ) &
    pids+=($!)
}

cd "$repo_root"
run_prefixed "next" "\033[35m" pnpm --filter @acme/nextjs dev
run_prefixed "worker" "\033[34m" pnpm --filter @acme/worker dev

echo -e "\033[32mStarted Redis, MinIO, Whisper transcription, Next.js (http://localhost:3000), and worker dev servers.\033[0m"
echo -e "\033[90mPress Ctrl+C to stop everything.\033[0m"

wait
