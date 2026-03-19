# highs-wasm

A modern WebAssembly build of the HiGHS linear programming solver, replacing [highs-js](https://github.com/lovasoa/highs-js).

## Motivation

The existing `highs-js` npm package has fundamental issues:

- **Crashes on nontrivial models** — OOM aborts, stack overflows, assertion failures
- **Broken emscripten config** — no `ALLOW_MEMORY_GROWTH`, tiny default stack size, outdated HiGHS version (pinned to `fcfb534`)
- **String-only API** — forces LP format string serialization/parsing, no programmatic model building
- **No worker support** — blocks the main thread during solves
- **Stale maintenance** — open issues for corrupted builds, wrong C API signatures

All of these are fixable. HiGHS itself is an excellent solver — pure C++11, no dependencies, clean C API, MIT licensed.

## Goals

1. Fix the crashes (build config)
2. Expose the C API idiomatically in TypeScript (builder pattern)
3. Non-blocking solves via Web Worker
4. Streaming progress for MIP solves
5. Multi-threaded MIP when `crossOriginIsolated` is available
6. Ship as a standard ESM npm package

## Non-Goals

- Rewriting HiGHS in another language
- Supporting non-browser runtimes beyond Node (nice-to-have, not a goal)
- Full QP support (LP and MIP are the priority)
- Using Zig as the compiler toolchain (emscripten is the right tool here — pthreads, exception handling, JS glue)

---

## Build

### Toolchain

Emscripten via `emcmake` / `emcc`. HiGHS uses CMake natively so this is straightforward.

### HiGHS Version

Pin to latest stable release (v1.10+). Update via git submodule.

### Two Build Variants

| Variant | File | Features | Requirement |
|---------|------|----------|-------------|
| **ST** (single-threaded) | `highs.st.mjs` + `.wasm` | SIMD, wasm exceptions, memory growth | Any modern browser |
| **MT** (multi-threaded) | `highs.mt.mjs` + `.wasm` + `.worker.js` | All ST features + pthreads via SharedArrayBuffer | `crossOriginIsolated === true` |

The entry point `highs.mjs` auto-detects and loads the right variant.

### ST Build Flags

```bash
emcmake cmake -S HiGHS -B build-st \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_TESTING=OFF \
  -DHIGHS_NO_DEFAULT_THREADS=ON

emmake make -C build-st -j$(nproc)

emcc build-st/lib/libhighs.a -o dist/highs.st.mjs \
  -O3 -flto \
  -msimd128 \
  -fwasm-exceptions \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s STACK_SIZE=1048576 \
  -s EXPORTED_FUNCTIONS=@exported_functions.json \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","_malloc","_free","HEAPF64","HEAP32","HEAPU8"]'
```

### MT Build Flags

Same as ST plus:

```bash
  -pthread \
  -s SHARED_MEMORY=1 \
  -s PTHREAD_POOL_SIZE='navigator.hardwareConcurrency'
```

And remove `HIGHS_NO_DEFAULT_THREADS=ON` from CMake.

### Exported C Functions

Minimum set for the TypeScript API:

```json
[
  "_Highs_create",
  "_Highs_destroy",
  "_Highs_run",
  "_Highs_clear",
  "_Highs_addVar",
  "_Highs_addRow",
  "_Highs_addRows",
  "_Highs_addCols",
  "_Highs_changeColCost",
  "_Highs_changeColBounds",
  "_Highs_changeRowBounds",
  "_Highs_changeCoeff",
  "_Highs_changeObjectiveSense",
  "_Highs_getObjectiveValue",
  "_Highs_getNumCol",
  "_Highs_getNumRow",
  "_Highs_getSolution",
  "_Highs_getBasis",
  "_Highs_getModelStatus",
  "_Highs_getInfoValue",
  "_Highs_getInfoType",
  "_Highs_setIntOptionValue",
  "_Highs_setDoubleOptionValue",
  "_Highs_setStringOptionValue",
  "_Highs_readModel",
  "_Highs_writeModel",
  "_Highs_setLogCallback",
  "_malloc",
  "_free"
]
```

---

## Runtime Feature Detection

```typescript
function detect() {
  return {
    threads:
      typeof SharedArrayBuffer !== "undefined" &&
      typeof Atomics !== "undefined" &&
      crossOriginIsolated === true,

    simd: WebAssembly.validate(new Uint8Array([
      0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,
      3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11
    ])),

    exceptions: WebAssembly.validate(new Uint8Array([
      0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,
      10,8,1,6,0,6,64,7,0,11,11
    ])),
  };
}
```

Auto-detection logic:

1. If `threads` available and user didn't opt out → load MT variant
2. Otherwise → load ST variant
3. SIMD and wasm exceptions are assumed available (baseline since ~2023)

### SharedArrayBuffer Without Server Headers

For environments where COOP/COEP headers can't be set, provide an optional Service Worker shim:

```typescript
import { enableCrossOriginIsolation } from "highs-wasm/isolation-sw";

// Registers a SW that adds COOP/COEP headers to all responses.
// First page load: ST fallback. After SW activates: MT available.
await enableCrossOriginIsolation();
```

---

## TypeScript API

### Lifecycle

```typescript
import { create } from "highs-wasm";

// Auto-detects best variant (MT or ST)
await using solver = await create();

// Or force a variant
await using solver = await create({ variant: "st" });
```

`create()` returns a `Solver` that holds a wasm `Highs*` pointer. Implements `Symbol.dispose` for cleanup. A `FinalizationRegistry` provides backup GC if the user forgets `using`.

### Model Building

```typescript
// Variables — returns opaque branded index
const x = solver.addVar({ lb: 0, ub: 40, cost: 1, name: "x" });
const y = solver.addVar({ lb: 0, cost: 2, type: "integer" });
const z = solver.addVar({ lb: 0, cost: 4 });

// Constraints — two syntax forms
// Explicit parallel arrays (better for generated code)
solver.addConstraint({
  vars: [x, y, z],
  coeffs: [1, 1, 1],
  ub: 20,
  name: "capacity",
});

// Compact tuple form (better for hand-written models)
solver.addConstraint({
  terms: [[x, 1], [y, -4], [z, 1]],
  ub: 30,
});

// Equality
solver.addConstraint({
  terms: [[y, 1], [z, -0.5]],
  lb: 0,
  ub: 0,
});

// Objective sense
solver.setObjectiveSense("maximize"); // or "minimize" (default)
```

### Bulk Model Building

For large models, typed array input that maps directly to `Highs_addCols` / `Highs_addRows` with minimal copying:

```typescript
// Bulk variable add
const varStart = solver.addVars({
  lb: new Float64Array(1000),
  ub: new Float64Array(1000).fill(Infinity),
  costs: Float64Array.from(costData),
});
// Returns the VarRef of the first added variable.
// Subsequent vars are varStart + 1, varStart + 2, etc.

// Bulk constraint add (CSR sparse format)
solver.addConstraints({
  lb: rowLower,           // Float64Array
  ub: rowUpper,           // Float64Array
  starts: new Int32Array([0, 3, 7, ...]),
  indices: new Int32Array([...]),
  values: new Float64Array([...]),
});
```

### Options

```typescript
solver.setOption("time_limit", 10);         // double
solver.setOption("presolve", "on");         // string
solver.setOption("mip_rel_gap", 0.01);      // double
solver.setOption("threads", 4);             // int (MT build only)
```

### Solving

#### Simple (blocking in worker, async from caller)

```typescript
const result = await solver.solve();

if (result.status === "Optimal") {
  result.objectiveValue;   // number
  result.value(x);         // primal value for variable
  result.value(y);
  result.dual(capacity);   // dual value for constraint
}

// Full status enum
result.status;
// "Optimal" | "Infeasible" | "Unbounded" | "ObjectiveBound"
// | "ObjectiveTarget" | "TimeLimit" | "IterationLimit"
// | "SolutionLimit" | "NotSet" | "LoadError" | "ModelError"
```

#### Streaming (MIP progress)

```typescript
const { solution, progress } = solver.solveStreaming();

for await (const update of progress) {
  // {
  //   iteration: number,
  //   objective: number,
  //   bound: number,
  //   gap: number,         // relative MIP gap
  //   nodes: number,
  //   elapsed: number,     // seconds
  // }
  updateUI(update);

  if (userCancelled) {
    progress.cancel();
    break;
  }
}

const result = await solution;
```

### Result Object

The result is lazy — reads from wasm heap on demand rather than eagerly copying all columns:

```typescript
interface SolveResult {
  status: SolveStatus;
  objectiveValue: number;
  
  // Per-variable access
  value(v: VarRef): number;      // primal
  reducedCost(v: VarRef): number;
  
  // Per-constraint access  
  dual(c: ConRef): number;
  slack(c: ConRef): number;
  
  // Bulk extraction (allocates)
  primalValues(): Float64Array;
  dualValues(): Float64Array;
  
  // Solve info
  info(key: string): number | string;
  // e.g. info("simplex_iteration_count"), info("mip_node_count")
}
```

### String-Based Fallback

For compatibility with existing LP/MPS format workflows:

```typescript
const result = await solver.solveModel(lpString, "lp");  // or "mps"
```

This writes to the emscripten virtual FS, calls `Highs_readModel`, runs, and extracts results. Simpler but slower than the builder API.

---

## Architecture

### Worker Isolation

All wasm execution happens in a Web Worker. The main thread never touches the wasm heap directly.

```
Main Thread                    Worker
───────────                    ──────
solver.solve()
  │
  ├─ postMessage({cmd: "solve"}) ──→  wasm._Highs_run()
  │                                      │
  │  (non-blocking wait via               │ (log callback writes
  │   Atomics.waitAsync on                │  progress to shared
  │   SharedInt32Array)                   │  ring buffer)
  │                                      │
  │  ←── progress stream ────────────────┤
  │                                      │
  │  ←── Atomics.notify ────────────────  done
  │
  result
```

For the **ST build**: standard `postMessage` for results, `MessageChannel` for progress streaming.

For the **MT build**: `SharedArrayBuffer` ring buffer for zero-copy progress streaming, `Atomics.waitAsync` for non-blocking completion notification. The wasm module itself uses `SharedArrayBuffer` as its linear memory, enabling pthreads.

### Memory Management

Internal wrapper class holds the `Highs*` pointer and all `cwrap`'d function references:

```typescript
class Solver {
  #ptr: number;       // Highs* from Highs_create()
  #disposed = false;
  
  // Prevent double-free, ensure cleanup
  [Symbol.dispose]() {
    if (this.#disposed) return;
    this.#disposed = true;
    finalizationRegistry.unregister(this);
    this.#postMessage({ cmd: "destroy", ptr: this.#ptr });
  }
}

// Backup in case user forgets `using`
const finalizationRegistry = new FinalizationRegistry((ptr: number) => {
  worker.postMessage({ cmd: "destroy", ptr });
});
```

Typed array arguments (for bulk add) are copied into the wasm heap via `_malloc` + `HEAPF64.set()` inside the worker, then `_free`'d after the C call returns. The caller's arrays are never retained.

---

## Package Structure

```
highs-wasm/
├── dist/
│   ├── highs.mjs              # Entry point — auto-detects variant
│   ├── highs.st.mjs           # ST wasm loader + JS glue
│   ├── highs.st.wasm
│   ├── highs.mt.mjs           # MT wasm loader + JS glue
│   ├── highs.mt.wasm
│   ├── highs.mt.worker.js     # pthread worker (MT only)
│   ├── solver-worker.mjs      # solver execution worker
│   └── types.d.ts
├── src/
│   ├── index.ts               # Public API + feature detection
│   ├── solver.ts              # Solver class (main thread side)
│   ├── worker.ts              # Worker-side wasm bindings
│   ├── c-api.ts               # cwrap declarations
│   ├── types.ts               # VarRef, ConRef, SolveResult, etc.
│   └── progress.ts            # Ring buffer / streaming logic
├── build/
│   ├── build-st.sh
│   ├── build-mt.sh
│   └── exported_functions.json
├── HiGHS/                     # git submodule
├── package.json
├── tsconfig.json
└── README.md
```

### package.json

```json
{
  "name": "highs-wasm",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/highs.mjs",
    "./st": "./dist/highs.st.mjs",
    "./mt": "./dist/highs.mt.mjs",
    "./isolation-sw": "./dist/isolation-sw.mjs"
  },
  "types": "./dist/types.d.ts",
  "files": ["dist/"],
  "sideEffects": false
}
```

### Browser Compatibility

| Feature | Required | Fallback |
|---------|----------|----------|
| WebAssembly | Yes | None — hard requirement |
| Wasm SIMD | Yes (ST + MT) | All browsers since ~2023 |
| Wasm exceptions | Yes (ST + MT) | All browsers since ~2023 |
| Web Workers | Yes | None — required for non-blocking |
| SharedArrayBuffer | MT only | Falls back to ST build |
| Atomics.waitAsync | MT only | Falls back to postMessage progress |

Minimum browser versions: Chrome 91+, Firefox 89+, Safari 16.4+, Node 16+.

---

## Implementation Phases

### Phase 1 — Fix the Build (days)

- Set up emscripten build with correct flags (memory growth, stack size, SIMD, wasm exceptions)
- Pin to latest HiGHS release
- Expose `solveModel(lpString)` for drop-in highs-js compatibility
- Ship as ST-only build
- This alone fixes all the crash bugs

### Phase 2 — TypeScript API (days)

- `cwrap` bindings for the C API functions
- `Solver` class with builder pattern (`addVar`, `addConstraint`, `solve`)
- Opaque `VarRef` / `ConRef` handles
- Lazy `SolveResult`
- `Symbol.dispose` + `FinalizationRegistry`
- Bulk typed-array model building

### Phase 3 — Worker Architecture (days)

- Move wasm execution to a dedicated Worker
- `solve()` returns a Promise, main thread stays free
- Progress streaming via `MessageChannel` (ST) or ring buffer (MT)
- Cancellation support

### Phase 4 — Multi-Threading (days)

- MT build with `-pthread` and `SharedArrayBuffer`
- Runtime feature detection + auto-selection
- Service Worker COOP/COEP shim (optional)
- Parallel MIP branch-and-cut

---

## Open Questions

- **Wasm size budget** — the ST build will likely be ~1-2MB gzipped. Is that acceptable for the target use cases?
- **LP string parsing** — should `solveModel()` support both LP and MPS formats, or just LP?
- **Model serialization** — worth exposing `Highs_writeModel` so users can export models for debugging?
- **IIS / ranging** — HiGHS supports infeasibility analysis and sensitivity ranging. Include in the API or defer?
- **QP support** — HiGHS handles convex QP. Expose it or keep scope to LP/MIP?
