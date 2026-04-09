// E2E test that uses the actual highs-wasm API as a user would
import { create, detect, SolverClient } from "../src/index.ts";
import type { VarRef } from "../src/types.ts";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: performance.now() - start });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, passed: false, error: String(e), duration: performance.now() - start });
    console.error(`✗ ${name}:`, e);
  }
}

async function runAllTests() {
  // Test 1: Feature detection
  await runTest("detect() returns feature flags", async () => {
    const features = detect();
    if (typeof features.simd !== "boolean") throw new Error("simd should be boolean");
    if (typeof features.exceptions !== "boolean") throw new Error("exceptions should be boolean");
    if (typeof features.threads !== "boolean") throw new Error("threads should be boolean");
    console.log("Features:", features);
  });

  // Test 2: Create solver via create()
  await runTest("create() returns working Solver", async () => {
    const solver = await create({ variant: "st" });
    const version = solver.version();
    if (!version.match(/^\d+\.\d+\.\d+/)) {
      throw new Error(`Invalid version: ${version}`);
    }
    console.log("HiGHS version:", version);
    solver[Symbol.dispose]();
  });

  // Test 3: Solve LP using the builder API
  await runTest("solve LP with builder pattern", async () => {
    await using solver = await create({ variant: "st" });
    solver.setOption("output_flag", false);

    // Maximize: x + 2y
    // Subject to: x + y <= 4, x <= 2, y <= 3
    const x = solver.addVar({ lb: 0, ub: 2, cost: 1, name: "x" });
    const y = solver.addVar({ lb: 0, ub: 3, cost: 2, name: "y" });

    solver.addConstraint({
      terms: [[x, 1], [y, 1]],
      ub: 4,
      name: "capacity",
    });

    solver.setObjectiveSense("maximize");
    const result = solver.solve();

    if (result.status !== "Optimal") {
      throw new Error(`Expected Optimal, got ${result.status}`);
    }
    // Optimal: x=1, y=3, obj=1+6=7
    if (Math.abs(result.objectiveValue - 7) > 0.001) {
      throw new Error(`Expected objective 7, got ${result.objectiveValue}`);
    }
    if (Math.abs(result.value(x) - 1) > 0.001) {
      throw new Error(`Expected x=1, got ${result.value(x)}`);
    }
    if (Math.abs(result.value(y) - 3) > 0.001) {
      throw new Error(`Expected y=3, got ${result.value(y)}`);
    }
    console.log("LP result:", result.status, "obj=", result.objectiveValue);
  });

  // Test 4: Solve MIP with integer variable
  await runTest("solve MIP with integer constraint", async () => {
    await using solver = await create({ variant: "st" });
    solver.setOption("output_flag", false);

    // Maximize: x + 2y where y is integer
    // Subject to: x + y <= 4.5
    const x = solver.addVar({ lb: 0, cost: 1 });
    const y = solver.addVar({ lb: 0, cost: 2, type: "integer" });

    solver.addConstraint({
      vars: [x, y],
      coeffs: [1, 1],
      ub: 4.5,
    });

    solver.setObjectiveSense("maximize");
    const result = solver.solve();

    if (result.status !== "Optimal") {
      throw new Error(`Expected Optimal, got ${result.status}`);
    }
    // Optimal: x=0.5, y=4 (integer), obj=0.5+8=8.5
    if (result.value(y) !== 4) {
      throw new Error(`Expected y=4 (integer), got ${result.value(y)}`);
    }
    if (Math.abs(result.objectiveValue - 8.5) > 0.001) {
      throw new Error(`Expected objective 8.5, got ${result.objectiveValue}`);
    }
    console.log("MIP result:", result.status, "obj=", result.objectiveValue, "y=", result.value(y));
  });

  // Test 5: Bulk variable addition
  await runTest("addVars() bulk variable creation", async () => {
    await using solver = await create({ variant: "st" });
    solver.setOption("output_flag", false);

    const n = 100;
    const lb = new Float64Array(n).fill(0);
    const ub = new Float64Array(n).fill(1);
    const costs = Float64Array.from({ length: n }, (_, i) => i + 1);

    const firstVar = solver.addVars({ lb, ub, costs });

    if (firstVar !== 0) {
      throw new Error(`Expected firstVar=0, got ${firstVar}`);
    }
    if (solver.numCols !== n) {
      throw new Error(`Expected ${n} cols, got ${solver.numCols}`);
    }
    console.log(`Added ${n} variables in bulk`);
  });

  // Test 6: Bulk constraint addition (CSR format)
  await runTest("addConstraints() bulk constraint creation", async () => {
    await using solver = await create({ variant: "st" });
    solver.setOption("output_flag", false);

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
      starts: new Int32Array([0, 2]),
      indices: new Int32Array([0, 1, 1, 2]),
      values: new Float64Array([1, 1, 1, 1]),
    });

    if (firstCon !== 0) {
      throw new Error(`Expected firstCon=0, got ${firstCon}`);
    }
    if (solver.numRows !== 2) {
      throw new Error(`Expected 2 rows, got ${solver.numRows}`);
    }
    console.log("Added 2 constraints in bulk CSR format");
  });

  // Test 7: Model clearing
  await runTest("clear() resets solver state", async () => {
    await using solver = await create({ variant: "st" });

    solver.addVar({ lb: 0, ub: 1 });
    solver.addVar({ lb: 0, ub: 1 });
    if (solver.numCols !== 2) throw new Error("Expected 2 cols");

    solver.clear();

    if (solver.numCols !== 0) {
      throw new Error(`Expected 0 cols after clear, got ${solver.numCols}`);
    }
    if (solver.numRows !== 0) {
      throw new Error(`Expected 0 rows after clear, got ${solver.numRows}`);
    }
    console.log("Model cleared successfully");
  });

  // Test 8: SolverClient (worker-based API)
  await runTest("SolverClient works in Web Worker", async () => {
    await using solver = new SolverClient({
      variant: "st",
      workerUrl: "/dist/worker.st.js",
    });
    await solver.ready();

    const x = await solver.addVar({ lb: 0, ub: 10, cost: 1 });
    const y = await solver.addVar({ lb: 0, ub: 10, cost: 2 });

    await solver.addConstraint({
      terms: [[x, 1], [y, 1]],
      ub: 15,
    });

    await solver.setObjectiveSense("maximize");
    const result = await solver.solve();

    if (result.status !== "Optimal") {
      throw new Error(`Expected Optimal, got ${result.status}`);
    }
    // x=5, y=10 -> obj = 5 + 20 = 25
    if (Math.abs(result.objectiveValue - 25) > 0.001) {
      throw new Error(`Expected objective 25, got ${result.objectiveValue}`);
    }
    console.log("SolverClient result:", result.status, "obj=", result.objectiveValue);
  });

  // Test 9: Result methods
  await runTest("SolveResult methods work correctly", async () => {
    await using solver = await create({ variant: "st" });
    solver.setOption("output_flag", false);

    const x = solver.addVar({ lb: 0, ub: 5, cost: 3 });
    const y = solver.addVar({ lb: 0, ub: 5, cost: 2 });
    const c = solver.addConstraint({ terms: [[x, 1], [y, 1]], ub: 8 });

    solver.setObjectiveSense("maximize");
    const result = solver.solve();

    // Check primalValues()
    const primals = result.primalValues();
    if (primals.length !== 2) {
      throw new Error(`Expected 2 primal values, got ${primals.length}`);
    }

    // Check dualValues()
    const duals = result.dualValues();
    if (duals.length !== 1) {
      throw new Error(`Expected 1 dual value, got ${duals.length}`);
    }

    // Check dual() for constraint
    const dualC = result.dual(c);
    if (typeof dualC !== "number") {
      throw new Error(`dual() should return number`);
    }

    console.log("Result methods work: primals=", primals, "duals=", duals);
  });

  renderResults();
}

function renderResults() {
  const container = document.getElementById("results")!;
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  let html = `<h2>Results: ${passed}/${total} passed</h2>`;
  html += '<ul id="test-results">';

  for (const r of results) {
    const status = r.passed ? "✓" : "✗";
    const color = r.passed ? "green" : "red";
    html += `<li style="color: ${color}" data-test="${r.name}" data-passed="${r.passed}">`;
    html += `${status} ${r.name} (${r.duration.toFixed(1)}ms)`;
    if (r.error) html += `<br><small>${r.error}</small>`;
    html += "</li>";
  }
  html += "</ul>";

  container.innerHTML = html;
  container.dataset.passed = String(passed);
  container.dataset.total = String(total);
  container.dataset.done = "true";
}

runAllTests().catch(e => {
  console.error("Test runner failed:", e);
  const container = document.getElementById("results")!;
  container.innerHTML = `<h2 style="color: red">Test runner failed: ${e}</h2>`;
  container.dataset.done = "true";
  container.dataset.passed = "0";
  container.dataset.total = "0";
});
