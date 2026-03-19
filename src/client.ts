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
  SolverOptions,
} from "./types.ts";

interface SerializedResult {
  status: string;
  objectiveValue: number;
  primalValues: number[];
  dualValues: number[];
}

export class SolverClient implements Disposable {
  #worker: Worker;
  #messageId = 0;
  #pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  #disposed = false;
  #initPromise: Promise<void>;

  constructor(options: SolverOptions = {}) {
    const variant = options.variant ?? (detectThreadSupport() ? "mt" : "st");

    // Create worker from the bundled worker code
    this.#worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    this.#worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
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
      // Reject all pending promises
      for (const handler of this.#pending.values()) {
        handler.reject(new Error(e.message));
      }
      this.#pending.clear();
    };

    // Initialize the solver
    this.#initPromise = this.#send("init", { variant });
  }

  async #send(cmd: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.#disposed) {
      throw new Error("SolverClient has been disposed");
    }

    const id = this.#messageId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ id, cmd, ...params });
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

  async setOption(name: string, value: number | string): Promise<void> {
    await this.#initPromise;
    await this.#send("setOption", { name, value });
  }

  async solve(): Promise<SolveResult> {
    await this.#initPromise;
    const result = (await this.#send("solve")) as SerializedResult;

    // Reconstruct the SolveResult interface
    const primalValues = new Float64Array(result.primalValues);
    const dualValues = new Float64Array(result.dualValues);

    return {
      status: result.status as any,
      objectiveValue: result.objectiveValue,

      value(v: VarRef): number {
        return primalValues[v] ?? NaN;
      },

      reducedCost(_v: VarRef): number {
        // Reduced costs not transferred in current impl
        return NaN;
      },

      dual(c: ConRef): number {
        return dualValues[c] ?? NaN;
      },

      slack(_c: ConRef): number {
        // Slack not transferred in current impl
        return NaN;
      },

      primalValues(): Float64Array {
        return primalValues.slice();
      },

      dualValues(): Float64Array {
        return dualValues.slice();
      },

      info(_key: string): number | string {
        // Info not available through worker yet
        return NaN;
      },
    };
  }

  async clearModel(): Promise<void> {
    await this.#initPromise;
    await this.#send("clearModel");
  }

  async version(): Promise<string> {
    await this.#initPromise;
    return this.#send("version") as Promise<string>;
  }

  [Symbol.dispose]() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#send("dispose").catch(() => {});
    this.#worker.terminate();
  }
}

function detectThreadSupport(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Atomics !== "undefined" &&
    (globalThis as any).crossOriginIsolated === true
  );
}
