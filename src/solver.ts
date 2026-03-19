import type { HighsModule, HighsCApi } from "./c-api.ts";
import {
  createCApi,
  allocString,
  allocFloat64Array,
  allocInt32Array,
  readFloat64Array,
} from "./c-api.ts";
import type {
  VarRef,
  ConRef,
  AddVarOptions,
  AddConstraintOptions,
  BulkVarsOptions,
  BulkConstraintsOptions,
  SolveResult,
  ObjectiveSense,
  ProgressUpdate,
  StreamingSolve,
  ProgressController,
} from "./types.ts";
import {
  HighsStatus,
  HighsVarType,
  HighsObjSense,
  HighsMatrixFormat,
  HighsInfoType,
  HighsCallbackType,
  modelStatusToString,
  varTypeToHighs,
  sensToHighs,
} from "./types.ts";

export class Solver implements Disposable {
  #module: HighsModule;
  #api: HighsCApi;
  #ptr: number;
  #disposed = false;
  #numCols = 0;
  #numRows = 0;

  constructor(module: HighsModule) {
    this.#module = module;
    this.#api = createCApi(module);
    this.#ptr = this.#api.create();
    if (!this.#ptr) {
      throw new Error("Failed to create HiGHS instance");
    }
    // Register for GC cleanup
    Solver.#registry.register(this, { ptr: this.#ptr, api: this.#api }, this);
  }

