import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The suite covers the pure domain modules in src/lib — the SLA clock, the
// payment projection, the petty-cash ledger, the derived service status and the
// jsonb sanitisers. Those are the rules the panel and the portal both depend on,
// and they run without a database, so they are cheap to keep green.
//
// Anything that needs Supabase, cookies or the network (server actions, pages)
// is deliberately out of scope: `npm run build` is what verifies those.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      include: ["src/lib/**"],
      exclude: ["src/lib/**/*.test.ts"],
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
