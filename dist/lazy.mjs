// src/types.ts
class HiGHSError extends Error {
  status;
  constructor(status, message) {
    super(message ?? `HiGHS error: ${status}`);
    this.name = "HiGHSError";
    this.status = status;
  }
}

class InfeasibleError extends HiGHSError {
  status = "Infeasible";
  constructor(message = "Model is infeasible") {
    super("Infeasible", message);
    this.name = "InfeasibleError";
  }
}

class UnboundedError extends HiGHSError {
  status = "Unbounded";
  constructor(message = "Model is unbounded") {
    super("Unbounded", message);
    this.name = "UnboundedError";
  }
}

class TimeLimitError extends HiGHSError {
  status = "TimeLimit";
  constructor(message = "Time limit reached without finding a solution") {
    super("TimeLimit", message);
    this.name = "TimeLimitError";
  }
}

class ModelError extends HiGHSError {
  status = "ModelError";
  constructor(message = "Model error") {
    super("ModelError", message);
    this.name = "ModelError";
  }
}
var HighsStatus = {
  Error: -1,
  Ok: 0,
  Warning: 1
};
var HighsVarType = {
  Continuous: 0,
  Integer: 1,
  SemiContinuous: 2,
  SemiInteger: 3
};
var HighsObjSense = {
  Minimize: 1,
  Maximize: -1
};
var HighsInfoType = {
  Int64: -1,
  Int: 1,
  Double: 2
};
var HighsCallbackType = {
  Logging: 0,
  SimplexInterrupt: 1,
  IpmInterrupt: 2,
  MipSolution: 3,
  MipImprovingSolution: 4,
  MipLogging: 5,
  MipInterrupt: 6
};
var OPTIMAL_STATUSES = ["Optimal", "ObjectiveBound", "ObjectiveTarget"];
var HAS_SOLUTION_STATUSES = [
  ...OPTIMAL_STATUSES,
  "TimeLimit",
  "IterationLimit",
  "SolutionLimit"
];
function isOptimalStatus(status) {
  return OPTIMAL_STATUSES.includes(status);
}
function hasSolutionStatus(status) {
  return HAS_SOLUTION_STATUSES.includes(status);
}
function modelStatusToString(status) {
  const map = {
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
    17: "Interrupt"
  };
  return map[status] ?? "Unknown";
}
function varTypeToHighs(type) {
  switch (type) {
    case "continuous":
      return HighsVarType.Continuous;
    case "integer":
      return HighsVarType.Integer;
    case "semi-continuous":
      return HighsVarType.SemiContinuous;
    case "semi-integer":
      return HighsVarType.SemiInteger;
  }
}
function sensToHighs(sense) {
  return sense === "maximize" ? HighsObjSense.Maximize : HighsObjSense.Minimize;
}

// src/asset-urls.ts
function resolveVariantUrl(urlOpt, variant) {
  if (urlOpt == null)
    return;
  if (typeof urlOpt === "string" || urlOpt instanceof URL)
    return String(urlOpt);
  return urlOpt[variant] != null ? String(urlOpt[variant]) : undefined;
}
function defaultWorkerUrl(variant) {
  return new URL(`./worker.${variant}.js`, import.meta.url).href;
}

// src/client.ts
function reconstructResult(result) {
  const primalValues = new Float64Array(result.primalValues);
  const dualValues = new Float64Array(result.dualValues);
  return {
    status: result.status,
    isOptimal: result.isOptimal,
    objectiveValue: result.objectiveValue,
    value(v) {
      return primalValues[v] ?? NaN;
    },
    reducedCost(_v) {
      return NaN;
    },
    dual(c) {
      return dualValues[c] ?? NaN;
    },
    slack(_c) {
      return NaN;
    },
    primalValues() {
      return primalValues.slice();
    },
    dualValues() {
      return dualValues.slice();
    },
    getBasis() {
      return result.basis;
    },
    info(_key) {
      return NaN;
    }
  };
}
function reconstructError(errorClass, message) {
  switch (errorClass) {
    case "InfeasibleError":
      return new InfeasibleError(message);
    case "UnboundedError":
      return new UnboundedError(message);
    case "TimeLimitError":
      return new TimeLimitError(message);
    case "ModelError":
      return new ModelError(message);
    case "HiGHSError":
      return new HiGHSError("Unknown", message);
    default:
      return new Error(message);
  }
}

