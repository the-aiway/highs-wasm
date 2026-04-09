export { Solver } from "./solver.ts";
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

export {
  HiGHSError,
  InfeasibleError,
  UnboundedError,
  TimeLimitError,
  ModelError,
} from "./types.ts";

export { NativeSolver, createNative, nativeAvailable } from "./native.ts";
export { createCApi, type HighsModule, type HighsCApi } from "./c-api.ts";

import { Solver } from "./solver.ts";
import { nativeAvailable, NativeSolver } from "./native.ts";
import type { SolverOptions } from "./types.ts";
import type { HighsModule } from "./c-api.ts";

export function detect() {
  return {
    threads: typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined",
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
    isNode: typeof process !== "undefined" && !!process.versions?.node,
    isBun: typeof process !== "undefined" && !!process.versions?.bun,
  };
}

export async function create(options: SolverOptions = {}): Promise<Solver> {
  const features = detect();
  const variant = options.variant ?? (features.threads ? "mt" : "st");

  if (variant !== "st" && nativeAvailable) {
    return new NativeSolver() as unknown as Solver;
  }

  const mod: { default: (opts?: object) => Promise<HighsModule> } = variant === "mt"
    ? await import("../dist/highs.mt.node.mjs")
    : await import("../dist/highs.st.mjs");

  const module = await mod.default() as HighsModule;
  return new Solver(module, options);
}
