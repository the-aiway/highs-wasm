import type { HighsModule, HighsCApi } from "./c-api.ts";
import {
  createCApi,
  allocString,
  allocFloat64Array,
  allocInt32Array,
  readFloat64Array,
  readInt32Array,
} from "./c-api.ts";
import type {
  VarRef,
  ConRef,
  AddVarOptions,
  AddConstraintOptions,
  BulkVarsOptions,
  BulkConstraintsOptions,
  SolveResult,
  SolveOptions,
  SolverOptions,
  ObjectiveSense,
  ProgressUpdate,
  StreamingSolve,
  ProgressController,
  Basis,
  SolveStatus,
} from "./types.ts";
import {
  HighsStatus,
  HighsVarType,
  HighsInfoType,
  HighsCallbackType,
  HiGHSError,
  InfeasibleError,
  UnboundedError,
  TimeLimitError,
  ModelError,
  modelStatusToString,
  varTypeToHighs,
  sensToHighs,
  isOptimalStatus,
  hasSolutionStatus,
} from "./types.ts";

export class Solver implements Disposable {
  #module: HighsModule;
  #api: HighsCApi;
  #ptr: number;
  #disposed = false;
  #numCols = 0;
  #numRows = 0;

  constructor(module: HighsModule, options: SolverOptions = {}) {
    this.#module = module;
    this.#api = createCApi(module);
    this.#ptr = this.#api.create();
    if (!this.#ptr) {
      throw new Error("Failed to create HiGHS instance");
    }
    // Suppress HiGHS output by default unless verbose
    if (!options.verbose) {
      this.setOption("output_flag", false);
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

  // Bulk add variables with optional integrality
  addVars(options: BulkVarsOptions): VarRef {
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

    // Set costs if provided
    if (costs) {
      for (let i = 0; i < n; i++) {
        const c = costs[i];
        if (c !== undefined && c !== 0) {
          this.#api.changeColCost(this.#ptr, startIdx + i, c);
        }
      }
    }

    // Set integrality if provided - use bulk API
    if (types) {
      if (types.length !== n) {
        throw new Error("types array must have same length as lb/ub");
      }
      const typesPtr = allocInt32Array(this.#module, types);
      this.#api.changeColsIntegralityByRange(this.#ptr, startIdx, startIdx + n - 1, typesPtr);
      this.#freePtr(typesPtr);
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

  // Delete rows by index array
  deleteRows(indices: number[] | Int32Array): void {
    this.#checkDisposed();
    const arr = indices instanceof Int32Array ? indices : new Int32Array(indices);
    const ptr = allocInt32Array(this.#module, arr);
    const status = this.#api.deleteRowsBySet(this.#ptr, arr.length, ptr);
    this.#freePtr(ptr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to delete rows: status ${status}`);
    }
    // Update row count
    this.#numRows = this.#api.getNumRow(this.#ptr);
  }

  // Delete cols by index array
  deleteCols(indices: number[] | Int32Array): void {
    this.#checkDisposed();
    const arr = indices instanceof Int32Array ? indices : new Int32Array(indices);
    const ptr = allocInt32Array(this.#module, arr);
    const status = this.#api.deleteColsBySet(this.#ptr, arr.length, ptr);
    this.#freePtr(ptr);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to delete cols: status ${status}`);
    }
    // Update col count
    this.#numCols = this.#api.getNumCol(this.#ptr);
  }

  // Model modification methods
  changeColCost(v: VarRef, cost: number): void {
    this.#checkDisposed();
    const status = this.#api.changeColCost(this.#ptr, v, cost);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change col cost: status ${status}`);
    }
  }

  changeColBounds(v: VarRef, bounds: { lb?: number; ub?: number }): void {
    this.#checkDisposed();
    // Need to get current bounds if not both provided
    const lb = bounds.lb ?? 0;
    const ub = bounds.ub ?? Infinity;
    const status = this.#api.changeColBounds(this.#ptr, v, lb, ub);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change col bounds: status ${status}`);
    }
  }

  changeRowBounds(c: ConRef, bounds: { lb?: number; ub?: number }): void {
    this.#checkDisposed();
    const lb = bounds.lb ?? -Infinity;
    const ub = bounds.ub ?? Infinity;
    const status = this.#api.changeRowBounds(this.#ptr, c, lb, ub);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change row bounds: status ${status}`);
    }
  }

  changeCoeff(c: ConRef, v: VarRef, value: number): void {
    this.#checkDisposed();
    const status = this.#api.changeCoeff(this.#ptr, c, v, value);
    if (status !== HighsStatus.Ok) {
      throw new Error(`Failed to change coefficient: status ${status}`);
    }
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

  // Apply solve options temporarily
  #applySolveOptions(opts: SolveOptions) {
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

  // Internal solve that returns result or throws
  #solveInternal(): SolveResult {
    const runStatus = this.#api.run(this.#ptr);
    if (runStatus === HighsStatus.Error) {
      throw new Error("Solver error during run");
    }

    const modelStatus = this.#api.getModelStatus(this.#ptr);
    const statusStr = modelStatusToString(modelStatus);
    const numCols = this.#api.getNumCol(this.#ptr);
    const numRows = this.#api.getNumRow(this.#ptr);

    // Check if we have a solution
    if (!hasSolutionStatus(statusStr)) {
      // No solution - throw appropriate error
      switch (statusStr) {
        case "Infeasible":
          throw new InfeasibleError();
        case "UnboundedOrInfeasible":
          throw new InfeasibleError("Model is unbounded or infeasible");
        case "Unbounded":
          throw new UnboundedError();
        case "TimeLimit":
          throw new TimeLimitError();
        case "IterationLimit":
          throw new HiGHSError("IterationLimit", "Iteration limit reached without finding a solution");
        case "ModelError":
        case "LoadError":
          throw new ModelError();
        default:
          throw new HiGHSError(statusStr, `Solve failed with status: ${statusStr}`);
      }
    }

    const objectiveValue = this.#api.getObjectiveValue(this.#ptr);

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
      status: statusStr,
      isOptimal: isOptimalStatus(statusStr),
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

      getBasis(): Basis {
        const colStatusPtr = module._malloc(numCols * 4);
        const rowStatusPtr = module._malloc(numRows * 4);
        api.getBasis(ptr, colStatusPtr, rowStatusPtr);
        const colStatus = readInt32Array(module, colStatusPtr, numCols);
        const rowStatus = readInt32Array(module, rowStatusPtr, numRows);
        module._free(colStatusPtr);
        module._free(rowStatusPtr);
        return { colStatus, rowStatus };
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

  // Solve the model
  solve(opts: SolveOptions = {}): SolveResult {
    this.#checkDisposed();
    this.#applySolveOptions(opts);
    return this.#solveInternal();
  }

  // Streaming solve with MIP progress (for MIP models)
  solveStreaming(opts: SolveOptions = {}): StreamingSolve {
    this.#checkDisposed();
    this.#applySolveOptions(opts);

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
      const runningTime = this.#module.getValue(dataOut, "double");
      const _objective = this.#module.getValue(dataOut + 8, "double");
      const nodeCount = this.#module.getValue(dataOut + 16, "i32");
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
        return this.#solveInternal();
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

  // Set basis for warm starting
  setBasis(basis: Basis): void {
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

  // Clear the model (keep settings)
  clear() {
    this.#checkDisposed();
    this.#api.clearModel(this.#ptr);
    this.#numCols = 0;
    this.#numRows = 0;
  }

  // Reset everything including options
  reset() {
    this.#checkDisposed();
    this.#api.clearSolver(this.#ptr);
    this.#api.clearModel(this.#ptr);
    this.#numCols = 0;
    this.#numRows = 0;
  }

  // Load model from LP/MPS string without solving
  loadModel(modelString: string, format: "lp" | "mps" = "lp"): void {
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
      throw new ModelError(`Failed to read model: status ${readStatus}`);
    }

    // Update col/row counts from loaded model
    this.#numCols = this.#api.getNumCol(this.#ptr);
    this.#numRows = this.#api.getNumRow(this.#ptr);
  }

  // Solve from LP/MPS string (backward-compat with highs-js)
  solveModel(modelString: string, format: "lp" | "mps" = "lp"): SolveResult {
    this.loadModel(modelString, format);
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

  // Alias for spec compatibility
  getNumCols(): number {
    return this.#numCols;
  }

  getNumRows(): number {
    return this.#numRows;
  }
}
