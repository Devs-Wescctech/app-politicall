import { build, type Plugin } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const developmentOnlySpecifiers = new Set(["vite", "nanoid", "../vite.config"]);

const rejectStaticDevelopmentImports: Plugin = {
  name: "reject-static-development-imports",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (
        args.kind === "import-statement" &&
        developmentOnlySpecifiers.has(args.path)
      ) {
        return {
          errors: [
            {
              text: `production startup must not resolve ${args.path} statically`,
            },
          ],
        };
      }
    });
  },
};

describe("Vite runtime boundary", () => {
  it("does not follow development-only modules while bundling the production entry point", async () => {
    await build({
      absWorkingDir: root,
      entryPoints: ["server/index.ts"],
      bundle: true,
      format: "esm",
      packages: "external",
      platform: "node",
      plugins: [rejectStaticDevelopmentImports],
      write: false,
    });
  });

  it("loads serveStatic and log without statically resolving development-only modules", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "politicall-vite-"));
    const outputFile = path.join(outputDirectory, "vite-runtime.mjs");

    try {
      await build({
        absWorkingDir: root,
        entryPoints: ["server/vite.ts"],
        bundle: true,
        external: ["vite", "nanoid", "../vite.config"],
        format: "esm",
        outfile: outputFile,
        platform: "node",
        plugins: [rejectStaticDevelopmentImports],
      });

      const runtime = await import(pathToFileURL(outputFile).href);

      expect(runtime.serveStatic).toBeTypeOf("function");
      expect(runtime.log).toBeTypeOf("function");
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });
});
