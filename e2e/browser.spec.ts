import { test, expect } from "@playwright/test";

test.describe("highs-wasm full e2e tests", () => {
  test("all API tests pass in browser", async ({ page }) => {
    // Listen for console messages
    page.on("console", (msg) => {
      const text = msg.text();
      // Filter out noisy HiGHS output
      if (!text.includes("Running HiGHS") && !text.includes("Presolv")) {
        console.log(`[browser] ${text}`);
      }
    });

    page.on("pageerror", (err) => {
      console.error(`[browser error] ${err.message}`);
    });

    await page.goto("/");

    // Wait for tests to complete (max 60 seconds for wasm load + tests)
    await page.waitForSelector('#results[data-done="true"]', { timeout: 60000 });

    // Get results
    const passed = await page.getAttribute("#results", "data-passed");
    const total = await page.getAttribute("#results", "data-total");

    console.log(`\n=== Browser E2E Results: ${passed}/${total} passed ===`);

    // Get individual test results
    const testItems = await page.$$eval("#test-results li", (items) =>
      items.map((el) => ({
        name: el.getAttribute("data-test"),
        passed: el.getAttribute("data-passed") === "true",
        text: el.textContent?.split("\n")[0],
      }))
    );

    for (const item of testItems) {
      console.log(`  ${item.passed ? "✓" : "✗"} ${item.name}`);
    }

    // All tests should pass
    expect(Number(passed)).toBe(Number(total));
    expect(Number(total)).toBeGreaterThanOrEqual(8); // We have 8 tests
  });
});