  static #registry = new FinalizationRegistry<{ ptr: number; api: HighsCApi }>(
    ({ ptr, api }) => {
      api.destroy(ptr);
    }
  );

  [Symbol.dispose]() {
    if (this.#disposed) return;
    this.#disposed = true;
    Solver.#registry.unregister(this);
    this.#api.destroy(this.#ptr);
  }

  #checkDisposed() {
    if (this.#disposed) {
      throw new Error("Solver has been disposed");
    }
  }

  #allocString(str: string): number {
    return allocString(this.#module, str);
  }

  #freePtr(ptr: number) {
    this.#module._free(ptr);
  }

  // Add a variable
  addVar(options: AddVarOptions = {}): VarRef {
    this.#checkDisposed();
    const { lb = 0, ub = Infinity, cost = 0, type, name } = options;

    const colIdx = this.#numCols;
    const status = this.#api.addVar(this.#ptr, lb, ub);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to add variable: status ${status}`);
    }
    this.#numCols++;

    // Set cost
    if (cost !== 0) {
      this.#api.changeColCost(this.#ptr, colIdx, cost);
    }

    // Set integrality
    if (type && type !== "continuous") {
      this.#api.changeColIntegrality(this.#ptr, colIdx, varTypeToHighs(type));
    }

    // Set name
    if (name) {
      const namePtr = this.#allocString(name);
      this.#api.passColName(this.#ptr, colIdx, namePtr);
      this.#freePtr(namePtr);
    }

    return colIdx as VarRef;
  }

  // Bulk add variables
  addVars(options: BulkVarsOptions): VarRef {
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

    // Set costs if provided
    if (costs) {
      for (let i = 0; i < n; i++) {
        const c = costs[i];
        if (c !== undefined && c !== 0) {
          this.#api.changeColCost(this.#ptr, startIdx + i, c);
        }
      }
    }

    return startIdx as VarRef;
  }

  // Add a constraint
  addConstraint(options: AddConstraintOptions): ConRef {
    this.#checkDisposed();
    const { lb = -Infinity, ub = Infinity, name } = options;

    let indices: number[];
    let values: number[];

    if (options.terms) {
      indices = options.terms.map(([v]) => v);
      values = options.terms.map(([, c]) => c);
    } else if (options.vars && options.coeffs) {
      indices = options.vars as number[];
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

    // Set name
    if (name) {
      const namePtr = this.#allocString(name);
      this.#api.passRowName(this.#ptr, rowIdx, namePtr);
      this.#freePtr(namePtr);
    }

    return rowIdx as ConRef;
  }

  // Bulk add constraints (CSR format)
  addConstraints(options: BulkConstraintsOptions): ConRef {
    this.#checkDisposed();
    const { lb, ub, starts, indices, values } = options;
    const numRows = lb.length;

    const lbPtr = allocFloat64Array(this.#module, lb);
    const ubPtr = allocFloat64Array(this.#module, ub);
    const startsPtr = allocInt32Array(this.#module, starts);
    const indicesPtr = allocInt32Array(this.#module, indices);
    const valuesPtr = allocFloat64Array(this.#module, values);

    const startIdx = this.#numRows;
    const status = this.#api.addRows(
      this.#ptr,
      numRows,
      lbPtr,
      ubPtr,
      values.length,
      startsPtr,
      indicesPtr,
      valuesPtr
    );

    this.#freePtr(lbPtr);
    this.#freePtr(ubPtr);
    this.#freePtr(startsPtr);
    this.#freePtr(indicesPtr);
    this.#freePtr(valuesPtr);

    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to add constraints: status ${status}`);
    }

    this.#numRows += numRows;
    return startIdx as ConRef;
  }

  // Set objective sense
  setObjectiveSense(sense: ObjectiveSense) {
    this.#checkDisposed();
    const status = this.#api.changeObjectiveSense(this.#ptr, sensToHighs(sense));
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to set objective sense: status ${status}`);
    }
  }

  // Set an option
  setOption(name: string, value: number | string | boolean) {
    this.#checkDisposed();
    const namePtr = this.#allocString(name);

    let status: number;
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

  // Solve the model
  solve(): SolveResult {
    this.#checkDisposed();

    const runStatus = this.#api.run(this.#ptr);
    if (runStatus === HighsStatus.Error) {
      throw new Error("Solver error during run");
    }

    const modelStatus = this.#api.getModelStatus(this.#ptr);
    const objectiveValue = this.#api.getObjectiveValue(this.#ptr);
    const numCols = this.#api.getNumCol(this.#ptr);
    const numRows = this.#api.getNumRow(this.#ptr);

    // Allocate solution arrays
    const colValuePtr = this.#module._malloc(numCols * 8);
    const colDualPtr = this.#module._malloc(numCols * 8);
    const rowValuePtr = this.#module._malloc(numRows * 8);
    const rowDualPtr = this.#module._malloc(numRows * 8);

    this.#api.getSolution(this.#ptr, colValuePtr, colDualPtr, rowValuePtr, rowDualPtr);

    // Copy solution data
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

      value(v: VarRef): number {
        return colValues[v] ?? NaN;
      },

      reducedCost(v: VarRef): number {
        return colDuals[v] ?? NaN;
      },

      dual(c: ConRef): number {
        return rowDuals[c] ?? NaN;
      },

      slack(c: ConRef): number {
        return rowValues[c] ?? NaN;
      },

      primalValues(): Float64Array {
        return colValues.slice();
      },

      dualValues(): Float64Array {
        return rowDuals.slice();
      },

      info(key: string): number | string {
        const keyPtr = allocString(module, key);
        const typePtr = module._malloc(4);

        api.getInfoType(ptr, keyPtr, typePtr);
        const infoType = module.getValue(typePtr, "i32");
        module._free(typePtr);

        const valuePtr = module._malloc(8);
        let result: number | string;

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
      },
    };
  }

  // Streaming solve with MIP progress (for MIP models)
  solveStreaming(): StreamingSolve {
    this.#checkDisposed();

    const updates: ProgressUpdate[] = [];
    let cancelled = false;
    let resolveWait: (() => void) | null = null;
    let solveComplete = false;

    // Create a callback function for MIP progress
    const callbackFn = (
      callbackType: number,
      _message: number,
      dataOut: number,
      _dataIn: number,
      _userData: number
    ) => {
      if (cancelled) return;

      // Only handle MIP logging callbacks
      if (callbackType !== HighsCallbackType.MipLogging) return;

      // Read fields from HighsCallbackDataOut struct
      // The struct has fields at specific offsets (check HiGHS source for exact layout)
      // running_time: double at offset 0
      // objective_function_value: double
      // mip_node_count: int64
      // mip_primal_bound: double
      // mip_dual_bound: double
      // mip_gap: double

      const runningTime = this.#module.getValue(dataOut, "double");
      const objective = this.#module.getValue(dataOut + 8, "double");
      const nodeCount = this.#module.getValue(dataOut + 16, "i32"); // Simplified: read as i32
      const primalBound = this.#module.getValue(dataOut + 24, "double");
      const dualBound = this.#module.getValue(dataOut + 32, "double");
      const gap = this.#module.getValue(dataOut + 40, "double");

      const update: ProgressUpdate = {
        iteration: nodeCount,
        objective: primalBound,
        bound: dualBound,
        gap: gap,
        nodes: nodeCount,
        elapsed: runningTime,
      };

      updates.push(update);

      // Wake up any waiting consumer
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    // Register callback with emscripten
    // Signature: void(int, char*, void*, void*, void*) -> "vipppp"
    const callbackPtr = this.#module.addFunction(callbackFn, "viiiii");

    // Set and start the callback
    this.#api.setCallback(this.#ptr, callbackPtr, 0);
    this.#api.startCallback(this.#ptr, HighsCallbackType.MipLogging);

    // Create progress async iterator
    const progress: ProgressController = {
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
          next: async (): Promise<IteratorResult<ProgressUpdate>> => {
            // Return any buffered updates first
            if (index < updates.length) {
              return { value: updates[index++], done: false };
            }

            // If solve is complete or cancelled, we're done
            if (solveComplete || cancelled) {
              return { value: undefined as any, done: true };
            }

            // Wait for more updates
            await new Promise<void>((resolve) => {
              resolveWait = resolve;
            });

            // Check again after waking
            if (index < updates.length) {
              return { value: updates[index++], done: false };
            }

            return { value: undefined as any, done: true };
          },
        };
      },
    };

    // Run solve in microtask to allow progress iteration to start
    const solution = Promise.resolve().then(() => {
      try {
        const result = this.solve();
        return result;
      } finally {
        solveComplete = true;

        // Stop callback and cleanup
        this.#api.stopCallback(this.#ptr, HighsCallbackType.MipLogging);
        this.#module.removeFunction(callbackPtr);

        // Wake up any waiting consumer
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      }
    });

    return { solution, progress };
  }

  // Clear the model (keep settings)
  clearModel() {
    this.#checkDisposed();
    this.#api.clearModel(this.#ptr);
    this.#numCols = 0;
    this.#numRows = 0;
  }

  // Solve from LP/MPS string (backward-compat with highs-js)
  solveModel(modelString: string, format: "lp" | "mps" = "lp"): SolveResult {
    this.#checkDisposed();

    const filename = `/model.${format}`;
    const FS = (this.#module as any).FS;
    if (!FS) {
      throw new Error("Filesystem not available in this build");
    }

    // Write model to emscripten virtual FS
    FS.writeFile(filename, modelString);

    // Read model into HiGHS
    const filenamePtr = this.#allocString(filename);
    const readStatus = this.#api.readModel(this.#ptr, filenamePtr);
    this.#freePtr(filenamePtr);

    // Clean up temp file
    try { FS.unlink(filename); } catch {}

    if (readStatus !== HighsStatus.Ok) {
      throw new Error(`Failed to read model: status ${readStatus}`);
    }

    // Update col/row counts from loaded model
    this.#numCols = this.#api.getNumCol(this.#ptr);
    this.#numRows = this.#api.getNumRow(this.#ptr);

    return this.solve();
  }

  // Get version string
  version(): string {
    const versionPtr = this.#api.version();
    return this.#module.UTF8ToString(versionPtr);
  }

  // Get number of columns
  get numCols(): number {
    return this.#numCols;
  }

  // Get number of rows
  get numRows(): number {
    return this.#numRows;
  }
}
