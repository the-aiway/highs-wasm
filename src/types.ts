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
  // Optional integrality: 0=continuous, 1=integer, 2=semi-continuous, 3=semi-integer
  types?: Int32Array;
}

export interface BulkConstraintsOptions {
  lb: Float64Array;
  ub: Float64Array;
  starts: Int32Array;
  indices: Int32Array;
  values: Float64Array;
}

export interface SolveOptions {
  timeLimit?: number;
  presolve?: "on" | "off" | "choose";
  mipRelGap?: number;
  mipMaxNodes?: number;
  threads?: number;
}

export interface Basis {
  colStatus: Int32Array;
  rowStatus: Int32Array;
}

export interface SolveResult {
  status: SolveStatus;
  isOptimal: boolean;
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

  // Basis for warm starting
  getBasis(): Basis;

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
  verbose?: boolean; // Enable HiGHS output (default: false)
}

// Error classes
export class HiGHSError extends Error {
  status: SolveStatus;

  constructor(status: SolveStatus, message?: string) {
    super(message ?? `HiGHS error: ${status}`);
    this.name = "HiGHSError";
    this.status = status;
  }
}

export class InfeasibleError extends HiGHSError {
  override status = "Infeasible" as const;

  constructor(message = "Model is infeasible") {
    super("Infeasible", message);
    this.name = "InfeasibleError";
  }
}

export class UnboundedError extends HiGHSError {
  override status = "Unbounded" as const;

  constructor(message = "Model is unbounded") {
    super("Unbounded", message);
    this.name = "UnboundedError";
  }
}

export class TimeLimitError extends HiGHSError {
  override status = "TimeLimit" as const;

  constructor(message = "Time limit reached without finding a solution") {
    super("TimeLimit", message);
    this.name = "TimeLimitError";
  }
}

export class ModelError extends HiGHSError {
  override status = "ModelError" as const;

  constructor(message = "Model error") {
    super("ModelError", message);
    this.name = "ModelError";
  }
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

export const HighsBasisStatus = {
  Lower: 0,
  Basic: 1,
  Upper: 2,
  Zero: 3,
  NonBasic: 4,
  Super: 5,
} as const;

// Status that indicates an optimal or target-met solution
const OPTIMAL_STATUSES: SolveStatus[] = ["Optimal", "ObjectiveBound", "ObjectiveTarget"];

// Status that indicates a solution exists (possibly suboptimal due to limits)
const HAS_SOLUTION_STATUSES: SolveStatus[] = [
  ...OPTIMAL_STATUSES,
  "TimeLimit",
  "IterationLimit",
  "SolutionLimit",
];

export function isOptimalStatus(status: SolveStatus): boolean {
  return OPTIMAL_STATUSES.includes(status);
}

export function hasSolutionStatus(status: SolveStatus): boolean {
  return HAS_SOLUTION_STATUSES.includes(status);
}

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
