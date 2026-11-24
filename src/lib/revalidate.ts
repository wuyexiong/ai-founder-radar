import { timingSafeEqual } from "node:crypto";
import { isPlausibleArchiveDate, LOCALES } from "@/i18n/config";
import {
  isValidSourcePlatform,
  matchCanonicalTopics,
  type TopicMatchCandidate,
  type TopicSlug,
} from "@/lib/seo-taxonomy";
import type { SourcePlatform } from "@/types/signal";

export const SIGNALS_CORPUS_CACHE_TAG = "signals-corpus";

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
  const paths = new Set<string>([
    "/sitemap.xml",
    "/llms.txt",
    "/llms-full.txt",
  ]);

  for (const loc of LOCALES) {
    paths.add(`/${loc}`);
    paths.add(`/${loc}/feed.xml`);
    if (isPlausibleArchiveDate(dateKey)) {
      paths.add(`/${loc}/daily/${dateKey}`);
    }
    if (isPlausibleArchiveDate(previousDateKey)) {
      paths.add(`/${loc}/daily/${previousDateKey}`);
    }
  }

  return Array.from(paths);
}

export function buildIndexNowUrlList(params: {
  siteUrl: string;
  dateKey: string;
  items?: ReadonlyArray<TopicMatchCandidate & { id?: string; score?: number }>;
}): string[] {
  const base = params.siteUrl.trim().replace(/\/$/, "");
  const urls = new Set<string>();

  const matchedTopics = new Set<TopicSlug>();
  const matchedSources = new Set<SourcePlatform>();
  const signalIds = new Set<string>();

  for (const item of params.items ?? []) {
    if (isValidSourcePlatform(item.sourcePlatform)) {
      matchedSources.add(item.sourcePlatform);
    }
    for (const slug of matchCanonicalTopics(item)) {
      matchedTopics.add(slug);
    }
    if (
      item.id &&
      /^sig-[a-zA-Z0-9_-]{2,80}$/.test(item.id) &&
      (item.score === undefined || item.score >= 8.0) &&
      signalIds.size < 25
    ) {
      signalIds.add(item.id);
    }
  }

  for (const loc of LOCALES) {
    urls.add(`${base}/${loc}`);
    if (isPlausibleArchiveDate(params.dateKey)) {
      urls.add(`${base}/${loc}/daily/${params.dateKey}`);
    }
    for (const slug of matchedTopics) {
      urls.add(`${base}/${loc}/topic/${slug}`);
    }
    for (const platform of matchedSources) {
      urls.add(`${base}/${loc}/source/${platform}`);
    }
    for (const sigId of signalIds) {
      urls.add(`${base}/${loc}/signal/${encodeURIComponent(sigId)}`);
    }
  }

  return Array.from(urls);
}
