import { execSync } from "node:child_process";

// Runs ONCE before the db project. Force-resets the test DB to the current
// schema.prisma. Uses db push because this repo has no migration files.
export default function setup() {
  if (!process.env.DATABASE_URL?.includes("anki_test")) {
    throw new Error(
      `Refusing to run DB tests: DATABASE_URL is not a test DB (${process.env.DATABASE_URL}). ` +
        `Set .env.test to a database named anki_test.`,
    );
  }
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });
}
