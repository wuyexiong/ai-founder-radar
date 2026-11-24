import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: DbInstance | null = null;
let testDbOverride: DbInstance | null = null;

export function setDbForTests(mockDb: unknown | null): void {
  testDbOverride = (mockDb as DbInstance | null) ?? null;
}

export function normalizeDatabaseUrl(rawUrl: string): string {
  const unbracketed = rawUrl
    .trim()
    .replace(/^(postgresql:\/\/[^:]+:)\[([^\]]+)\](@.+)$/, "$1$2$3");
  try {
    const parsed = new URL(unbracketed);
    // 兼容 Neon (channel_binding=require) 与 Supabase (pgbouncer=true) 连接串参数
    parsed.searchParams.delete("channel_binding");
    parsed.searchParams.delete("pgbouncer");
    return parsed.toString();
  } catch {
    return unbracketed;
  }
}

export function shouldRequireTls(cleanUrl: string): boolean {
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.searchParams.has("sslmode")) {
      return false;
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

export function hasDatabaseConfigured(): boolean {
  if (testDbOverride) return true;
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && url.startsWith("postgres"));
}

export function getDb() {
  if (testDbOverride) {
    return testDbOverride;
  }
  if (!hasDatabaseConfigured()) {
    return null;
  }
  if (!cachedDb) {
    const cleanUrl = normalizeDatabaseUrl(process.env.DATABASE_URL!);
    const client = postgres(cleanUrl, {
      prepare: false, // 同时兼容 Supabase Pooler 与 Neon Pooler
      max: 3,
      connect_timeout: 10,
      idle_timeout: 20,
      ...(shouldRequireTls(cleanUrl) ? { ssl: "require" as const } : {}),
    });
    cachedDb = drizzle(client, { schema });
  }
  return cachedDb;
}
