import path from "node:path";

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
await jiti.import("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  /**
   * Emits .next/standalone — a self-contained server bundle with only the
   * traced runtime dependencies, so the Docker image doesn't have to ship the
   * full monorepo node_modules (see apps/nextjs/Dockerfile). Harmless outside
   * Docker: `next dev` ignores it, and Vercel supplies its own output mode.
   */
  output: "standalone",

  /**
   * Required for standalone in a pnpm monorepo. Dependency tracing has to start
   * at the workspace root or it misses everything resolved through the root
   * node_modules/.pnpm store and the workspace `@acme/*` symlinks — the app then
   * builds fine but crashes at boot with MODULE_NOT_FOUND.
   */
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),

  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@acme/ai-agent",
    "@acme/api",
    "@acme/auth",
    "@acme/db",
    "@acme/messaging",
    "@acme/queue",
    "@acme/ui",
    "@acme/validators",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },
};

export default config;
