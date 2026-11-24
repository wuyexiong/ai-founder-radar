import { timingSafeEqual } from "node:crypto";
import { isPlausibleArchiveDate, LOCALES } from "@/i18n/config";

export function isAuthorizedRevalidateToken(
  authHeader: string | null,
  expectedSecret: string | undefined
): boolean {
  const secret = expectedSecret?.trim();
  if (!secret || !authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const provided = match[1].trim();

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function collectRevalidatePaths(
  dateKey?: string | null,
  previousDateKey?: string | null
): string[] {
  const paths = new Set<string>(["/sitemap.xml"]);

  for (const loc of LOCALES) {
    paths.add(`/${loc}`);
    if (isPlausibleArchiveDate(dateKey)) {
      paths.add(`/${loc}/daily/${dateKey}`);
    }
    if (isPlausibleArchiveDate(previousDateKey)) {
      paths.add(`/${loc}/daily/${previousDateKey}`);
    }
  }

  return Array.from(paths);
}
