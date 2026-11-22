import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function hasDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && url.startsWith("postgres"));
}

export function getDb() {
  if (!hasDatabaseConfigured()) {
    return null;
  }
  if (!cachedDb) {
    const client = postgres(process.env.DATABASE_URL!, {
      prepare: false, // Required for Supabase Transaction Pooler
      max: 5,
    });
    cachedDb = drizzle(client, { schema });
  }
  return cachedDb;
}
