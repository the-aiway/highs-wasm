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
  SolveResult,
  ProgressUpdate,
  StreamingSolve,
  SolverOptions,
} from "./types.ts";

import { Solver } from "./solver.ts";
import type { SolverOptions } from "./types.ts";
import type { HighsModule } from "./c-api.ts";

// Feature detection
export function detect() {
  return {
    threads:
      typeof SharedArrayBuffer !== "undefined" &&
      typeof Atomics !== "undefined" &&
      (globalThis as any).crossOriginIsolated === true,

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
  };
}

// Direct (sync) solver creation for Node.js or same-thread usage
export async function create(options: SolverOptions = {}): Promise<Solver> {
  const features = detect();
  const variant = options.variant ?? (features.threads ? "mt" : "st");

  // wasm is inlined as base64 in the mjs (SINGLE_FILE build)
  const mod = variant === "mt"
    ? await import("../dist/highs.mt.mjs")
    : await import("../dist/highs.st.mjs");

  const module = await mod.default();
  return new Solver(module);
}

// Worker-based solver creation for browsers (non-blocking)
export { SolverClient as WorkerSolver } from "./client.ts";

// Re-export for convenience
export { createCApi, type HighsModule, type HighsCApi } from "./c-api.ts";
