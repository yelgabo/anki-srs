import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Pure-function tests — no DB, no setup. The existing lib/*.test.ts.
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts"],
          exclude: ["lib/**/*.db.test.ts"],
          environment: "node",
        },
      },
      {
        // DB-backed integration tests — *.db.test.ts anywhere.
        test: {
          name: "db",
          include: ["**/*.db.test.ts"],
          environment: "node",
          env: loadEnvTest(),
          globalSetup: ["./test/db/global-setup.ts"],
          setupFiles: ["./test/db/setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});

// Minimal .env.test loader (avoids adding a dotenv dependency).
function loadEnvTest(): Record<string, string> {
  const fs = require("node:fs");
  const out: Record<string, string> = {};
  if (!fs.existsSync(".env.test")) return out;
  for (const line of fs.readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
