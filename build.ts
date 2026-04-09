#!/usr/bin/env bun
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

type BuildStep =
  | "worker-st"
  | "worker-mt"
  | "worker"
  | "lazy"
  | "node"
  | "index"
  | "all";

const step = (Bun.argv[2] as BuildStep | undefined) ?? "all";

function failBuild(logs: { message?: string }[], label: string): never {
  console.error(`${label} failed`);
  for (const log of logs) {
    console.error(log.message ?? String(log));
  }
  process.exit(1);
}

async function runBuild(
  label: string,
  options: Parameters<typeof Bun.build>[0]
): Promise<void> {
  const result = await Bun.build(options);
  if (!result.success) {
    failBuild(result.logs, label);
  }
}

function replaceInFile(path: string, replacements: Array<[pattern: RegExp | string, replacement: string]>) {
  let content = readFileSync(path, "utf8");
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern as any, replacement);
  }
  writeFileSync(path, content);
}

function copyDts(src: string, dest: string) {
  copyFileSync(src, dest);
}

async function logSize(path: string) {
  const size = (await Bun.file(path).arrayBuffer()).byteLength;
  console.log(`${path}: ${(size / 1024).toFixed(1)}KB`);
}

async function buildWorkerSt() {
  await runBuild("worker.st.js", {
    entrypoints: ["./src/worker-st.ts"],
    outfile: "./dist/worker.st.js",
    target: "browser",
    format: "esm",
    minify: true,
  });
}

async function buildWorkerMt() {
  await runBuild("worker.mt.js", {
    entrypoints: ["./src/worker-mt.ts"],
    outfile: "./dist/worker.mt.js",
    target: "browser",
    format: "esm",
    minify: true,
  });
}

async function buildLazy() {
  await runBuild("lazy.mjs", {
    entrypoints: ["./src/lazy.ts"],
    outfile: "./dist/lazy.mjs",
    target: "browser",
    format: "esm",
  });
  replaceInFile("./dist/lazy.mjs", [[/\.\.\/dist\/worker\./g, "./worker."]]);
  copyDts("./src/lazy.ts", "./dist/lazy.d.ts");
}

async function buildNode() {
  await runBuild("node.mjs", {
    entrypoints: ["./src/node.ts"],
    outfile: "./dist/node.mjs",
    target: "bun",
    format: "esm",
  });
  copyDts("./src/node.ts", "./dist/node.d.ts");
}

async function buildIndex() {
  rmSync("./dist/index.js", { force: true });
  rmSync("./dist/index.mjs", { force: true });

  await runBuild("index.mjs", {
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "browser",
    format: "esm",
    splitting: true,
    external: ["../dist/*.mjs"],
  });

  if (!existsSync("./dist/index.js")) {
    console.error("index build did not emit ./dist/index.js");
    process.exit(1);
  }

  renameSync("./dist/index.js", "./dist/index.mjs");
  replaceInFile("./dist/index.mjs", [
    [/\.\.\/dist\/highs/g, "./highs"],
    [/\.\.\/dist\/worker\./g, "./worker."],
  ]);
  copyDts("./src/index.ts", "./dist/index.d.ts");
}

async function main() {
  switch (step) {
    case "worker-st":
      await buildWorkerSt();
      await logSize("./dist/worker.st.js");
      return;
    case "worker-mt":
      await buildWorkerMt();
      await logSize("./dist/worker.mt.js");
      return;
    case "worker":
      await buildWorkerSt();
      await buildWorkerMt();
      await logSize("./dist/worker.st.js");
      await logSize("./dist/worker.mt.js");
      return;
    case "lazy":
      await buildLazy();
      await logSize("./dist/lazy.mjs");
      return;
    case "node":
      await buildNode();
      await logSize("./dist/node.mjs");
      return;
    case "index":
      await buildIndex();
      await logSize("./dist/index.mjs");
      return;
    case "all":
      await buildWorkerSt();
      await buildWorkerMt();
      await buildLazy();
      await buildNode();
      await buildIndex();
      await logSize("./dist/worker.st.js");
      await logSize("./dist/worker.mt.js");
      await logSize("./dist/lazy.mjs");
      await logSize("./dist/node.mjs");
      await logSize("./dist/index.mjs");
      return;
  }
}

await main();
