// Main thread client that communicates with the worker
import type {
  VarRef,
  ConRef,
  AddVarOptions,
  AddConstraintOptions,
  BulkVarsOptions,
  BulkConstraintsOptions,
  ObjectiveSense,
  SolveResult,
  SolveOptions,
  SolverOptions,
  SolverVariant,
  VariantAssetUrl,
  ProgressUpdate,
  StreamingSolve,
  ProgressController,
  Basis,
  SolveStatus,
} from "./types.ts";
import {
  HiGHSError,
  InfeasibleError,
  UnboundedError,
  TimeLimitError,
  ModelError,
  isOptimalStatus,
} from "./types.ts";
import { defaultWorkerUrl, resolveVariantUrl } from "./asset-urls.ts";

interface SerializedResult {
  status: SolveStatus;
  isOptimal: boolean;
  objectiveValue: number;
  primalValues: number[];
  dualValues: number[];
  basis: Basis;
}

interface StreamingHandler {
  onProgress: (update: ProgressUpdate) => void;
  onComplete: (result: SerializedResult) => void;
  onError: (error: Error) => void;
}

function reconstructResult(result: SerializedResult): SolveResult {
  const primalValues = new Float64Array(result.primalValues);
  const dualValues = new Float64Array(result.dualValues);

  return {
    status: result.status,
    isOptimal: result.isOptimal,
    objectiveValue: result.objectiveValue,

    value(v: VarRef): number {
      return primalValues[v] ?? NaN;
    },

    reducedCost(_v: VarRef): number {
      return NaN; // Not transferred
    },

    dual(c: ConRef): number {
      return dualValues[c] ?? NaN;
    },

    slack(_c: ConRef): number {
      return NaN; // Not transferred
    },

    primalValues(): Float64Array {
      return primalValues.slice();
    },

    dualValues(): Float64Array {
      return dualValues.slice();
    },

    getBasis(): Basis {
      return result.basis;
    },

    info(_key: string): number | string {
      return NaN; // Not available through worker
    },
  };
}

