import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getLibPath() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    if (arch === "arm64") return join(__dirname, "../dist/libhighs-darwin-arm64.dylib");
    if (arch === "x64") return join(__dirname, "../dist/libhighs-darwin-x64.dylib");
    return join(__dirname, "../dist/libhighs.dylib");
  }
  if (platform === "linux") {
    if (arch === "x64") return join(__dirname, "../dist/libhighs-linux-x64.so");
    if (arch === "arm64") return join(__dirname, "../dist/libhighs-linux-arm64.so");
    return join(__dirname, "../dist/libhighs.so");
  }
  return null;
}

const libPath = getLibPath();
export const nativeAvailable = libPath !== null && existsSync(libPath);

if (!nativeAvailable) {
  // Export stubs that throw - actual implementation below is guarded
}

const lib = nativeAvailable ? dlopen(libPath!, {
  Highs_create: { returns: FFIType.ptr },
  Highs_destroy: { args: [FFIType.ptr], returns: FFIType.void },
  Highs_version: { returns: FFIType.cstring },
  Highs_versionMajor: { returns: FFIType.i32 },
  Highs_versionMinor: { returns: FFIType.i32 },
  Highs_versionPatch: { returns: FFIType.i32 },

  Highs_run: { args: [FFIType.ptr], returns: FFIType.i32 },
  Highs_clear: { args: [FFIType.ptr], returns: FFIType.i32 },
  Highs_clearModel: { args: [FFIType.ptr], returns: FFIType.i32 },

  Highs_readModel: { args: [FFIType.ptr, FFIType.cstring], returns: FFIType.i32 },
  Highs_writeModel: { args: [FFIType.ptr, FFIType.cstring], returns: FFIType.i32 },

  Highs_passLp: {
    args: [
      FFIType.ptr,    // highs
      FFIType.i32,    // num_col
      FFIType.i32,    // num_row
      FFIType.i32,    // num_nz
      FFIType.i32,    // a_format
      FFIType.i32,    // sense
      FFIType.f64,    // offset
      FFIType.ptr,    // col_cost
      FFIType.ptr,    // col_lower
      FFIType.ptr,    // col_upper
      FFIType.ptr,    // row_lower
      FFIType.ptr,    // row_upper
      FFIType.ptr,    // a_start
      FFIType.ptr,    // a_index
      FFIType.ptr,    // a_value
    ],
    returns: FFIType.i32,
  },

  Highs_passMip: {
    args: [
      FFIType.ptr,    // highs
      FFIType.i32,    // num_col
      FFIType.i32,    // num_row
      FFIType.i32,    // num_nz
      FFIType.i32,    // a_format
      FFIType.i32,    // sense
      FFIType.f64,    // offset
      FFIType.ptr,    // col_cost
      FFIType.ptr,    // col_lower
      FFIType.ptr,    // col_upper
      FFIType.ptr,    // row_lower
      FFIType.ptr,    // row_upper
      FFIType.ptr,    // a_start
      FFIType.ptr,    // a_index
      FFIType.ptr,    // a_value
      FFIType.ptr,    // integrality
    ],
    returns: FFIType.i32,
  },

  Highs_addVar: {
    args: [FFIType.ptr, FFIType.f64, FFIType.f64],
    returns: FFIType.i32,
  },

  Highs_addCol: {
    args: [
      FFIType.ptr,    // highs
      FFIType.f64,    // cost
      FFIType.f64,    // lower
      FFIType.f64,    // upper
      FFIType.i32,    // num_new_nz
      FFIType.ptr,    // index
      FFIType.ptr,    // value
    ],
    returns: FFIType.i32,
  },

  Highs_addRow: {
    args: [
      FFIType.ptr,    // highs
      FFIType.f64,    // lower
      FFIType.f64,    // upper
      FFIType.i32,    // num_new_nz
      FFIType.ptr,    // index
      FFIType.ptr,    // value
    ],
    returns: FFIType.i32,
  },

  Highs_addRows: {
    args: [
      FFIType.ptr,    // highs
      FFIType.i32,    // num_new_row
      FFIType.ptr,    // lower
      FFIType.ptr,    // upper
      FFIType.i32,    // num_new_nz
      FFIType.ptr,    // starts
      FFIType.ptr,    // index
      FFIType.ptr,    // value
    ],
    returns: FFIType.i32,
  },

  Highs_changeColCost: {
    args: [FFIType.ptr, FFIType.i32, FFIType.f64],
    returns: FFIType.i32,
  },

  Highs_changeColBounds: {
    args: [FFIType.ptr, FFIType.i32, FFIType.f64, FFIType.f64],
    returns: FFIType.i32,
  },

  Highs_changeColIntegrality: {
    args: [FFIType.ptr, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },

  Highs_changeObjectiveSense: {
    args: [FFIType.ptr, FFIType.i32],
    returns: FFIType.i32,
  },

  Highs_setBoolOptionValue: {
    args: [FFIType.ptr, FFIType.cstring, FFIType.i32],
    returns: FFIType.i32,
  },

  Highs_setIntOptionValue: {
    args: [FFIType.ptr, FFIType.cstring, FFIType.i32],
    returns: FFIType.i32,
  },

  Highs_setDoubleOptionValue: {
    args: [FFIType.ptr, FFIType.cstring, FFIType.f64],
    returns: FFIType.i32,
  },

  Highs_setStringOptionValue: {
    args: [FFIType.ptr, FFIType.cstring, FFIType.cstring],
    returns: FFIType.i32,
  },

  Highs_getNumCol: { args: [FFIType.ptr], returns: FFIType.i32 },
  Highs_getNumRow: { args: [FFIType.ptr], returns: FFIType.i32 },
  Highs_getNumNz: { args: [FFIType.ptr], returns: FFIType.i32 },

  Highs_getModelStatus: { args: [FFIType.ptr], returns: FFIType.i32 },

  Highs_getObjectiveValue: { args: [FFIType.ptr], returns: FFIType.f64 },

  Highs_getSolution: {
    args: [
      FFIType.ptr,    // highs
      FFIType.ptr,    // col_value
      FFIType.ptr,    // col_dual
      FFIType.ptr,    // row_value
      FFIType.ptr,    // row_dual
    ],
    returns: FFIType.i32,
  },

  Highs_getBasis: {
    args: [
      FFIType.ptr,    // highs
      FFIType.ptr,    // col_status
      FFIType.ptr,    // row_status
    ],
    returns: FFIType.i32,
  },

  Highs_setBasis: {
    args: [
      FFIType.ptr,    // highs
      FFIType.ptr,    // col_status
      FFIType.ptr,    // row_status
    ],
    returns: FFIType.i32,
  },
}) : null;

// Constants
const kHighsObjSenseMinimize = 1;
const kHighsObjSenseMaximize = -1;
const kHighsMatrixFormatRowwise = 2;
const kHighsVarTypeContinuous = 0;
const kHighsVarTypeInteger = 1;

const MODEL_STATUS = [
  "NotSet",
  "LoadError",
  "ModelError",
  "PresolveError",
  "SolveError",
  "PostsolveError",
  "ModelEmpty",
  "Optimal",
  "Infeasible",
  "UnboundedOrInfeasible",
  "Unbounded",
  "ObjectiveBound",
  "ObjectiveTarget",
  "TimeLimit",
  "IterationLimit",
  "Unknown",
  "SolutionLimit",
  "Interrupt",
] as const;

export class NativeSolver {
  private highs: Pointer;
  private numCols = 0;
  private numRows = 0;
  #lib: NonNullable<typeof lib>;

  constructor() {
    if (!lib) throw new Error("Native HiGHS library not available for this platform");
    this.#lib = lib;
    this.highs = this.#lib.symbols.Highs_create() as Pointer;
    if (!this.highs) throw new Error("Failed to create HiGHS instance");
  }

  version() {
    const major = this.#lib.symbols.Highs_versionMajor() as number;
    const minor = this.#lib.symbols.Highs_versionMinor() as number;
    const patch = this.#lib.symbols.Highs_versionPatch() as number;
    return `${major}.${minor}.${patch}`;
  }

  get numCol() {
    return this.#lib.symbols.Highs_getNumCol(this.highs) as number;
  }

  get numRow() {
    return this.#lib.symbols.Highs_getNumRow(this.highs) as number;
  }

  getNumCols() { return this.numCol; }
  getNumRows() { return this.numRow; }

  addVars(opts: { lb: Float64Array; ub: Float64Array; costs?: Float64Array; types?: Int32Array }) {
    const n = opts.lb.length;
    const first = this.numCols;
    for (let i = 0; i < n; i++) {
      const colIdx = this.numCols++;
      const status = this.#lib.symbols.Highs_addCol(this.highs, opts.costs?.[i] ?? 0, opts.lb[i]!, opts.ub[i]!, 0, null, null);
      if (status !== 0) throw new Error(`Failed to add variable ${colIdx}: status ${status}`);
      if (opts.types && opts.types[i] === kHighsVarTypeInteger) {
        this.#lib.symbols.Highs_changeColIntegrality(this.highs, colIdx, kHighsVarTypeInteger);
      }
    }
    return first;
  }

  addVar(opts: { lb?: number; ub?: number; cost?: number; type?: "continuous" | "integer" } = {}) {
    const lb = opts.lb ?? 0;
    const ub = opts.ub ?? Infinity;
    const cost = opts.cost ?? 0;

    const colIdx = this.numCols++;

    const status = this.#lib.symbols.Highs_addCol(
      this.highs,
      cost,
      lb,
      ub,
      0,      // num_new_nz
      null,   // index
      null,   // value
    );

    if (status !== 0) throw new Error(`Failed to add variable: status ${status}`);

    if (opts.type === "integer") {
      this.#lib.symbols.Highs_changeColIntegrality(this.highs, colIdx, kHighsVarTypeInteger);
    }

    return colIdx;
  }

  addConstraint(opts: {
    terms?: [number, number][];
    vars?: number[];
    coeffs?: number[];
    lb?: number;
    ub?: number;
  }) {
    const vars = opts.vars ?? opts.terms?.map(t => t[0]) ?? [];
    const coeffs = opts.coeffs ?? opts.terms?.map(t => t[1]) ?? [];
    const lb = opts.lb ?? -Infinity;
    const ub = opts.ub ?? Infinity;

    const rowIdx = this.numRows++;

    const indexArr = new Int32Array(vars);
    const valueArr = new Float64Array(coeffs);

    const status = this.#lib.symbols.Highs_addRow(
      this.highs,
      lb,
      ub,
      vars.length,
      ptr(indexArr),
      ptr(valueArr),
    );

    if (status !== 0) throw new Error(`Failed to add constraint: status ${status}`);

    return rowIdx;
  }

  setObjectiveSense(sense: "minimize" | "maximize") {
    const senseVal = sense === "maximize" ? kHighsObjSenseMaximize : kHighsObjSenseMinimize;
    this.#lib.symbols.Highs_changeObjectiveSense(this.highs, senseVal);
  }

  setOption(name: string, value: number | string | boolean) {
    const cname = Buffer.from(name + "\0");
    if (typeof value === "boolean") {
      this.#lib.symbols.Highs_setBoolOptionValue(this.highs, ptr(cname), value ? 1 : 0);
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        this.#lib.symbols.Highs_setIntOptionValue(this.highs, ptr(cname), value);
      } else {
        this.#lib.symbols.Highs_setDoubleOptionValue(this.highs, ptr(cname), value);
      }
    } else {
      const cval = Buffer.from(value + "\0");
      this.#lib.symbols.Highs_setStringOptionValue(this.highs, ptr(cname), ptr(cval));
    }
  }

  solve(opts?: { timeLimit?: number; presolve?: string; mipRelGap?: number; threads?: number }) {
    if (opts?.timeLimit !== undefined) this.setOption("time_limit", opts.timeLimit);
    if (opts?.presolve) this.setOption("presolve", opts.presolve);
    if (opts?.mipRelGap !== undefined) this.setOption("mip_rel_gap", opts.mipRelGap);
    if (opts?.threads !== undefined) this.setOption("threads", opts.threads);

    const status = this.#lib.symbols.Highs_run(this.highs);
    // 0 = OK, 1 = Warning (e.g. time limit with feasible solution), 2+ = Error
    if (status > 1) throw new Error(`Solve failed with status ${status}`);

    const modelStatus = this.#lib.symbols.Highs_getModelStatus(this.highs) as number;
    const statusName = MODEL_STATUS[modelStatus] ?? "Unknown";
    const objectiveValue = this.#lib.symbols.Highs_getObjectiveValue(this.highs) as number;

    const numCols = this.numCol;
    const numRows = this.numRow;

    const colValue = new Float64Array(numCols);
    const colDual = new Float64Array(numCols);
    const rowValue = new Float64Array(numRows);
    const rowDual = new Float64Array(numRows);

    this.#lib.symbols.Highs_getSolution(
      this.highs,
      ptr(colValue),
      ptr(colDual),
      ptr(rowValue),
      ptr(rowDual),
    );

    return {
      status: statusName,
      isOptimal: modelStatus === 7,
      objectiveValue,
      value: (v: number) => colValue[v],
      dual: (c: number) => rowDual[c],
      primalValues: () => colValue,
      dualValues: () => rowDual,
    };
  }

  clear() {
    this.#lib.symbols.Highs_clearModel(this.highs);
    this.numCols = 0;
    this.numRows = 0;
  }

  reset() {
    this.#lib.symbols.Highs_clear(this.highs);
    this.numCols = 0;
    this.numRows = 0;
  }

  [Symbol.dispose]() {
    if (this.highs) {
      this.#lib.symbols.Highs_destroy(this.highs);
      this.highs = null as unknown as Pointer;
    }
  }

  [Symbol.asyncDispose]() {
    this[Symbol.dispose]();
    return Promise.resolve();
  }
}

export function createNative() {
  return new NativeSolver();
}
