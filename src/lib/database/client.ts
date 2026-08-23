import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export function createDatabase(url: string) {
  return drizzle({ client: neon(url), schema });
}