function reconstructError(errorClass: string | undefined, message: string): Error {
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

export class SolverClient implements Disposable {
  #worker: Worker | null = null;
  #messageId = 0;
  #pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  #streamingHandlers = new Map<number, StreamingHandler>();
  #disposed = false;
  #initPromise: Promise<void>;
  #options: SolverOptions;

  constructor(options: SolverOptions = {}) {
    this.#options = options;

    // Initialize asynchronously
    this.#initPromise = this.#init();
  }

  async #init(): Promise<void> {
    const variant = this.#options.variant ?? (detectThreadSupport() ? "mt" : "st");

    // Resolve worker URL: user-supplied override first, then package default
    const workerUrl = resolveVariantUrl(this.#options.workerUrl, variant) ?? defaultWorkerUrl(variant);
    this.#worker = new Worker(workerUrl, { type: "module" });

    this.#worker.onmessage = (e) => {
      const data = e.data;

      // Handle streaming messages
      if (data.type === "progress") {
        const handler = this.#streamingHandlers.get(data.id);
        if (handler) {
          handler.onProgress(data.update);
        }
        return;
      }

      if (data.type === "complete") {
        const handler = this.#streamingHandlers.get(data.id);
        if (handler) {
          this.#streamingHandlers.delete(data.id);
          handler.onComplete(data.result);
        }
        return;
      }

      // Handle normal request/response
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
      // Reject all pending promises
      for (const handler of this.#pending.values()) {
        handler.reject(new Error(e.message));
      }
      this.#pending.clear();

      // Error streaming handlers
      for (const handler of this.#streamingHandlers.values()) {
        handler.onError(new Error(e.message));
      }
      this.#streamingHandlers.clear();
    };

    // Initialize the solver in the worker (variant is baked into worker bundle)
    await this.#send("init", { verbose: this.#options.verbose });
  }

  async #send(cmd: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.#disposed) {
      throw new Error("SolverClient has been disposed");
    }
    if (!this.#worker) {
      throw new Error("Worker not initialized");
    }

    const id = this.#messageId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker!.postMessage({ id, cmd, ...params });
    });
  }

  async ready(): Promise<void> {
    await this.#initPromise;
  }

  async addVar(options: AddVarOptions = {}): Promise<VarRef> {
    await this.#initPromise;
    return this.#send("addVar", { options }) as Promise<VarRef>;
  }

  async addVars(options: BulkVarsOptions): Promise<VarRef> {
    await this.#initPromise;
    // Transfer typed arrays
    const msg = {
      options: {
        lb: options.lb.buffer,
        ub: options.ub.buffer,
        costs: options.costs?.buffer,
        types: options.types?.buffer,
      },
    };
    return this.#send("addVars", msg) as Promise<VarRef>;
  }

  async addConstraint(options: AddConstraintOptions): Promise<ConRef> {
    await this.#initPromise;
    return this.#send("addConstraint", { options }) as Promise<ConRef>;
  }

  async addConstraints(options: BulkConstraintsOptions): Promise<ConRef> {
    await this.#initPromise;
    const msg = {
      options: {
        lb: options.lb.buffer,
        ub: options.ub.buffer,
        starts: options.starts.buffer,
        indices: options.indices.buffer,
        values: options.values.buffer,
      },
    };
    return this.#send("addConstraints", msg) as Promise<ConRef>;
  }

  async setObjectiveSense(sense: ObjectiveSense): Promise<void> {
    await this.#initPromise;
    await this.#send("setObjectiveSense", { sense });
  }

  async setOption(name: string, value: number | string | boolean): Promise<void> {
    await this.#initPromise;
    await this.#send("setOption", { name, value });
  }

  async solve(opts: SolveOptions = {}): Promise<SolveResult> {
    await this.#initPromise;
    const result = (await this.#send("solve", { options: opts })) as SerializedResult;
    return reconstructResult(result);
  }

  async clear(): Promise<void> {
    await this.#initPromise;
    await this.#send("clear");
  }

  async reset(): Promise<void> {
    await this.#initPromise;
    await this.#send("reset");
  }

  async loadModel(modelString: string, format: "lp" | "mps" = "lp"): Promise<void> {
    await this.#initPromise;
    await this.#send("loadModel", { modelString, format });
  }

  async solveModel(modelString: string, format: "lp" | "mps" = "lp"): Promise<SolveResult> {
    await this.#initPromise;
    const result = (await this.#send("solveModel", { modelString, format })) as SerializedResult;
    return reconstructResult(result);
  }

  async setBasis(basis: Basis): Promise<void> {
    await this.#initPromise;
    await this.#send("setBasis", { basis });
  }

  async changeColCost(v: VarRef, cost: number): Promise<void> {
    await this.#initPromise;
    await this.#send("changeColCost", { v, cost });
  }

  async changeColBounds(v: VarRef, bounds: { lb?: number; ub?: number }): Promise<void> {
    await this.#initPromise;
    await this.#send("changeColBounds", { v, bounds });
  }

  async changeRowBounds(c: ConRef, bounds: { lb?: number; ub?: number }): Promise<void> {
    await this.#initPromise;
    await this.#send("changeRowBounds", { c, bounds });
  }

  async changeCoeff(c: ConRef, v: VarRef, value: number): Promise<void> {
    await this.#initPromise;
    await this.#send("changeCoeff", { c, v, value });
  }

  async deleteRows(indices: number[]): Promise<void> {
    await this.#initPromise;
    await this.#send("deleteRows", { indices });
  }

  async deleteCols(indices: number[]): Promise<void> {
    await this.#initPromise;
    await this.#send("deleteCols", { indices });
  }

  async getNumCols(): Promise<number> {
    await this.#initPromise;
    return this.#send("getNumCols") as Promise<number>;
  }

  async getNumRows(): Promise<number> {
    await this.#initPromise;
    return this.#send("getNumRows") as Promise<number>;
  }

  async version(): Promise<string> {
    await this.#initPromise;
    return this.#send("version") as Promise<string>;
  }

  solveStreaming(opts: SolveOptions = {}): StreamingSolve {
    const id = this.#messageId++;
    const updates: ProgressUpdate[] = [];
    let cancelled = false;
    let resolveWait: (() => void) | null = null;
    let completed = false;
    let resolveComplete: ((result: SerializedResult) => void) | null = null;
    let rejectComplete: ((error: Error) => void) | null = null;

    // Set up streaming handler
    this.#streamingHandlers.set(id, {
      onProgress: (update) => {
        if (cancelled) return;
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
      },
    });

    // Send command after init
    this.#initPromise.then(() => {
      this.#worker!.postMessage({ id, cmd: "solveStreaming", options: opts });
    });

    // Create progress async iterator
    const progress: ProgressController = {
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
          next: async (): Promise<IteratorResult<ProgressUpdate>> => {
            if (index < updates.length) {
              return { value: updates[index++]!, done: false as const };
            }

            if (completed || cancelled) {
              return { value: undefined, done: true as const };
            }

            await new Promise<void>((resolve) => {
              resolveWait = resolve;
            });

            if (index < updates.length) {
              return { value: updates[index++]!, done: false as const };
            }

            return { value: undefined, done: true as const };
          },
        };
      },
    };

    // Create solution promise
    const solution = new Promise<SolveResult>((resolve, reject) => {
      resolveComplete = (result) => {
        resolve(reconstructResult(result));
      };
      rejectComplete = reject;
    });

    return { solution, progress };
  }

  [Symbol.dispose]() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#send("dispose").catch(() => {});
    this.#worker?.terminate();
  }
}

function detectThreadSupport(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Atomics !== "undefined" &&
    (globalThis as any).crossOriginIsolated === true
  );
}
