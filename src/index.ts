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

// Runtime detection
const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis;
const isNode = typeof process !== "undefined" && process.versions?.node;
const isBun = typeof process !== "undefined" && process.versions?.bun;

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
    isNode,
    isBun,
  };
}

// Direct (sync) solver creation for Node.js or same-thread usage
export async function create(options: SolverOptions = {}): Promise<Solver> {
  const features = detect();
  const variant = options.variant ?? (features.threads ? "mt" : "st");

  // Use native FFI for Bun if available (much faster than WASM)
  if (isBun && options.variant !== "st") {
    const { nativeAvailable, NativeSolver } = await import("./native.ts");
    if (nativeAvailable) {
      return new NativeSolver() as unknown as Solver;
    }
    // Fallback to Node-compatible WASM if native not available
  }

  // wasm is inlined as base64 in the mjs (SINGLE_FILE build)
  // Use Node-specific build for Node/Bun when MT is requested
  const mod = variant === "mt"
    ? (isNode || isBun)
      ? await import("../dist/highs.mt.node.mjs")
      : await import("../dist/highs.mt.mjs")
    : await import("../dist/highs.st.mjs");

  const module = await mod.default() as HighsModule;
  return new Solver(module, options);
}

// Native FFI solver for Bun (sync, no async needed)
export { NativeSolver, createNative, nativeAvailable } from "./native.ts";

// Worker-based solver creation for browsers (non-blocking)
export { SolverClient as WorkerSolver } from "./client.ts";

// Re-export for convenience
export { createCApi, type HighsModule, type HighsCApi } from "./c-api.ts";
