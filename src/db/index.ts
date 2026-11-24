import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __afrCachedDb?: DbInstance | null;
  __afrCachedDbUrl?: string | null;
};

let testDbOverride: DbInstance | null = null;

export function setDbForTests(mockDb: unknown | null): void {
  testDbOverride = (mockDb as DbInstance | null) ?? null;
}

export function isTestDbOverrideActive(): boolean {
  return testDbOverride !== null;
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
  const cleanUrl = normalizeDatabaseUrl(process.env.DATABASE_URL!);
  if (!globalForDb.__afrCachedDb || globalForDb.__afrCachedDbUrl !== cleanUrl) {
    const client = postgres(cleanUrl, {
      prepare: false, // 同时兼容 Supabase Pooler 与 Neon Pooler
      max: 5,
      connect_timeout: 10,
      idle_timeout: 60,
      ...(shouldRequireTls(cleanUrl) ? { ssl: "require" as const } : {}),
    });
    globalForDb.__afrCachedDb = drizzle(client, { schema });
    globalForDb.__afrCachedDbUrl = cleanUrl;
  }
  return globalForDb.__afrCachedDb;
}
