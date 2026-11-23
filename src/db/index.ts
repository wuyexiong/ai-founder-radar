import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

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

function shouldRequireTls(cleanUrl: string): boolean {
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.searchParams.has("sslmode")) {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

export function hasDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && url.startsWith("postgres"));
}

export function getDb() {
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
