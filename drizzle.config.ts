import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/lib/database/schema.ts",
  strict: true,
  verbose: true,
});
