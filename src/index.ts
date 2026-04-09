// Main entry point for highs-wasm
export { Solver } from "./solver.ts";
export { SolverClient } from "./client.ts";
export type {
  VarRef,
  ConRef,
  VarType,
  ObjectiveSense,
  SolveStatus,
  AddVarOptions,
  AddConstraintOptions,
  BulkVarsOptions,
  BulkConstraintsOptions,
  SolveOptions,
  SolveResult,
  Basis,
  ProgressUpdate,
  ProgressController,
  StreamingSolve,
  SolverOptions,
  SolverVariant,
  SolverAssetUrl,
  VariantAssetUrl,
} from "./types.ts";

// Error classes
export {
  HiGHSError,
  InfeasibleError,
  UnboundedError,
  TimeLimitError,
  ModelError,
} from "./types.ts";

import { Solver } from "./solver.ts";
import type { SolverOptions } from "./types.ts";
import type { HighsModule } from "./c-api.ts";
import { resolveVariantUrl } from "./asset-urls.ts";

// Runtime detection
const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis;

// Feature detection
export function detect() {
  return {
    threads:
      typeof SharedArrayBuffer !== "undefined" &&
      typeof Atomics !== "undefined" &&
      // Browser requires crossOriginIsolated, Node/Bun don't
      (isBrowser ? (globalThis as any).crossOriginIsolated === true : true),

    simd: WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ])
    ),

    exceptions: WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 6, 64, 7, 0,
        11, 11,
      ])
    ),

    isBrowser,
  };
}

// Browser-first solver creation.
export async function create(options: SolverOptions = {}): Promise<Solver> {
  const features = detect();
  const variant = options.variant ?? (features.threads ? "mt" : "st");

  // Resolve module URL: user-supplied override first, then static import
  const moduleUrl = resolveVariantUrl(options.moduleUrl, variant);

  let mod: { default: (opts?: object) => Promise<HighsModule> };
  if (moduleUrl) {
    // Dynamic runtime import from user-supplied URL (browser-style)
    mod = await import(/* @vite-ignore */ moduleUrl);
  } else if (variant === "mt") {
    mod = await import("../dist/highs.mt.mjs");
  } else {
    mod = await import("../dist/highs.st.mjs");
  }

  const module = await mod.default() as HighsModule;
  return new Solver(module, options);
}

// Worker-based solver creation for browsers (non-blocking)
export { SolverClient as WorkerSolver } from "./client.ts";

// Re-export for convenience
export { createCApi, type HighsModule, type HighsCApi } from "./c-api.ts";
