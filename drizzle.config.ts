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
