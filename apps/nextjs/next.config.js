import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
await jiti.import("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  allowedDevOrigins: ["simaroubaceous-avah-pseudocandidly.ngrok-free.dev"],

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
