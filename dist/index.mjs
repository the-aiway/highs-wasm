var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/c-api.ts
function createCApi(module) {
  const { cwrap } = module;
  return {
    create: cwrap("Highs_create", "number", []),
    destroy: cwrap("Highs_destroy", null, ["number"]),
    run: cwrap("Highs_run", "number", ["number"]),
    clear: cwrap("Highs_clear", "number", ["number"]),
    clearModel: cwrap("Highs_clearModel", "number", ["number"]),
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
    changeColCost: cwrap("Highs_changeColCost", "number", ["number", "number", "number"]),
    changeColBounds: cwrap("Highs_changeColBounds", "number", ["number", "number", "number", "number"]),
    changeRowBounds: cwrap("Highs_changeRowBounds", "number", ["number", "number", "number", "number"]),
    changeCoeff: cwrap("Highs_changeCoeff", "number", ["number", "number", "number", "number"]),
    changeObjectiveSense: cwrap("Highs_changeObjectiveSense", "number", ["number", "number"]),
    changeObjectiveOffset: cwrap("Highs_changeObjectiveOffset", "number", ["number", "number"]),
    changeColIntegrality: cwrap("Highs_changeColIntegrality", "number", ["number", "number", "number"]),
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

// src/types.ts
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

// src/solver.ts
class Solver {
  #module;
  #api;
  #ptr;
  #disposed = false;
  #numCols = 0;
  #numRows = 0;
  constructor(module) {
    this.#module = module;
    this.#api = createCApi(module);
    this.#ptr = this.#api.create();
    if (!this.#ptr) {
      throw new Error("Failed to create HiGHS instance");
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
    const { lb, ub, costs } = options;
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
  solve() {
    this.#checkDisposed();
    const runStatus = this.#api.run(this.#ptr);
    if (runStatus === HighsStatus.Error) {
      throw new Error("Solver error during run");
    }
    const modelStatus = this.#api.getModelStatus(this.#ptr);
    const objectiveValue = this.#api.getObjectiveValue(this.#ptr);
    const numCols = this.#api.getNumCol(this.#ptr);
    const numRows = this.#api.getNumRow(this.#ptr);
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
      status: modelStatusToString(modelStatus),
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
  solveStreaming() {
    this.#checkDisposed();
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
      const objective = this.#module.getValue(dataOut + 8, "double");
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
        const result = this.solve();
        return result;
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
  clearModel() {
    this.#checkDisposed();
    this.#api.clearModel(this.#ptr);
    this.#numCols = 0;
    this.#numRows = 0;
  }
  solveModel(modelString, format = "lp") {
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
      throw new Error(`Failed to read model: status ${readStatus}`);
    }
    this.#numCols = this.#api.getNumCol(this.#ptr);
    this.#numRows = this.#api.getNumRow(this.#ptr);
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
}
// src/client.ts
class SolverClient {
  #worker;
  #messageId = 0;
  #pending = new Map;
  #streamingHandlers = new Map;
  #disposed = false;
  #initPromise;
  constructor(options = {}) {
    const variant = options.variant ?? (detectThreadSupport() ? "mt" : "st");
    this.#worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module"
    });
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
      const { id, ok, result, error } = data;
      const handler = this.#pending.get(id);
      if (handler) {
        this.#pending.delete(id);
        if (ok) {
          handler.resolve(result);
        } else {
          handler.reject(new Error(error));
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
    this.#initPromise = this.#send("init", { variant });
  }
  async#send(cmd, params = {}) {
    if (this.#disposed) {
      throw new Error("SolverClient has been disposed");
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
        costs: options.costs?.buffer
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
  async solve() {
    await this.#initPromise;
    const result = await this.#send("solve");
    const primalValues = new Float64Array(result.primalValues);
    const dualValues = new Float64Array(result.dualValues);
    return {
      status: result.status,
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
      info(_key) {
        return NaN;
      }
    };
  }
  async clearModel() {
    await this.#initPromise;
    await this.#send("clearModel");
  }
  async version() {
    await this.#initPromise;
    return this.#send("version");
  }
  solveStreaming() {
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
      this.#worker.postMessage({ id, cmd: "solveStreaming" });
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
        const primalValues = new Float64Array(result.primalValues);
        const dualValues = new Float64Array(result.dualValues);
        resolve({
          status: result.status,
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
          info(_key) {
            return NaN;
          }
        });
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
    this.#worker.terminate();
  }
}
function detectThreadSupport() {
  return typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined" && globalThis.crossOriginIsolated === true;
}
// src/index.ts
function detect() {
  return {
    threads: typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined" && globalThis.crossOriginIsolated === true,
    simd: WebAssembly.validate(new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      5,
      1,
      96,
      0,
      1,
      123,
      3,
      2,
      1,
      0,
      10,
      10,
      1,
      8,
      0,
      65,
      0,
      253,
      15,
      253,
      98,
      11
    ])),
    exceptions: WebAssembly.validate(new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      4,
      1,
      96,
      0,
      0,
      3,
      2,
      1,
      0,
      10,
      8,
      1,
      6,
      0,
      6,
      64,
      7,
      0,
      11,
      11
    ]))
  };
}
async function create(options = {}) {
  const features = detect();
  const variant = options.variant ?? (features.threads ? "mt" : "st");
  const mod = variant === "mt" ? await import("./highs.mt.mjs") : await import("./highs.st.mjs");
  const module = await mod.default();
  return new Solver(module);
}
export {
  detect,
  createCApi,
  create,
  SolverClient as WorkerSolver,
  SolverClient,
  Solver
};
