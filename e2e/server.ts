// Dev server for E2E tests
import index from "./index.html";

Bun.serve({
  port: 3456,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("E2E server running on http://localhost:3456");
