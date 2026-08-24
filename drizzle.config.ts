import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  out: "./drizzle",
  schema: "./src/lib/database/schema.ts",
  strict: true,
  verbose: true,
});
