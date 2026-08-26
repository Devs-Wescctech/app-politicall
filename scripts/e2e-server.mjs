import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (!process.env.CI && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const port = String(process.env.E2E_PORT ?? 5010);
const publicUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const required = ["DATABASE_URL", "SESSION_SECRET"];
const missing = required.filter(name => !process.env[name]);

if (missing.length > 0) {
  throw new Error(`Missing E2E environment variables: ${missing.join(", ")}`);
}

const child = spawn(
  process.execPath,
  ["--import", "tsx", "server/index.ts"],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: port,
      PUBLIC_APP_URL: publicUrl,
      PUBLIC_APP_ORIGINS: publicUrl,
    },
    stdio: "inherit",
  },
);

const stop = signal => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