class SolverClient {
  #worker = null;
  #messageId = 0;
  #pending = new Map;
  #streamingHandlers = new Map;
  #disposed = false;
  #initPromise;
  #options;
  constructor(options = {}) {
    this.#options = options;
    this.#initPromise = this.#init();
  }
  async#init() {
    const variant = this.#options.variant ?? (detectThreadSupport() ? "mt" : "st");
    const workerUrl = resolveVariantUrl(this.#options.workerUrl, variant) ?? defaultWorkerUrl(variant);
    this.#worker = new Worker(workerUrl, { type: "module" });
    this.#worker.onmessage = (e) => {
      const data = e.data;
      if (data.type === "progress") {
        const handler2 = this.#streamingHandlers.get(data.id);
        if (handler2) {
          handler2.onProgress(data.update);
        }
        return;
      }
      if (data.type === "complete") {
        const handler2 = this.#streamingHandlers.get(data.id);
        if (handler2) {
          this.#streamingHandlers.delete(data.id);
          handler2.onComplete(data.result);
        }
        return;
      }
      const { id, ok, result, error, errorClass } = data;
      const handler = this.#pending.get(id);
      if (handler) {
        this.#pending.delete(id);
        if (ok) {
          handler.resolve(result);
        } else {
          handler.reject(reconstructError(errorClass, error));
        }
      }
    };
    this.#worker.onerror = (e) => {
      for (const handler of this.#pending.values()) {
        handler.reject(new Error(e.message));
      }
      this.#pending.clear();
      for (const handler of this.#streamingHandlers.values()) {
        handler.onError(new Error(e.message));
      }
      this.#streamingHandlers.clear();
    };
    await this.#send("init", { verbose: this.#options.verbose });
  }
  async#send(cmd, params = {}) {
    if (this.#disposed) {
      throw new Error("SolverClient has been disposed");
    }
    if (!this.#worker) {
      throw new Error("Worker not initialized");
    }
    const id = this.#messageId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ id, cmd, ...params });
    });
  }
  async ready() {
    await this.#initPromise;
  }
  async addVar(options = {}) {
    await this.#initPromise;
    return this.#send("addVar", { options });
  }
  async addVars(options) {
    await this.#initPromise;
    const msg = {
      options: {
        lb: options.lb.buffer,
        ub: options.ub.buffer,
        costs: options.costs?.buffer,
        types: options.types?.buffer
      }
    };
    return this.#send("addVars", msg);
  }
  async addConstraint(options) {
    await this.#initPromise;
    return this.#send("addConstraint", { options });
  }
  async addConstraints(options) {
    await this.#initPromise;
    const msg = {
      options: {
        lb: options.lb.buffer,
        ub: options.ub.buffer,
        starts: options.starts.buffer,
        indices: options.indices.buffer,
        values: options.values.buffer
      }
    };
    return this.#send("addConstraints", msg);
  }
  async setObjectiveSense(sense) {
    await this.#initPromise;
    await this.#send("setObjectiveSense", { sense });
  }
  async setOption(name, value) {
    await this.#initPromise;
    await this.#send("setOption", { name, value });
  }
  async solve(opts = {}) {
    await this.#initPromise;
    const result = await this.#send("solve", { options: opts });
    return reconstructResult(result);
  }
  async clear() {
    await this.#initPromise;
    await this.#send("clear");
  }
  async reset() {
    await this.#initPromise;
    await this.#send("reset");
  }
  async loadModel(modelString, format = "lp") {
    await this.#initPromise;
    await this.#send("loadModel", { modelString, format });
  }
  async solveModel(modelString, format = "lp") {
    await this.#initPromise;
    const result = await this.#send("solveModel", { modelString, format });
    return reconstructResult(result);
  }
  async setBasis(basis) {
    await this.#initPromise;
    await this.#send("setBasis", { basis });
  }
  async changeColCost(v, cost) {
    await this.#initPromise;
    await this.#send("changeColCost", { v, cost });
  }
  async changeColBounds(v, bounds) {
    await this.#initPromise;
    await this.#send("changeColBounds", { v, bounds });
  }
  async changeRowBounds(c, bounds) {
    await this.#initPromise;
    await this.#send("changeRowBounds", { c, bounds });
  }
  async changeCoeff(c, v, value) {
    await this.#initPromise;
    await this.#send("changeCoeff", { c, v, value });
  }
  async deleteRows(indices) {
    await this.#initPromise;
    await this.#send("deleteRows", { indices });
  }
  async deleteCols(indices) {
    await this.#initPromise;
    await this.#send("deleteCols", { indices });
  }
  async getNumCols() {
    await this.#initPromise;
    return this.#send("getNumCols");
  }
  async getNumRows() {
    await this.#initPromise;
    return this.#send("getNumRows");
  }
  async version() {
    await this.#initPromise;
    return this.#send("version");
  }
  solveStreaming(opts = {}) {
    const id = this.#messageId++;
    const updates = [];
    let cancelled = false;
    let resolveWait = null;
    let completed = false;
    let resolveComplete = null;
    let rejectComplete = null;
    this.#streamingHandlers.set(id, {
      onProgress: (update) => {
        if (cancelled)
          return;
        updates.push(update);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      },
      onComplete: (result) => {
        completed = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
        if (resolveComplete) {
          resolveComplete(result);
        }
      },
      onError: (error) => {
        completed = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
        if (rejectComplete) {
          rejectComplete(error);
        }
      }
    });
    this.#initPromise.then(() => {
      this.#worker.postMessage({ id, cmd: "solveStreaming", options: opts });
    });
    const progress = {
      cancel: () => {
        cancelled = true;
        this.#send("cancelSolve").catch(() => {});
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      },
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () => {
            if (index < updates.length) {
              return { value: updates[index++], done: false };
            }
            if (completed || cancelled) {
              return { value: undefined, done: true };
            }
            await new Promise((resolve) => {
              resolveWait = resolve;
            });
            if (index < updates.length) {
              return { value: updates[index++], done: false };
            }
            return { value: undefined, done: true };
          }
        };
      }
    };
    const solution = new Promise((resolve, reject) => {
      resolveComplete = (result) => {
        resolve(reconstructResult(result));
      };
      rejectComplete = reject;
    });
    return { solution, progress };
  }
  [Symbol.dispose]() {
    if (this.#disposed)
      return;
    this.#disposed = true;
    this.#send("dispose").catch(() => {});
    this.#worker?.terminate();
  }
}
function detectThreadSupport() {
  return typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined" && globalThis.crossOriginIsolated === true;
}
// src/c-api.ts
function createCApi(module) {
  const { cwrap } = module;
  return {
    create: cwrap("Highs_create", "number", []),
    destroy: cwrap("Highs_destroy", null, ["number"]),
    run: cwrap("Highs_run", "number", ["number"]),
    clear: cwrap("Highs_clear", "number", ["number"]),
    clearModel: cwrap("Highs_clearModel", "number", ["number"]),
    clearSolver: cwrap("Highs_clearSolver", "number", ["number"]),
    readModel: cwrap("Highs_readModel", "number", ["number", "number"]),
    writeModel: cwrap("Highs_writeModel", "number", ["number", "number"]),
    passLp: cwrap("Highs_passLp", "number", [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ]),
    passMip: cwrap("Highs_passMip", "number", [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ]),
    addVar: cwrap("Highs_addVar", "number", ["number", "number", "number"]),
    addVars: cwrap("Highs_addVars", "number", ["number", "number", "number", "number"]),
    addCol: cwrap("Highs_addCol", "number", [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ]),
    addCols: cwrap("Highs_addCols", "number", [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ]),
    addRow: cwrap("Highs_addRow", "number", [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ]),
    addRows: cwrap("Highs_addRows", "number", [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ]),
    deleteRowsBySet: cwrap("Highs_deleteRowsBySet", "number", ["number", "number", "number"]),
    deleteColsBySet: cwrap("Highs_deleteColsBySet", "number", ["number", "number", "number"]),
    changeColCost: cwrap("Highs_changeColCost", "number", ["number", "number", "number"]),
    changeColBounds: cwrap("Highs_changeColBounds", "number", ["number", "number", "number", "number"]),
    changeRowBounds: cwrap("Highs_changeRowBounds", "number", ["number", "number", "number", "number"]),
    changeCoeff: cwrap("Highs_changeCoeff", "number", ["number", "number", "number", "number"]),
    changeObjectiveSense: cwrap("Highs_changeObjectiveSense", "number", ["number", "number"]),
    changeObjectiveOffset: cwrap("Highs_changeObjectiveOffset", "number", ["number", "number"]),
    changeColIntegrality: cwrap("Highs_changeColIntegrality", "number", ["number", "number", "number"]),
    changeColsIntegralityByRange: cwrap("Highs_changeColsIntegralityByRange", "number", ["number", "number", "number", "number"]),
    getNumCol: cwrap("Highs_getNumCol", "number", ["number"]),
    getNumRow: cwrap("Highs_getNumRow", "number", ["number"]),
    getNumNz: cwrap("Highs_getNumNz", "number", ["number"]),
    getObjectiveValue: cwrap("Highs_getObjectiveValue", "number", ["number"]),
    getSolution: cwrap("Highs_getSolution", "number", [
      "number",
      "number",
      "number",
      "number",
      "number"
    ]),
    getBasis: cwrap("Highs_getBasis", "number", ["number", "number", "number"]),
    setBasis: cwrap("Highs_setBasis", "number", ["number", "number", "number"]),
    getModelStatus: cwrap("Highs_getModelStatus", "number", ["number"]),
    getIntInfoValue: cwrap("Highs_getIntInfoValue", "number", ["number", "number", "number"]),
    getDoubleInfoValue: cwrap("Highs_getDoubleInfoValue", "number", ["number", "number", "number"]),
    getInt64InfoValue: cwrap("Highs_getInt64InfoValue", "number", ["number", "number", "number"]),
    getInfoType: cwrap("Highs_getInfoType", "number", ["number", "number", "number"]),
    setBoolOptionValue: cwrap("Highs_setBoolOptionValue", "number", ["number", "number", "number"]),
    setIntOptionValue: cwrap("Highs_setIntOptionValue", "number", ["number", "number", "number"]),
    setDoubleOptionValue: cwrap("Highs_setDoubleOptionValue", "number", ["number", "number", "number"]),
    setStringOptionValue: cwrap("Highs_setStringOptionValue", "number", ["number", "number", "number"]),
    setCallback: cwrap("Highs_setCallback", "number", ["number", "number", "number"]),
    startCallback: cwrap("Highs_startCallback", "number", ["number", "number"]),
    stopCallback: cwrap("Highs_stopCallback", "number", ["number", "number"]),
    version: cwrap("Highs_version", "number", []),
    getRunTime: cwrap("Highs_getRunTime", "number", ["number"]),
    passColName: cwrap("Highs_passColName", "number", ["number", "number", "number"]),
    passRowName: cwrap("Highs_passRowName", "number", ["number", "number", "number"])
  };
}
function allocString(module, str) {
  const len = module.lengthBytesUTF8(str) + 1;
  const ptr = module._malloc(len);
  module.stringToUTF8(str, ptr, len);
  return ptr;
}
function allocFloat64Array(module, arr) {
  const bytes = arr.length * 8;
  const ptr = module._malloc(bytes);
  const data = arr instanceof Float64Array ? arr : new Float64Array(arr);
  module.HEAPF64.set(data, ptr / 8);
  return ptr;
}
function allocInt32Array(module, arr) {
  const bytes = arr.length * 4;
  const ptr = module._malloc(bytes);
  const data = arr instanceof Int32Array ? arr : new Int32Array(arr);
  module.HEAP32.set(data, ptr / 4);
  return ptr;
}
function readFloat64Array(module, ptr, length) {
  return module.HEAPF64.slice(ptr / 8, ptr / 8 + length);
}
function readInt32Array(module, ptr, length) {
  return module.HEAP32.slice(ptr / 4, ptr / 4 + length);
}

