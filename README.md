# highs-wasm

A modern WebAssembly build of the [HiGHS](https://github.com/ERGO-Code/HiGHS) linear programming solver.

## Why this fork?

The existing [`highs-js`](https://github.com/lovasoa/highs-js) npm package has problems that make it unusable for non-trivial models:

- **Crashes on real models** — OOM aborts, stack overflows, assertion failures due to broken emscripten config: no `ALLOW_MEMORY_GROWTH`, tiny default stack, outdated HiGHS version pinned to `fcfb534`
- **String-only API** — forces LP/MPS format serialization/parsing; no programmatic model building
- **Blocks the main thread** — no Web Worker support; the UI freezes during solves
- **Stale maintenance** — open issues for corrupted builds and wrong C API signatures go unaddressed

HiGHS itself is excellent — pure C++11, no dependencies, clean C API, MIT licensed. The wrapper just needed fixing.

### Alternatives considered

| Option | Why rejected |
|--------|-------------|
| `highs-js` (lovasoa) | Root cause of the issues above — broken build config, not just API surface |
| Native FFI via Bun (`bun:ffi` + `dlopen`) | Works great in Bun/Node server environments; ships as `highs-wasm/native`. But can't run in browsers, so WASM remains the primary target |
| Zig as compiler toolchain | Emscripten is the right tool here — it handles pthreads, wasm exception handling, and JS glue that Zig's wasm target doesn't |
| Rewrite HiGHS in another language | Unnecessary — the C++ solver is solid; only the JS wrapper needed work |

This package fixes all of the above: correct emscripten flags, a TypeScript builder API, non-blocking Worker-based solves, MIP progress streaming, and multi-threaded solving when `crossOriginIsolated` is available.

## Installation

```bash
npm install highs-wasm
# or
bun add github:abelcha/highs-wasm
```

## Quick Start

```typescript
import { create } from "highs-wasm";

// Create solver (auto-detects ST/MT based on browser capabilities)
await using solver = await create();

// Define variables
const x = solver.addVar({ lb: 0, ub: 40, cost: 1, name: "x" });
const y = solver.addVar({ lb: 0, cost: 2, type: "integer", name: "y" });

// Add constraints
solver.addConstraint({
  terms: [[x, 1], [y, 1]],
  ub: 20,
  name: "capacity",
});

// Solve
solver.setObjectiveSense("maximize");
const result = solver.solve();

if (result.isOptimal) {
  console.log("Objective:", result.objectiveValue);
  console.log("x =", result.value(x));
  console.log("y =", result.value(y));
}
```

## Features

- **No crashes** — Proper emscripten config with memory growth, large stack
- **Builder API** — Programmatic model building with TypeScript types
- **Bulk operations** — Typed array input for large models with integrality
- **Non-blocking** — Worker-based solving keeps UI responsive
- **MIP progress** — Stream optimization progress for long solves
- **Error handling** — Throws typed errors for infeasible/unbounded models
- **Warm starting** — Save and restore basis for fast re-solves
- **Zero config** — Single-file ESM, works in any bundler or plain `<script type="module">`

## API

### Creating a Solver

```typescript
import { create } from "highs-wasm";

// Auto-detect best variant (MT if SharedArrayBuffer available)
const solver = await create();

// Force single-threaded
const solver = await create({ variant: "st" });

// Force multi-threaded (requires crossOriginIsolated)
const solver = await create({ variant: "mt" });

// Enable verbose logging
const solver = await create({ verbose: true });
```

### Variables

```typescript
// Single variable
const x = solver.addVar({
  lb: 0,           // lower bound (default: 0)
  ub: Infinity,    // upper bound (default: Infinity)
  cost: 1,         // objective coefficient (default: 0)
  type: "integer", // "continuous" | "integer" | "semi-continuous" | "semi-integer"
  name: "x",       // optional name
});

// Bulk add with integrality (faster for large models)
const firstVar = solver.addVars({
  lb: new Float64Array(1000),
  ub: new Float64Array(1000).fill(1),
  costs: Float64Array.from(costData),
  types: new Int32Array(1000).fill(1), // 1 = integer
});
// Variables are firstVar, firstVar+1, firstVar+2, ...
```

### Constraints

```typescript
// Tuple form (cleaner for hand-written models)
solver.addConstraint({
  terms: [[x, 1], [y, -4], [z, 1]],
  lb: 0,    // lower bound (default: -Infinity)
  ub: 10,   // upper bound (default: Infinity)
  name: "c1",
});

// Parallel arrays form (better for generated code)
solver.addConstraint({
  vars: [x, y, z],
  coeffs: [1, -4, 1],
  ub: 10,
});

// Bulk add in CSR sparse format
solver.addConstraints({
  lb: new Float64Array([-Infinity, -Infinity]),
  ub: new Float64Array([5, 6]),
  starts: new Int32Array([0, 2]),      // row start indices
  indices: new Int32Array([0, 1, 1, 2]), // column indices
  values: new Float64Array([1, 1, 1, 1]),
});
```

### Solving

```typescript
solver.setObjectiveSense("maximize"); // or "minimize" (default)

// Solve with options
const result = solver.solve({
  timeLimit: 60,
  presolve: "on",       // "on" | "off" | "choose"
  mipRelGap: 0.01,
  mipMaxNodes: 10000,
  threads: 4,           // MT build only
});

// Check result
if (result.isOptimal) {
  result.objectiveValue;   // objective function value
  result.value(x);         // primal value for variable
  result.dual(constraint); // dual value for constraint
  result.primalValues();   // Float64Array of all primal values
  result.dualValues();     // Float64Array of all dual values
  result.info("simplex_iteration_count"); // solver statistics
}
```

### Error Handling

```typescript
import { create, InfeasibleError, UnboundedError, HiGHSError } from "highs-wasm";

try {
  const result = solver.solve({ timeLimit: 5 });

  if (!result.isOptimal) {
    // Solver hit a limit but found a feasible solution
    result.objectiveValue;
    result.info("mip_gap");
  }
} catch (e) {
  if (e instanceof InfeasibleError) {
    console.log("Model is infeasible");
  } else if (e instanceof UnboundedError) {
    console.log("Model is unbounded");
  } else if (e instanceof HiGHSError) {
    console.log("Solve failed:", e.status);
  }
}
```

### Streaming Solve (MIP Progress)

```typescript
const { solution, progress } = solver.solveStreaming({ timeLimit: 30 });

for await (const update of progress) {
  console.log(`Nodes: ${update.nodes}, Gap: ${update.gap.toFixed(2)}%`);

  if (userCancelled) {
    progress.cancel();
    break;
  }
}

const result = await solution;
```

### Model Modification

```typescript
// Modify and re-solve without rebuilding from scratch
solver.changeColCost(x, 5.0);
solver.changeColBounds(x, { lb: 0, ub: 100 });
solver.changeRowBounds(capacity, { lb: 10, ub: 50 });
solver.changeCoeff(capacity, x, 2.5);

// Delete rows or columns
solver.deleteRows([0, 2, 5]);
solver.deleteCols([1, 3]);

// Re-solve (warm-starts from previous basis if available)
const result2 = solver.solve();
```

### Warm Starting

```typescript
// Extract basis after a solve
const basis = result.getBasis();

// Later, on a similar model:
solver.setBasis(basis);
const result2 = solver.solve();  // starts from provided basis
```

### Clear / Reset

```typescript
// Wipe the current model, keep options
solver.clear();

// Reset everything including options
solver.reset();
```

### Load Model From String

```typescript
// Load without solving
solver.loadModel(lpString, "lp");  // or "mps"
console.log(solver.getNumCols(), solver.getNumRows());

// Solve
const result = solver.solve();

// Or load and solve in one call
const result = solver.solveModel(lpString, "lp");
```

### Cleanup

```typescript
// Option 1: Explicit using (recommended)
await using solver = await create();

// Option 2: Manual disposal
const solver = await create();
// ... use solver ...
solver[Symbol.dispose]();

// Option 3: Let GC handle it (backup via FinalizationRegistry)
```

## Worker Client

For browser environments, use `SolverClient` to run HiGHS in a Web Worker:

```typescript
import { SolverClient } from "highs-wasm";

await using solver = new SolverClient();
await solver.ready();

const x = await solver.addVar({ lb: 0, ub: 10, cost: 1 });
// ... build model ...
const result = await solver.solve(); // Non-blocking
```

## Build Variants

| Export | Size | Features |
|--------|------|----------|
| `highs-wasm` | 3.6MB | Auto-detects ST/MT |
| `highs-wasm/st` | 3.6MB | Single-threaded, works everywhere |
| `highs-wasm/mt` | 3.7MB | Multi-threaded, requires `crossOriginIsolated` |
| `highs-wasm/debug` | 37MB | Debug assertions, memory checks |

### Debug Build

Use the debug build to diagnose crashes:

```typescript
import { create } from "highs-wasm/debug";

const solver = await create();
// Crashes will show actual error messages instead of "Aborted()"
```

## Browser Compatibility

| Feature | Required | Fallback |
|---------|----------|----------|
| WebAssembly | Yes | None |
| Wasm SIMD | Yes | All browsers since ~2023 |
| Wasm exceptions | Yes | All browsers since ~2023 |
| Web Workers | Yes | None |
| SharedArrayBuffer | MT only | Falls back to ST |

Minimum: Chrome 91+, Firefox 89+, Safari 16.4+, Node 16+

## Building from Source

```bash
# Install emscripten first
# https://emscripten.org/docs/getting_started/downloads.html

git clone --recursive https://github.com/abelcha/highs-wasm
cd highs-wasm
bun install

# Build wasm modules
bun run build:wasm:st   # Single-threaded
bun run build:wasm:mt   # Multi-threaded
bun run build:wasm:debug # Debug build

# Build JS bundle
bun run build:js

# Run tests
bun test
bun run test:e2e
```

## License

MIT — Same as HiGHS
