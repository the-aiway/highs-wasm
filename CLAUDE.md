---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## highs-wasm API Reference

This package provides a WebAssembly build of HiGHS linear/mixed-integer programming solver.

### Quick Start

```typescript
import { create, InfeasibleError, UnboundedError } from "highs-wasm";

// Create solver (auto-detects ST/MT, verbose: false by default)
await using solver = await create();

// Variables: lb, ub, cost, type ("continuous"|"integer"), name
const x = solver.addVar({ lb: 0, ub: 10, cost: 3 });
const y = solver.addVar({ lb: 0, cost: 2, type: "integer" });

// Constraints: terms as [[varRef, coeff], ...] or { vars, coeffs }
solver.addConstraint({ terms: [[x, 1], [y, 1]], ub: 15 });

// Solve
solver.setObjectiveSense("maximize"); // or "minimize" (default)
try {
  const result = solver.solve({ timeLimit: 60, mipRelGap: 0.01 });
  if (result.isOptimal) {
    console.log(result.objectiveValue, result.value(x), result.value(y));
  }
} catch (e) {
  if (e instanceof InfeasibleError) console.log("Infeasible");
  if (e instanceof UnboundedError) console.log("Unbounded");
}
```

### Key Types

```typescript
type VarRef = number & { __brand: "VarRef" };
type ConRef = number & { __brand: "ConRef" };
type VarType = "continuous" | "integer" | "semi-continuous" | "semi-integer";
type ObjectiveSense = "minimize" | "maximize";

interface SolveOptions {
  timeLimit?: number;
  presolve?: "on" | "off" | "choose";
  mipRelGap?: number;
  mipMaxNodes?: number;
  threads?: number;
}

interface SolveResult {
  status: SolveStatus;
  isOptimal: boolean;
  objectiveValue: number;
  value(v: VarRef): number;
  dual(c: ConRef): number;
  primalValues(): Float64Array;
  dualValues(): Float64Array;
  getBasis(): Basis;
}
```

### Solver Methods

```typescript
// Variables
addVar(opts?: { lb?, ub?, cost?, type?, name? }): VarRef
addVars({ lb, ub, costs?, types? }): VarRef  // bulk, typed arrays

// Constraints
addConstraint({ terms|vars+coeffs, lb?, ub?, name? }): ConRef
addConstraints({ lb, ub, starts, indices, values }): ConRef  // CSR format

// Objective
setObjectiveSense("maximize" | "minimize"): void

// Solving
solve(opts?: SolveOptions): SolveResult  // throws on infeasible/unbounded
solveStreaming(opts?): { solution: Promise<SolveResult>, progress: AsyncIterable }

// Model modification
changeColCost(v: VarRef, cost: number): void
changeColBounds(v: VarRef, { lb?, ub? }): void
changeRowBounds(c: ConRef, { lb?, ub? }): void
changeCoeff(c: ConRef, v: VarRef, value: number): void
deleteRows(indices: number[]): void
deleteCols(indices: number[]): void

// Warm starting
setBasis(basis: Basis): void
result.getBasis(): Basis

// Model I/O
loadModel(str: string, format: "lp"|"mps"): void
solveModel(str: string, format: "lp"|"mps"): SolveResult

// State
clear(): void      // clear model, keep options
reset(): void      // reset everything
setOption(name: string, value: number|string|boolean): void
getNumCols(): number
getNumRows(): number
version(): string
```

### Worker Client (for browsers)

```typescript
import { SolverClient } from "highs-wasm";

await using solver = new SolverClient({ variant: "st" });
await solver.ready();

// All methods are async, same API as Solver
const x = await solver.addVar({ lb: 0, ub: 10, cost: 1 });
const result = await solver.solve();
```

### Error Classes

- `HiGHSError` - base class with `status` property
- `InfeasibleError` - model has no feasible solution
- `UnboundedError` - model is unbounded
- `TimeLimitError` - time limit reached without solution
- `ModelError` - invalid model
