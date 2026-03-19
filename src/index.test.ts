import { test, expect } from "bun:test";
import { create, detect } from "./index.ts";

test("detect features", () => {
  const features = detect();
  expect(typeof features.simd).toBe("boolean");
  expect(typeof features.exceptions).toBe("boolean");
  expect(typeof features.threads).toBe("boolean");
});

test("create solver and get version", async () => {
  await using solver = await create({ variant: "st" });
  const version = solver.version();
  expect(version).toMatch(/^v?\d+\.\d+\.\d+/);
  console.log("HiGHS version:", version);
});

test("solve simple LP", async () => {
  // Maximize: x + 2y
  // Subject to:
  //   x + y <= 4
  //   x <= 2
  //   y <= 3
  //   x, y >= 0

  await using solver = await create({ variant: "st" });

  const x = solver.addVar({ lb: 0, ub: 2, cost: 1, name: "x" });
  const y = solver.addVar({ lb: 0, ub: 3, cost: 2, name: "y" });

  solver.addConstraint({
    terms: [
      [x, 1],
      [y, 1],
    ],
    ub: 4,
    name: "capacity",
  });

  solver.setObjectiveSense("maximize");

  const result = solver.solve();

  console.log("Status:", result.status);
  console.log("Objective:", result.objectiveValue);
  console.log("x =", result.value(x));
  console.log("y =", result.value(y));

  expect(result.status).toBe("Optimal");
  expect(result.objectiveValue).toBeCloseTo(7); // x=1, y=3 -> 1 + 6 = 7
  expect(result.value(x)).toBeCloseTo(1);
  expect(result.value(y)).toBeCloseTo(3);
});

test("solve MIP", async () => {
  // Maximize: x + 2y (y is integer)
  // Subject to:
  //   x + y <= 4.5
  //   x, y >= 0
  //   y is integer

  await using solver = await create({ variant: "st" });

  const x = solver.addVar({ lb: 0, cost: 1 });
  const y = solver.addVar({ lb: 0, cost: 2, type: "integer" });

  solver.addConstraint({
    vars: [x, y],
    coeffs: [1, 1],
    ub: 4.5,
  });

  solver.setObjectiveSense("maximize");

  const result = solver.solve();

  console.log("MIP Status:", result.status);
  console.log("MIP Objective:", result.objectiveValue);
  console.log("x =", result.value(x));
  console.log("y =", result.value(y));

  expect(result.status).toBe("Optimal");
  expect(result.value(y)).toBe(4); // y must be integer
  expect(result.value(x)).toBeCloseTo(0.5);
  expect(result.objectiveValue).toBeCloseTo(8.5); // 0.5 + 2*4 = 8.5
});

test("bulk add variables", async () => {
  await using solver = await create({ variant: "st" });

  const n = 100;
  const lb = new Float64Array(n).fill(0);
  const ub = new Float64Array(n).fill(1);
  const costs = Float64Array.from({ length: n }, (_, i) => i);

  const firstVar = solver.addVars({ lb, ub, costs });

  expect(firstVar).toBe(0);
  expect(solver.numCols).toBe(n);
});

test("bulk add constraints", async () => {
  await using solver = await create({ variant: "st" });

  // Create 3 variables
  solver.addVars({
    lb: new Float64Array([0, 0, 0]),
    ub: new Float64Array([10, 10, 10]),
  });

  // Add 2 constraints in CSR format
  // Row 0: x0 + x1 <= 5
  // Row 1: x1 + x2 <= 6
  const firstCon = solver.addConstraints({
    lb: new Float64Array([-Infinity, -Infinity]),
    ub: new Float64Array([5, 6]),
    starts: new Int32Array([0, 2]), // row 0 starts at 0, row 1 starts at 2
    indices: new Int32Array([0, 1, 1, 2]), // row 0: cols 0,1; row 1: cols 1,2
    values: new Float64Array([1, 1, 1, 1]),
  });

  expect(firstCon).toBe(0);
  expect(solver.numRows).toBe(2);
});

test("set options", async () => {
  await using solver = await create({ variant: "st" });

  // These should not throw
  solver.setOption("time_limit", 10);
  solver.setOption("presolve", "on");
  solver.setOption("output_flag", false); // Suppress output (boolean option)
});

test("clear model", async () => {
  await using solver = await create({ variant: "st" });

  solver.addVar({ lb: 0, ub: 1 });
  expect(solver.numCols).toBe(1);

  solver.clearModel();
  expect(solver.numCols).toBe(0);
  expect(solver.numRows).toBe(0);
});

test("solveModel from LP string", async () => {
  await using solver = await create({ variant: "st" });

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

  const result = solver.solveModel(lpString, "lp");

  expect(result.status).toBe("Optimal");
  expect(result.objectiveValue).toBeCloseTo(7);
});

test("solveStreaming returns solution", async () => {
  await using solver = await create({ variant: "st" });
  solver.setOption("output_flag", false);

  // Create a small MIP
  const x = solver.addVar({ lb: 0, ub: 10, cost: 1, type: "integer" });
  const y = solver.addVar({ lb: 0, ub: 10, cost: 2, type: "integer" });

  solver.addConstraint({
    terms: [[x, 1], [y, 1]],
    ub: 15,
  });

  solver.setObjectiveSense("maximize");

  const { solution, progress } = solver.solveStreaming();

  // Collect any progress updates (may be empty for small problems)
  const updates = [];
  for await (const update of progress) {
    updates.push(update);
  }

  const result = await solution;

  console.log("Streaming solve updates:", updates.length);
  console.log("Streaming result:", result.status, result.objectiveValue);

  expect(result.status).toBe("Optimal");
  // x + y <= 15, maximize x + 2y => x=5, y=10, obj = 5 + 20 = 25
  expect(result.objectiveValue).toBeCloseTo(25);
});
