// Branded types for type safety
declare const VarRefBrand: unique symbol;
declare const ConRefBrand: unique symbol;

export type VarRef = number & { readonly [VarRefBrand]: true };
export type ConRef = number & { readonly [ConRefBrand]: true };

export type VarType = "continuous" | "integer" | "semi-continuous" | "semi-integer";
export type ObjectiveSense = "minimize" | "maximize";

export type SolveStatus =
  | "NotSet"
  | "LoadError"
  | "ModelError"
  | "PresolveError"
  | "SolveError"
  | "PostsolveError"
  | "ModelEmpty"
  | "Optimal"
  | "Infeasible"
  | "UnboundedOrInfeasible"
  | "Unbounded"
  | "ObjectiveBound"
  | "ObjectiveTarget"
  | "TimeLimit"
  | "IterationLimit"
  | "Unknown"
  | "SolutionLimit"
  | "Interrupt";

export interface AddVarOptions {
  lb?: number;
  ub?: number;
  cost?: number;
  type?: VarType;
  name?: string;
}

export interface AddConstraintOptions {
  // Explicit parallel arrays form
  vars?: VarRef[];
  coeffs?: number[];
  // Or compact tuple form
  terms?: [VarRef, number][];
  // Bounds
  lb?: number;
  ub?: number;
  name?: string;
}

export interface BulkVarsOptions {
  lb: Float64Array;
  ub: Float64Array;
  costs?: Float64Array;
}

export interface BulkConstraintsOptions {
  lb: Float64Array;
  ub: Float64Array;
  starts: Int32Array;
  indices: Int32Array;
  values: Float64Array;
}

export interface SolveResult {
  status: SolveStatus;
  objectiveValue: number;

  // Per-variable access
  value(v: VarRef): number;
  reducedCost(v: VarRef): number;

  // Per-constraint access
  dual(c: ConRef): number;
  slack(c: ConRef): number;

  // Bulk extraction
  primalValues(): Float64Array;
  dualValues(): Float64Array;

  // Solve info
  info(key: string): number | string;
}

export interface ProgressUpdate {
  iteration: number;
  objective: number;
  bound: number;
  gap: number;
  nodes: number;
  elapsed: number;
}

export interface ProgressController {
  [Symbol.asyncIterator](): AsyncIterator<ProgressUpdate>;
  cancel(): void;
}

export interface StreamingSolve {
  solution: Promise<SolveResult>;
  progress: ProgressController;
}

export interface SolverOptions {
  variant?: "st" | "mt";
}

// HiGHS constants
export const HighsStatus = {
  Error: -1,
  Ok: 0,
  Warning: 1,
} as const;

export const HighsVarType = {
  Continuous: 0,
  Integer: 1,
  SemiContinuous: 2,
  SemiInteger: 3,
} as const;

export const HighsObjSense = {
  Minimize: 1,
  Maximize: -1,
} as const;

export const HighsMatrixFormat = {
  Colwise: 1,
  Rowwise: 2,
} as const;

export const HighsModelStatus = {
  NotSet: 0,
  LoadError: 1,
  ModelError: 2,
  PresolveError: 3,
  SolveError: 4,
  PostsolveError: 5,
  ModelEmpty: 6,
  Optimal: 7,
  Infeasible: 8,
  UnboundedOrInfeasible: 9,
  Unbounded: 10,
  ObjectiveBound: 11,
  ObjectiveTarget: 12,
  TimeLimit: 13,
  IterationLimit: 14,
  Unknown: 15,
  SolutionLimit: 16,
  Interrupt: 17,
} as const;

export const HighsInfoType = {
  Int64: -1,
  Int: 1,
  Double: 2,
} as const;

export const HighsCallbackType = {
  Logging: 0,
  SimplexInterrupt: 1,
  IpmInterrupt: 2,
  MipSolution: 3,
  MipImprovingSolution: 4,
  MipLogging: 5,
  MipInterrupt: 6,
} as const;

export function modelStatusToString(status: number): SolveStatus {
  const map: Record<number, SolveStatus> = {
    0: "NotSet",
    1: "LoadError",
    2: "ModelError",
    3: "PresolveError",
    4: "SolveError",
    5: "PostsolveError",
    6: "ModelEmpty",
    7: "Optimal",
    8: "Infeasible",
    9: "UnboundedOrInfeasible",
    10: "Unbounded",
    11: "ObjectiveBound",
    12: "ObjectiveTarget",
    13: "TimeLimit",
    14: "IterationLimit",
    15: "Unknown",
    16: "SolutionLimit",
    17: "Interrupt",
  };
  return map[status] ?? "Unknown";
}

export function varTypeToHighs(type: VarType): number {
  switch (type) {
    case "continuous": return HighsVarType.Continuous;
    case "integer": return HighsVarType.Integer;
    case "semi-continuous": return HighsVarType.SemiContinuous;
    case "semi-integer": return HighsVarType.SemiInteger;
  }
}

export function sensToHighs(sense: ObjectiveSense): number {
  return sense === "maximize" ? HighsObjSense.Maximize : HighsObjSense.Minimize;
}
