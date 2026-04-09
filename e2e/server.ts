// Dev server for E2E tests
import index from "./index.html";

Bun.serve({
  port: 3456,
  routes: {
    "/": index,
    "/dist/worker.st.js": new Response(Bun.file("./dist/worker.st.js")),
    "/dist/worker.mt.js": new Response(Bun.file("./dist/worker.mt.js")),
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("E2E server running on http://localhost:3456");
