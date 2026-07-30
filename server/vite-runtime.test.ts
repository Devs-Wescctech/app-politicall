import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const startupMarker = "RUNTIME_STARTUP_PROBE_LISTENING";
const startupTimeoutMs = 30_000;

function createDevelopmentImportBlocker(): string {
  return `
const blockedPackages = new Set([
  "vite",
  "nanoid",
  "@vitejs/plugin-react",
  "@tailwindcss/vite",
  "@replit/vite-plugin-cartographer",
  "@replit/vite-plugin-dev-banner",
  "@replit/vite-plugin-runtime-error-modal",
]);

export async function resolve(specifier, context, nextResolve) {
  if (
    blockedPackages.has(specifier) ||
    specifier.endsWith("/vite.config.ts") ||
    specifier === "../vite.config"
  ) {
    throw new Error("Blocked development-only startup import: " + specifier);
  }

  return nextResolve(specifier, context);
}
`;
}

function waitForStartup(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolve();
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for ${startupMarker}. Output:\n${output}`));
    }, startupTimeoutMs);

    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(startupMarker)) finish();
    };

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      finish(new Error(`Production startup exited before listening (code ${code}, signal ${signal}). Output:\n${output}`));
    });
  });
}

async function stopProcess(child: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  child.kill();
  await Promise.race([
    closed,
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);

  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await closed;
}

async function removeStaleProbeDirectories(runtimeRoot: string): Promise<void> {
  const entries = await readdir(runtimeRoot, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("vite-startup-"))
    .map((entry) => rm(path.join(runtimeRoot, entry.name), { force: true, recursive: true })));
}

describe("Vite runtime boundary", () => {
  it("starts the real production bundle without resolving development-only modules", async () => {
    expect(process.versions.node.split(".")[0]).toBe("24");

    const runtimeRoot = path.join(root, ".runtime");
    await mkdir(runtimeRoot, { recursive: true });
    await removeStaleProbeDirectories(runtimeRoot);
    const outputDirectory = await mkdtemp(path.join(runtimeRoot, "vite-startup-"));
    const outputFile = path.join(outputDirectory, "index.js");
    const loaderFile = path.join(outputDirectory, "block-development-imports.mjs");
    let child: ChildProcessWithoutNullStreams | undefined;

    try {
      await build({
        absWorkingDir: root,
        entryPoints: ["server/index.ts"],
        bundle: true,
        format: "esm",
        outfile: outputFile,
        packages: "external",
        platform: "node",
      });
      await mkdir(path.join(outputDirectory, "public"));
      await writeFile(path.join(outputDirectory, "public", "index.html"), "<!doctype html><title>runtime probe</title>");
      await writeFile(loaderFile, createDevelopmentImportBlocker());

      child = spawn(process.execPath, ["--experimental-loader", pathToFileURL(loaderFile).href, outputFile], {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: "0",
          PROD_DATABASE_URL: ["postgres:", "//probe:probe@127.0.0.1:1/politicall"].join(""),
          RUNTIME_STARTUP_PROBE: "1",
          SESSION_SECRET: "runtime-startup-probe-secret",
          DATA_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString("base64"),
        },
        stdio: "pipe",
        windowsHide: true,
      });

      await waitForStartup(child);
    } finally {
      await stopProcess(child);
      await rm(outputDirectory, { force: true, recursive: true });
    }
  }, startupTimeoutMs + 5_000);
});
