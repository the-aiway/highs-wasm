// Lazy entry point: no heavy assets bundled.
// You must supply moduleUrl or workerUrl pointing to the hosted assets.
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
export {
  HiGHSError,
  InfeasibleError,
  UnboundedError,
  TimeLimitError,
  ModelError,
} from "./types.ts";

import { Solver } from "./solver.ts";
import type { SolverOptions, VariantAssetUrl } from "./types.ts";
import type { HighsModule } from "./c-api.ts";
import { resolveVariantUrl } from "./asset-urls.ts";

export async function create(options: SolverOptions & { moduleUrl: VariantAssetUrl }): Promise<Solver> {
  const variant = options.variant ?? "st";
  const moduleUrl = resolveVariantUrl(options.moduleUrl, variant);
  if (!moduleUrl) throw new Error("moduleUrl is required when using highs-wasm/lazy");
  const mod = await import(/* @vite-ignore */ moduleUrl) as { default: (opts?: object) => Promise<HighsModule> };
  const module = await mod.default();
  return new Solver(module, options);
}