// src/solver.ts
class Solver {
  #module;
  #api;
  #ptr;
  #disposed = false;
  #numCols = 0;
  #numRows = 0;
  constructor(module, options = {}) {
    this.#module = module;
    this.#api = createCApi(module);
    this.#ptr = this.#api.create();
    if (!this.#ptr) {
      throw new Error("Failed to create HiGHS instance");
    }
    if (!options.verbose) {
      this.setOption("output_flag", false);
    }
    Solver.#registry.register(this, { ptr: this.#ptr, api: this.#api }, this);
  }
  static #registry = new FinalizationRegistry(({ ptr, api }) => {
    api.destroy(ptr);
  });
  [Symbol.dispose]() {
    if (this.#disposed)
      return;
    this.#disposed = true;
    Solver.#registry.unregister(this);
    this.#api.destroy(this.#ptr);
  }
  #checkDisposed() {
    if (this.#disposed) {
      throw new Error("Solver has been disposed");
    }
  }
  #allocString(str) {
    return allocString(this.#module, str);
  }
  #freePtr(ptr) {
    this.#module._free(ptr);
  }
  addVar(options = {}) {
    this.#checkDisposed();
    const { lb = 0, ub = Infinity, cost = 0, type, name } = options;
    const colIdx = this.#numCols;
    const status = this.#api.addVar(this.#ptr, lb, ub);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to add variable: status ${status}`);
    }
    this.#numCols++;
    if (cost !== 0) {
      this.#api.changeColCost(this.#ptr, colIdx, cost);
    }
    if (type && type !== "continuous") {
      this.#api.changeColIntegrality(this.#ptr, colIdx, varTypeToHighs(type));
    }
    if (name) {
      const namePtr = this.#allocString(name);
      this.#api.passColName(this.#ptr, colIdx, namePtr);
      this.#freePtr(namePtr);
    }
    return colIdx;
  }
  addVars(options) {
    this.#checkDisposed();
    const { lb, ub, costs, types } = options;
    const n = lb.length;
    if (ub.length !== n) {
      throw new Error("lb and ub must have same length");
    }
    const lbPtr = allocFloat64Array(this.#module, lb);
    const ubPtr = allocFloat64Array(this.#module, ub);
    const startIdx = this.#numCols;
    const status = this.#api.addVars(this.#ptr, n, lbPtr, ubPtr);
    this.#freePtr(lbPtr);
    this.#freePtr(ubPtr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to add variables: status ${status}`);
    }
    this.#numCols += n;
    if (costs) {
      for (let i = 0;i < n; i++) {
        const c = costs[i];
        if (c !== undefined && c !== 0) {
          this.#api.changeColCost(this.#ptr, startIdx + i, c);
        }
      }
    }
    if (types) {
      if (types.length !== n) {
        throw new Error("types array must have same length as lb/ub");
      }
      const typesPtr = allocInt32Array(this.#module, types);
      this.#api.changeColsIntegralityByRange(this.#ptr, startIdx, startIdx + n - 1, typesPtr);
      this.#freePtr(typesPtr);
    }
    return startIdx;
  }
  addConstraint(options) {
    this.#checkDisposed();
    const { lb = -Infinity, ub = Infinity, name } = options;
    let indices;
    let values;
    if (options.terms) {
      indices = options.terms.map(([v]) => v);
      values = options.terms.map(([, c]) => c);
    } else if (options.vars && options.coeffs) {
      indices = options.vars;
      values = options.coeffs;
    } else {
      throw new Error("Must provide either terms or vars+coeffs");
    }
    const numNz = indices.length;
    const indexPtr = allocInt32Array(this.#module, indices);
    const valuePtr = allocFloat64Array(this.#module, values);
    const rowIdx = this.#numRows;
    const status = this.#api.addRow(this.#ptr, lb, ub, numNz, indexPtr, valuePtr);
    this.#freePtr(indexPtr);
    this.#freePtr(valuePtr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to add constraint: status ${status}`);
    }
    this.#numRows++;
    if (name) {
      const namePtr = this.#allocString(name);
      this.#api.passRowName(this.#ptr, rowIdx, namePtr);
      this.#freePtr(namePtr);
    }
    return rowIdx;
  }
  addConstraints(options) {
    this.#checkDisposed();
    const { lb, ub, starts, indices, values } = options;
    const numRows = lb.length;
    const lbPtr = allocFloat64Array(this.#module, lb);
    const ubPtr = allocFloat64Array(this.#module, ub);
    const startsPtr = allocInt32Array(this.#module, starts);
    const indicesPtr = allocInt32Array(this.#module, indices);
    const valuesPtr = allocFloat64Array(this.#module, values);
    const startIdx = this.#numRows;
    const status = this.#api.addRows(this.#ptr, numRows, lbPtr, ubPtr, values.length, startsPtr, indicesPtr, valuesPtr);
    this.#freePtr(lbPtr);
    this.#freePtr(ubPtr);
    this.#freePtr(startsPtr);
    this.#freePtr(indicesPtr);
    this.#freePtr(valuesPtr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to add constraints: status ${status}`);
    }
    this.#numRows += numRows;
    return startIdx;
  }
  deleteRows(indices) {
    this.#checkDisposed();
    const arr = indices instanceof Int32Array ? indices : new Int32Array(indices);
    const ptr = allocInt32Array(this.#module, arr);
    const status = this.#api.deleteRowsBySet(this.#ptr, arr.length, ptr);
    this.#freePtr(ptr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to delete rows: status ${status}`);
    }
    this.#numRows = this.#api.getNumRow(this.#ptr);
  }
  deleteCols(indices) {
    this.#checkDisposed();
    const arr = indices instanceof Int32Array ? indices : new Int32Array(indices);
    const ptr = allocInt32Array(this.#module, arr);
    const status = this.#api.deleteColsBySet(this.#ptr, arr.length, ptr);
    this.#freePtr(ptr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to delete cols: status ${status}`);
    }
    this.#numCols = this.#api.getNumCol(this.#ptr);
  }
  changeColCost(v, cost) {
    this.#checkDisposed();
    const status = this.#api.changeColCost(this.#ptr, v, cost);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change col cost: status ${status}`);
    }
  }
  changeColBounds(v, bounds) {
    this.#checkDisposed();
    const lb = bounds.lb ?? 0;
    const ub = bounds.ub ?? Infinity;
    const status = this.#api.changeColBounds(this.#ptr, v, lb, ub);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change col bounds: status ${status}`);
    }
  }
  changeRowBounds(c, bounds) {
    this.#checkDisposed();
    const lb = bounds.lb ?? -Infinity;
    const ub = bounds.ub ?? Infinity;
    const status = this.#api.changeRowBounds(this.#ptr, c, lb, ub);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change row bounds: status ${status}`);
    }
  }
  changeCoeff(c, v, value) {
    this.#checkDisposed();
    const status = this.#api.changeCoeff(this.#ptr, c, v, value);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change coefficient: status ${status}`);
    }
  }
  setObjectiveSense(sense) {
    this.#checkDisposed();
    const status = this.#api.changeObjectiveSense(this.#ptr, sensToHighs(sense));
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to set objective sense: status ${status}`);
    }
  }
  setOption(name, value) {
    this.#checkDisposed();
    const namePtr = this.#allocString(name);
    let status;
    if (typeof value === "boolean") {
      status = this.#api.setBoolOptionValue(this.#ptr, namePtr, value ? 1 : 0);
    } else if (typeof value === "string") {
      const valuePtr = this.#allocString(value);
      status = this.#api.setStringOptionValue(this.#ptr, namePtr, valuePtr);
      this.#freePtr(valuePtr);
    } else if (Number.isInteger(value)) {
      status = this.#api.setIntOptionValue(this.#ptr, namePtr, value);
    } else {
      status = this.#api.setDoubleOptionValue(this.#ptr, namePtr, value);
    }
    this.#freePtr(namePtr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to set option "${name}": status ${status}`);
    }
  }
  #applySolveOptions(opts) {
    if (opts.timeLimit !== undefined) {
      this.setOption("time_limit", opts.timeLimit);
    }
    if (opts.presolve !== undefined) {
      this.setOption("presolve", opts.presolve);
    }
    if (opts.mipRelGap !== undefined) {
      this.setOption("mip_rel_gap", opts.mipRelGap);
    }
    if (opts.mipMaxNodes !== undefined) {
      this.setOption("mip_max_nodes", opts.mipMaxNodes);
    }
    if (opts.threads !== undefined) {
      this.setOption("threads", opts.threads);
    }
  }
  #solveInternal() {
    const runStatus = this.#api.run(this.#ptr);
    if (runStatus === HighsStatus.Error) {
      throw new Error("Solver error during run");
    }
    const modelStatus = this.#api.getModelStatus(this.#ptr);
    const statusStr = modelStatusToString(modelStatus);
    const numCols = this.#api.getNumCol(this.#ptr);
    const numRows = this.#api.getNumRow(this.#ptr);
    if (!hasSolutionStatus(statusStr)) {
      switch (statusStr) {
        case "Infeasible":
          throw new InfeasibleError;
        case "UnboundedOrInfeasible":
          throw new InfeasibleError("Model is unbounded or infeasible");
        case "Unbounded":
          throw new UnboundedError;
        case "TimeLimit":
          throw new TimeLimitError;
        case "IterationLimit":
          throw new HiGHSError("IterationLimit", "Iteration limit reached without finding a solution");
        case "ModelError":
        case "LoadError":
          throw new ModelError;
        default:
          throw new HiGHSError(statusStr, `Solve failed with status: ${statusStr}`);
      }
    }
    const objectiveValue = this.#api.getObjectiveValue(this.#ptr);
    const colValuePtr = this.#module._malloc(numCols * 8);
    const colDualPtr = this.#module._malloc(numCols * 8);
    const rowValuePtr = this.#module._malloc(numRows * 8);
    const rowDualPtr = this.#module._malloc(numRows * 8);
    this.#api.getSolution(this.#ptr, colValuePtr, colDualPtr, rowValuePtr, rowDualPtr);
    const colValues = readFloat64Array(this.#module, colValuePtr, numCols);
    const colDuals = readFloat64Array(this.#module, colDualPtr, numCols);
    const rowValues = readFloat64Array(this.#module, rowValuePtr, numRows);
    const rowDuals = readFloat64Array(this.#module, rowDualPtr, numRows);
    this.#freePtr(colValuePtr);
    this.#freePtr(colDualPtr);
    this.#freePtr(rowValuePtr);
    this.#freePtr(rowDualPtr);
    const module = this.#module;
    const api = this.#api;
    const ptr = this.#ptr;
    return {
      status: statusStr,
      isOptimal: isOptimalStatus(statusStr),
      objectiveValue,
      value(v) {
        return colValues[v] ?? NaN;
      },
      reducedCost(v) {
        return colDuals[v] ?? NaN;
      },
      dual(c) {
        return rowDuals[c] ?? NaN;
      },
      slack(c) {
        return rowValues[c] ?? NaN;
      },
      primalValues() {
        return colValues.slice();
      },
      dualValues() {
        return rowDuals.slice();
      },
      getBasis() {
        const colStatusPtr = module._malloc(numCols * 4);
        const rowStatusPtr = module._malloc(numRows * 4);
        api.getBasis(ptr, colStatusPtr, rowStatusPtr);
        const colStatus = readInt32Array(module, colStatusPtr, numCols);
        const rowStatus = readInt32Array(module, rowStatusPtr, numRows);
        module._free(colStatusPtr);
        module._free(rowStatusPtr);
        return { colStatus, rowStatus };
      },
      info(key) {
        const keyPtr = allocString(module, key);
        const typePtr = module._malloc(4);
        api.getInfoType(ptr, keyPtr, typePtr);
        const infoType = module.getValue(typePtr, "i32");
        module._free(typePtr);
        const valuePtr = module._malloc(8);
        let result;
        if (infoType === HighsInfoType.Double) {
          api.getDoubleInfoValue(ptr, keyPtr, valuePtr);
          result = module.getValue(valuePtr, "double");
        } else if (infoType === HighsInfoType.Int64) {
          api.getInt64InfoValue(ptr, keyPtr, valuePtr);
          result = module.getValue(valuePtr, "i64");
        } else {
          api.getIntInfoValue(ptr, keyPtr, valuePtr);
          result = module.getValue(valuePtr, "i32");
        }
        module._free(keyPtr);
        module._free(valuePtr);
        return result;
      }
    };
  }
  solve(opts = {}) {
    this.#checkDisposed();
    this.#applySolveOptions(opts);
    return this.#solveInternal();
  }
  solveStreaming(opts = {}) {
    this.#checkDisposed();
    this.#applySolveOptions(opts);
    const updates = [];
    let cancelled = false;
    let resolveWait = null;
    let solveComplete = false;
    const callbackFn = (callbackType, _message, dataOut, _dataIn, _userData) => {
      if (cancelled)
        return;
      if (callbackType !== HighsCallbackType.MipLogging)
        return;
      const runningTime = this.#module.getValue(dataOut, "double");
      const _objective = this.#module.getValue(dataOut + 8, "double");
      const nodeCount = this.#module.getValue(dataOut + 16, "i32");
      const primalBound = this.#module.getValue(dataOut + 24, "double");
      const dualBound = this.#module.getValue(dataOut + 32, "double");
      const gap = this.#module.getValue(dataOut + 40, "double");
      const update = {
        iteration: nodeCount,
        objective: primalBound,
        bound: dualBound,
        gap,
        nodes: nodeCount,
        elapsed: runningTime
      };
      updates.push(update);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };
    const callbackPtr = this.#module.addFunction(callbackFn, "viiiii");
    this.#api.setCallback(this.#ptr, callbackPtr, 0);
    this.#api.startCallback(this.#ptr, HighsCallbackType.MipLogging);
    const progress = {
      cancel: () => {
        cancelled = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      },
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () => {
            if (index < updates.length) {
              return { value: updates[index++], done: false };
            }
            if (solveComplete || cancelled) {
              return { value: undefined, done: true };
            }
            await new Promise((resolve) => {
              resolveWait = resolve;
            });
            if (index < updates.length) {
              return { value: updates[index++], done: false };
            }
            return { value: undefined, done: true };
          }
        };
      }
    };
    const solution = Promise.resolve().then(() => {
      try {
        return this.#solveInternal();
      } finally {
        solveComplete = true;
        this.#api.stopCallback(this.#ptr, HighsCallbackType.MipLogging);
        this.#module.removeFunction(callbackPtr);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      }
    });
    return { solution, progress };
  }
  setBasis(basis) {
    this.#checkDisposed();
    const colStatusPtr = allocInt32Array(this.#module, basis.colStatus);
    const rowStatusPtr = allocInt32Array(this.#module, basis.rowStatus);
    const status = this.#api.setBasis(this.#ptr, colStatusPtr, rowStatusPtr);
    this.#freePtr(colStatusPtr);
    this.#freePtr(rowStatusPtr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to set basis: status ${status}`);
    }
  }
  clear() {
    this.#checkDisposed();
    this.#api.clearModel(this.#ptr);
    this.#numCols = 0;
    this.#numRows = 0;
  }
  reset() {
    this.#checkDisposed();
    this.#api.clearSolver(this.#ptr);
    this.#api.clearModel(this.#ptr);
    this.#numCols = 0;
    this.#numRows = 0;
  }
  loadModel(modelString, format = "lp") {
    this.#checkDisposed();
    const filename = `/model.${format}`;
    const FS = this.#module.FS;
    if (!FS) {
      throw new Error("Filesystem not available in this build");
    }
    FS.writeFile(filename, modelString);
    const filenamePtr = this.#allocString(filename);
    const readStatus = this.#api.readModel(this.#ptr, filenamePtr);
    this.#freePtr(filenamePtr);
    try {
      FS.unlink(filename);
    } catch {}
    if (readStatus !== HighsStatus.Ok) {
      throw new ModelError(`Failed to read model: status ${readStatus}`);
    }
    this.#numCols = this.#api.getNumCol(this.#ptr);
    this.#numRows = this.#api.getNumRow(this.#ptr);
  }
  solveModel(modelString, format = "lp") {
    this.loadModel(modelString, format);
    return this.solve();
  }
  version() {
    const versionPtr = this.#api.version();
    return this.#module.UTF8ToString(versionPtr);
  }
  get numCols() {
    return this.#numCols;
  }
  get numRows() {
    return this.#numRows;
  }
  getNumCols() {
    return this.#numCols;
  }
  getNumRows() {
    return this.#numRows;
  }
}

// src/lazy.ts
async function create(options) {
  const variant = options.variant ?? "st";
  const moduleUrl = resolveVariantUrl(options.moduleUrl, variant);
  if (!moduleUrl)
    throw new Error("moduleUrl is required when using highs-wasm/lazy");
  const mod = await import(moduleUrl);
  const module = await mod.default();
  return new Solver(module, options);
}
export {
  create,
  UnboundedError,
  TimeLimitError,
  SolverClient,
  ModelError,
  InfeasibleError,
  HiGHSError
};
