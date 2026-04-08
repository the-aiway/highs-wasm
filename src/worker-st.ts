// Single-threaded worker with WASM inlined
import { Solver } from "./solver.ts";
import type { HighsModule } from "./c-api.ts";
import type {
  AddVarOptions,
  AddConstraintOptions,
  BulkVarsOptions,
  BulkConstraintsOptions,
  ObjectiveSense,
  SolveOptions,
  ProgressUpdate,
  Basis,
  VarRef,
  ConRef,
} from "./types.ts";
import { HiGHSError } from "./types.ts";

// Static import - will be inlined by bundler
import createModule from "../dist/highs.st.mjs";

declare const self: DedicatedWorkerGlobalScope;

type WorkerMessage =
  | { id: number; cmd: "init"; verbose?: boolean }
  | { id: number; cmd: "addVar"; options: AddVarOptions }
  | { id: number; cmd: "addVars"; options: BulkVarsOptions & { types?: ArrayBuffer } }
  | { id: number; cmd: "addConstraint"; options: AddConstraintOptions }
  | { id: number; cmd: "addConstraints"; options: BulkConstraintsOptions }
  | { id: number; cmd: "setObjectiveSense"; sense: ObjectiveSense }
  | { id: number; cmd: "setOption"; name: string; value: number | string | boolean }
  | { id: number; cmd: "solve"; options?: SolveOptions }
  | { id: number; cmd: "solveStreaming"; options?: SolveOptions }
  | { id: number; cmd: "cancelSolve" }
  | { id: number; cmd: "clear" }
  | { id: number; cmd: "reset" }
  | { id: number; cmd: "loadModel"; modelString: string; format: "lp" | "mps" }
  | { id: number; cmd: "solveModel"; modelString: string; format: "lp" | "mps" }
  | { id: number; cmd: "setBasis"; basis: Basis }
  | { id: number; cmd: "changeColCost"; v: VarRef; cost: number }
  | { id: number; cmd: "changeColBounds"; v: VarRef; bounds: { lb?: number; ub?: number } }
  | { id: number; cmd: "changeRowBounds"; c: ConRef; bounds: { lb?: number; ub?: number } }
  | { id: number; cmd: "changeCoeff"; c: ConRef; v: VarRef; value: number }
  | { id: number; cmd: "deleteRows"; indices: number[] }
  | { id: number; cmd: "deleteCols"; indices: number[] }
  | { id: number; cmd: "dispose" }
  | { id: number; cmd: "version" }
  | { id: number; cmd: "getNumCols" }
  | { id: number; cmd: "getNumRows" };

type WorkerResponse =
  | { id: number; ok: true; result?: unknown }
  | { id: number; ok: false; error: string; errorClass?: string }
  | { id: number; type: "progress"; update: ProgressUpdate }
  | { id: number; type: "complete"; result: unknown };

let solver: Solver | null = null;
let modulePromise: Promise<HighsModule> | null = null;
let activeStreamingCancel: (() => void) | null = null;

function serializeResult(result: ReturnType<Solver["solve"]>) {
  return {
    status: result.status,
    isOptimal: result.isOptimal,
    objectiveValue: result.objectiveValue,
    primalValues: Array.from(result.primalValues()),
    dualValues: Array.from(result.dualValues()),
    basis: result.getBasis(),
  };
}

