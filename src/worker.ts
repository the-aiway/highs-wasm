// Worker-side code for running HiGHS in a Web Worker
import { Solver } from "./solver.ts";
import type { HighsModule } from "./c-api.ts";
import type {
  AddVarOptions,
  AddConstraintOptions,
  BulkVarsOptions,
  BulkConstraintsOptions,
  ObjectiveSense,
  SolveResult,
  ProgressUpdate,
} from "./types.ts";

type WorkerMessage =
  | { id: number; cmd: "init"; variant: "st" | "mt" }
  | { id: number; cmd: "addVar"; options: AddVarOptions }
  | { id: number; cmd: "addVars"; options: BulkVarsOptions }
  | { id: number; cmd: "addConstraint"; options: AddConstraintOptions }
  | { id: number; cmd: "addConstraints"; options: BulkConstraintsOptions }
  | { id: number; cmd: "setObjectiveSense"; sense: ObjectiveSense }
  | { id: number; cmd: "setOption"; name: string; value: number | string }
  | { id: number; cmd: "solve" }
  | { id: number; cmd: "solveStreaming" }
  | { id: number; cmd: "cancelSolve" }
  | { id: number; cmd: "clearModel" }
  | { id: number; cmd: "dispose" }
  | { id: number; cmd: "version" };

type WorkerResponse =
  | { id: number; ok: true; result?: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; type: "progress"; update: ProgressUpdate }
  | { id: number; type: "complete"; result: unknown };

let solver: Solver | null = null;
let modulePromise: Promise<HighsModule> | null = null;
let activeStreamingCancel: (() => void) | null = null;

async function loadModule(variant: "st" | "mt"): Promise<HighsModule> {
  // Dynamic import based on variant
  if (variant === "mt") {
    const { default: createModule } = await import("../dist/highs.mt.mjs");
    return createModule();
  } else {
    const { default: createModule } = await import("../dist/highs.st.mjs");
    return createModule();
  }
}

async function handleMessage(msg: WorkerMessage): Promise<WorkerResponse> {
  const { id, cmd } = msg;

  try {
    switch (cmd) {
      case "init": {
        if (!modulePromise) {
          modulePromise = loadModule(msg.variant);
        }
        const module = await modulePromise;
        solver = new Solver(module);
        return { id, ok: true };
      }

      case "addVar": {
        if (!solver) throw new Error("Solver not initialized");
        const varRef = solver.addVar(msg.options);
        return { id, ok: true, result: varRef };
      }

      case "addVars": {
        if (!solver) throw new Error("Solver not initialized");
        // Reconstruct typed arrays from transferable
        const options = {
          ...msg.options,
          lb: new Float64Array(msg.options.lb),
          ub: new Float64Array(msg.options.ub),
          costs: msg.options.costs ? new Float64Array(msg.options.costs) : undefined,
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
          lb: new Float64Array(msg.options.lb),
          ub: new Float64Array(msg.options.ub),
          starts: new Int32Array(msg.options.starts),
          indices: new Int32Array(msg.options.indices),
          values: new Float64Array(msg.options.values),
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
        const result = solver.solve();
        // Serialize the result
        const serialized = {
          status: result.status,
          objectiveValue: result.objectiveValue,
          primalValues: Array.from(result.primalValues()),
          dualValues: Array.from(result.dualValues()),
        };
        return { id, ok: true, result: serialized };
      }

      case "solveStreaming": {
        if (!solver) throw new Error("Solver not initialized");

        const { solution, progress } = solver.solveStreaming();
        activeStreamingCancel = () => progress.cancel();

        // Stream progress updates back to main thread
        (async () => {
          for await (const update of progress) {
            self.postMessage({ id, type: "progress", update });
          }
        })();

        // Wait for solution and send completion
        const result = await solution;
        activeStreamingCancel = null;

        const serialized = {
          status: result.status,
          objectiveValue: result.objectiveValue,
          primalValues: Array.from(result.primalValues()),
          dualValues: Array.from(result.dualValues()),
        };

        // Return null here - we'll send completion separately
        self.postMessage({ id, type: "complete", result: serialized });
        return { id, ok: true };
      }

      case "cancelSolve": {
        if (activeStreamingCancel) {
          activeStreamingCancel();
          activeStreamingCancel = null;
        }
        return { id, ok: true };
      }

      case "clearModel": {
        if (!solver) throw new Error("Solver not initialized");
        solver.clearModel();
        return { id, ok: true };
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
    return { id, ok: false, error: String(err) };
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const response = await handleMessage(e.data);
  self.postMessage(response);
};
