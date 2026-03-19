# highs-wasm

A modern WebAssembly build of the [HiGHS](https://github.com/ERGO-Code/HiGHS) linear programming solver.

## Installation

```bash
npm install highs-wasm
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

if (result.status === "Optimal") {
  console.log("Objective:", result.objectiveValue);
  console.log("x =", result.value(x));
  console.log("y =", result.value(y));
}
```

## Features

- **No crashes** - Proper emscripten config with memory growth, large stack
- **Builder API** - Programmatic model building with TypeScript types
- **Bulk operations** - Typed array input for large models
- **Non-blocking** - Worker-based solving keeps UI responsive
- **MIP progress** - Stream optimization progress for long solves
- **Zero config** - Single-file ESM, works in any bundler or plain `<script type="module">`

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

// Bulk add (faster for large models)
const firstVar = solver.addVars({
  lb: new Float64Array(1000),
  ub: new Float64Array(1000).fill(Infinity),
  costs: Float64Array.from(costData),
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
solver.setOption("time_limit", 60);
solver.setOption("mip_rel_gap", 0.01);

const result = solver.solve();

result.status;           // "Optimal" | "Infeasible" | "Unbounded" | ...
result.objectiveValue;   // objective function value
result.value(x);         // primal value for variable
result.dual(constraint); // dual value for constraint
result.primalValues();   // Float64Array of all primal values
result.dualValues();     // Float64Array of all dual values
result.info("simplex_iteration_count"); // solver statistics
```

### Streaming Solve (MIP Progress)

```typescript
const { solution, progress } = solver.solveStreaming();

for await (const update of progress) {
  console.log(`Nodes: ${update.nodes}, Gap: ${update.gap.toFixed(2)}%`);

  if (userCancelled) {
    progress.cancel();
    break;
  }
}

const result = await solution;
```

### String-Based Input (LP/MPS)

```typescript
const lpString = `
Maximize
  obj: x + 2 y
Subject To
  c1: x + y <= 4
Bounds
  0 <= x <= 2
  0 <= y <= 3
End
`;

const result = solver.solveModel(lpString, "lp"); // or "mps"
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

git clone --recursive https://github.com/user/highs-wasm
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

MIT - Same as HiGHS