async function handleMessage(msg: WorkerMessage): Promise<WorkerResponse> {
  const { id, cmd } = msg;

  try {
    switch (cmd) {
      case "init": {
        if (!modulePromise) {
          modulePromise = createModule() as Promise<HighsModule>;
        }
        const module = await modulePromise;
        solver = new Solver(module, { verbose: msg.verbose });
        return { id, ok: true };
      }

      case "addVar": {
        if (!solver) throw new Error("Solver not initialized");
        const varRef = solver.addVar(msg.options);
        return { id, ok: true, result: varRef };
      }

      case "addVars": {
        if (!solver) throw new Error("Solver not initialized");
        const options = {
          lb: new Float64Array(msg.options.lb as unknown as ArrayBuffer),
          ub: new Float64Array(msg.options.ub as unknown as ArrayBuffer),
          costs: msg.options.costs ? new Float64Array(msg.options.costs as unknown as ArrayBuffer) : undefined,
          types: msg.options.types ? new Int32Array(msg.options.types) : undefined,
        };
        const varRef = solver.addVars(options);
        return { id, ok: true, result: varRef };
      }

      case "addConstraint": {
        if (!solver) throw new Error("Solver not initialized");
        const conRef = solver.addConstraint(msg.options);
        return { id, ok: true, result: conRef };
      }

      case "addConstraints": {
        if (!solver) throw new Error("Solver not initialized");
        const options = {
          lb: new Float64Array(msg.options.lb as unknown as ArrayBuffer),
          ub: new Float64Array(msg.options.ub as unknown as ArrayBuffer),
          starts: new Int32Array(msg.options.starts as unknown as ArrayBuffer),
          indices: new Int32Array(msg.options.indices as unknown as ArrayBuffer),
          values: new Float64Array(msg.options.values as unknown as ArrayBuffer),
        };
        const conRef = solver.addConstraints(options);
        return { id, ok: true, result: conRef };
      }

      case "setObjectiveSense": {
        if (!solver) throw new Error("Solver not initialized");
        solver.setObjectiveSense(msg.sense);
        return { id, ok: true };
      }

      case "setOption": {
        if (!solver) throw new Error("Solver not initialized");
        solver.setOption(msg.name, msg.value);
        return { id, ok: true };
      }

      case "solve": {
        if (!solver) throw new Error("Solver not initialized");
        const result = solver.solve(msg.options ?? {});
        return { id, ok: true, result: serializeResult(result) };
      }

      case "solveStreaming": {
        if (!solver) throw new Error("Solver not initialized");

        const { solution, progress } = solver.solveStreaming(msg.options ?? {});
        activeStreamingCancel = () => progress.cancel();

        // Stream progress updates back to main thread
        (async () => {
          for await (const update of progress) {
            self.postMessage({ id, type: "progress", update });
          }
        })();

        // Wait for solution and send completion
        try {
          const result = await solution;
          activeStreamingCancel = null;
          self.postMessage({ id, type: "complete", result: serializeResult(result) });
          return { id, ok: true };
        } catch (err) {
          activeStreamingCancel = null;
          if (err instanceof HiGHSError) {
            return { id, ok: false, error: err.message, errorClass: err.name };
          }
          throw err;
        }
      }

      case "cancelSolve": {
        if (activeStreamingCancel) {
          activeStreamingCancel();
          activeStreamingCancel = null;
        }
        return { id, ok: true };
      }

      case "clear": {
        if (!solver) throw new Error("Solver not initialized");
        solver.clear();
        return { id, ok: true };
      }

      case "reset": {
        if (!solver) throw new Error("Solver not initialized");
        solver.reset();
        return { id, ok: true };
      }

      case "loadModel": {
        if (!solver) throw new Error("Solver not initialized");
        solver.loadModel(msg.modelString, msg.format);
        return { id, ok: true };
      }

      case "solveModel": {
        if (!solver) throw new Error("Solver not initialized");
        const result = solver.solveModel(msg.modelString, msg.format);
        return { id, ok: true, result: serializeResult(result) };
      }

      case "setBasis": {
        if (!solver) throw new Error("Solver not initialized");
        solver.setBasis(msg.basis);
        return { id, ok: true };
      }

      case "changeColCost": {
        if (!solver) throw new Error("Solver not initialized");
        solver.changeColCost(msg.v, msg.cost);
        return { id, ok: true };
      }

      case "changeColBounds": {
        if (!solver) throw new Error("Solver not initialized");
        solver.changeColBounds(msg.v, msg.bounds);
        return { id, ok: true };
      }

      case "changeRowBounds": {
        if (!solver) throw new Error("Solver not initialized");
        solver.changeRowBounds(msg.c, msg.bounds);
        return { id, ok: true };
      }

      case "changeCoeff": {
        if (!solver) throw new Error("Solver not initialized");
        solver.changeCoeff(msg.c, msg.v, msg.value);
        return { id, ok: true };
      }

      case "deleteRows": {
        if (!solver) throw new Error("Solver not initialized");
        solver.deleteRows(msg.indices);
        return { id, ok: true };
      }

      case "deleteCols": {
        if (!solver) throw new Error("Solver not initialized");
        solver.deleteCols(msg.indices);
        return { id, ok: true };
      }

      case "getNumCols": {
        if (!solver) throw new Error("Solver not initialized");
        return { id, ok: true, result: solver.getNumCols() };
      }

      case "getNumRows": {
        if (!solver) throw new Error("Solver not initialized");
        return { id, ok: true, result: solver.getNumRows() };
      }

      case "dispose": {
        if (solver) {
          solver[Symbol.dispose]();
          solver = null;
        }
        return { id, ok: true };
      }

      case "version": {
        if (!solver) throw new Error("Solver not initialized");
        return { id, ok: true, result: solver.version() };
      }

      default:
        throw new Error(`Unknown command: ${(msg as any).cmd}`);
    }
  } catch (err) {
    if (err instanceof HiGHSError) {
      return { id, ok: false, error: err.message, errorClass: err.name };
    }
    return { id, ok: false, error: String(err) };
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const response = await handleMessage(e.data);
  self.postMessage(response);
};
