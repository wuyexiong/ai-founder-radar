import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

function cleanUrl(raw?: string): string {
  if (!raw) return "postgresql://postgres:postgres@localhost:5432/postgres";
  const unbracketed = raw
    .trim()
    .replace(/^(postgresql:\/\/[^:]+:)\[([^\]]+)\](@.+)$/, "$1$2$3");
  try {
    const u = new URL(unbracketed);
    u.searchParams.delete("channel_binding");
    u.searchParams.delete("pgbouncer");
    // Supabase Pooler 6543 (Transaction Mode) 不支持 drizzle-kit 预编译内省，自动切至同主机 5432 (Session Mode)
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") {
      u.port = "5432";
    }
    return u.toString();
  } catch {
    return unbracketed;
  }
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: cleanUrl(process.env.DATABASE_URL),
  },
});
