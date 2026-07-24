# Frees the ports this project's local dev workflow needs, then launches
# Redis (Docker), Next.js, and the worker each in their own terminal window.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

# Processes belonging to Docker Desktop's own networking stack must never be
# killed just because they happen to own a published port — that would take
# Docker itself down. Everything else on the port is fair game.
$dockerProcessNames = @("com.docker.backend", "com.docker.build", "dockerd", "vpnkit", "vpnkit-bridge", "Docker Desktop", "wslrelay", "wsl")

function Clear-Port {
    param([int]$Port)

    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        if (-not $procId -or $procId -eq 0) { continue }

        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.ProcessName } else { "unknown" }

        if ($dockerProcessNames -contains $name) {
            Write-Host "Port $Port is held by Docker's own networking ($name) - leaving it alone." -ForegroundColor DarkGray
            continue
        }

        Write-Host "Port $Port is held by PID $procId ($name) - killing it." -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "== Freeing ports ==" -ForegroundColor Cyan
Clear-Port -Port 3000  # Next.js
Clear-Port -Port 3001  # Worker health check
Clear-Port -Port 6379  # Redis
Clear-Port -Port 4566  # LocalStack (AWS Emulation)

# If some OTHER container (not ours) already published 6379, stop it instead
# of fighting Docker's own proxy process for the port.
$otherRedisContainer = docker ps --filter "publish=6379" --format "{{.Names}}" 2>$null |
    Where-Object { $_ -ne "local-redis" }
foreach ($name in $otherRedisContainer) {
    Write-Host "Container '$name' is already publishing port 6379 - stopping it." -ForegroundColor Yellow
    docker stop $name | Out-Null
}

# If some OTHER container (not ours) already published 4566, stop it instead
$otherLocalstackContainer = docker ps --filter "publish=4566" --format "{{.Names}}" 2>$null |
    Where-Object { $_ -ne "local-aws" }
foreach ($name in $otherLocalstackContainer) {
    Write-Host "Container '$name' is already publishing port 4566 - stopping it." -ForegroundColor Yellow
    docker stop $name | Out-Null
}

Write-Host "== Launching services (each in its own terminal) ==" -ForegroundColor Cyan

$redisCmd = @"
Write-Host 'Redis (Docker)' -ForegroundColor Cyan
docker info *> `$null
if (`$LASTEXITCODE -ne 0) {
    Write-Host 'Docker does not seem to be running - start Docker Desktop and re-run.' -ForegroundColor Red
    exit 1
}
`$exists = docker ps -a --filter 'name=^local-redis`$' --format '{{.Names}}' 2>`$null
if (-not `$exists) {
    Write-Host 'Creating local-redis container...' -ForegroundColor Yellow
    docker run -d --name local-redis -p 6379:6379 --restart unless-stopped redis:7-alpine | Out-Null
} else {
    `$running = docker inspect -f '{{.State.Running}}' local-redis 2>`$null
    if (`$running -ne 'true') {
        Write-Host 'Starting existing local-redis container...' -ForegroundColor Yellow
        docker start local-redis | Out-Null
    }
}
docker logs -f local-redis
"@

$minioCmd = @"
Write-Host 'MinIO S3 Emulator (Docker)' -ForegroundColor Cyan
docker info *> `$null
if (`$LASTEXITCODE -ne 0) {
    Write-Host 'Docker does not seem to be running - start Docker Desktop and re-run.' -ForegroundColor Red
    exit 1
}
`$exists = docker ps -a --filter 'name=^local-aws`$' --format '{{.Names}}' 2>`$null
if (-not `$exists) {
    Write-Host 'Creating local-aws (MinIO) container...' -ForegroundColor Yellow
    docker run -d --name local-aws -p 4566:9000 -p 9001:9001 -e "MINIO_ROOT_USER=mock-key" -e "MINIO_ROOT_PASSWORD=mock-secret" --restart unless-stopped minio/minio server /data --console-address ":9001" | Out-Null
} else {
    `$running = docker inspect -f '{{.State.Running}}' local-aws 2>`$null
    if (`$running -ne 'true') {
        Write-Host 'Starting existing local-aws container...' -ForegroundColor Yellow
        docker start local-aws | Out-Null
    }
}
docker logs -f local-aws
"@

Start-Process powershell -ArgumentList @("-NoExit", "-Command", $redisCmd)
Start-Process powershell -ArgumentList @("-NoExit", "-Command", $minioCmd)

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$repoRoot'; Write-Host 'Next.js dev server' -ForegroundColor Cyan; pnpm --filter @acme/nextjs dev"
)

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$repoRoot'; Write-Host 'Worker dev server' -ForegroundColor Cyan; pnpm --filter @acme/worker dev"
)

Write-Host "Started Redis, LocalStack, Next.js (http://localhost:3000), and worker dev servers, each in its own terminal window." -ForegroundColor Green
