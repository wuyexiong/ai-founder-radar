import { desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import localDatasetRaw from "@/data/local-signals.json";
import {
  getDb,
  hasDatabaseConfigured,
  isTestDbOverrideActive,
} from "@/db";
import { dailyStats, signalItems } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localizeSourceSublabel } from "@/lib/localize-sublabel";
import { SIGNALS_CORPUS_CACHE_TAG } from "@/lib/revalidate";
import {
  getSourceCopy,
  getTopicCopy,
  matchCanonicalTopics,
  SOURCE_PLATFORMS,
  TOPIC_SLUGS,
  type TopicSlug,
} from "@/lib/seo-taxonomy";
import { deriveTraditionalFields, toTraditionalTw } from "@/lib/zh-convert";
import type {
  DailyOverview,
  IndieToolItem,
  LocalizedSignalFields,
  MetricType,
  RadarDataset,
  SignalCategory,
  SignalItem,
  SignalTranslations,
  SourcePlatform,
  SummaryTranslations,
} from "@/types/signal";

const localDataset = localDatasetRaw as RadarDataset;

export interface HubContext {
  kind: "topic" | "source";
  slug: string;
  label: string;
  seoTitle: string;
  h1: string;
  description: string;
  totalSignals: number;
  revenueCount: number;
  painPointCount: number;
  avgScore: number;
  latestDateKey: string;
}

export interface ActiveTopicStat {
  slug: TopicSlug;
  count: number;
  revenueCount: number;
  lastModifiedDate: string;
}

export interface ActiveSourceStat {
  platform: SourcePlatform;
  count: number;
  revenueCount: number;
  lastModifiedDate: string;
}

export interface HubDirectory {
  topics: ActiveTopicStat[];
  sources: ActiveSourceStat[];
}

export interface RadarPagePayload {
  locale: Locale;
  storageMode: "supabase" | "local-fallback";
  isArchiveRoute?: boolean;
  availableDates: string[];
  activeDate: string;
  overview: DailyOverview;
  items: SignalItem[];
  tools: IndieToolItem[];
  hub?: HubContext;
  hubDirectory?: HubDirectory;
}

interface RawSignalRecord {
  id: string;
  dateKey: string;
  titleZh: string;
  titleOrig: string;
  category: SignalCategory;
  whatItIs: string;
  businessSignal: string;
  indieTakeaway: string;
  metricsBadge: string;
  metricType: MetricType;
  tags: string[];
  topics: TopicSlug[];
  score: number;
  isTopPick: boolean;
  sourcePlatform: SourcePlatform;
  sourceSublabel: string;
  sourceUrl: string;
  publishedAt: string;
  translations?: SignalTranslations | null;
}

interface RawDailyOverviewRecord {
  dateKey: string;
  scannedCount: number;
  selectedCount: number;
  estimatedReadMinutes: number;
  summaryNote: string;
  summaryTranslations?: SummaryTranslations | null;
}

function resolveLocalizedSignal(
  base: RawSignalRecord,
  locale: Locale
): SignalItem {
  const translations = base.translations ?? {};
  const matchedTopics = base.topics;

  let localized: LocalizedSignalFields;

  if (locale === "zh") {
    localized = {
      title: base.titleZh,
      whatItIs: base.whatItIs,
      businessSignal: base.businessSignal,
      indieTakeaway: base.indieTakeaway,
      metricsBadge: base.metricsBadge,
      tags: base.tags,
    };
  } else if (locale === "zh-TW") {
    localized =
      translations["zh-TW"] ??
      deriveTraditionalFields({
        title: base.titleZh,
        whatItIs: base.whatItIs,
        businessSignal: base.businessSignal,
        indieTakeaway: base.indieTakeaway,
        metricsBadge: base.metricsBadge,
        tags: base.tags,
      });
  } else if (locale === "en") {
    localized = translations.en ?? {
      title: base.titleOrig || base.titleZh,
      whatItIs: base.whatItIs,
      businessSignal: base.businessSignal,
      indieTakeaway: base.indieTakeaway,
      metricsBadge: base.metricsBadge,
      tags: base.tags,
    };
  } else {
    localized = translations.ja ?? {
      title: base.titleOrig || base.titleZh,
      whatItIs: base.whatItIs,
      businessSignal: base.businessSignal,
      indieTakeaway: base.indieTakeaway,
      metricsBadge: base.metricsBadge,
      tags: base.tags,
    };
  }

  return {
    id: base.id,
    dateKey: base.dateKey,
    title: localized.title || base.titleOrig || base.titleZh,
    titleZh: base.titleZh,
    titleOrig: base.titleOrig,
    category: base.category,
    whatItIs: localized.whatItIs || base.whatItIs,
    businessSignal: localized.businessSignal || base.businessSignal,
    indieTakeaway: localized.indieTakeaway || base.indieTakeaway,
    metricsBadge: localized.metricsBadge || base.metricsBadge,
    metricType: base.metricType,
    tags:
      localized.tags && localized.tags.length > 0 ? localized.tags : base.tags,
    topics: matchedTopics,
    score: base.score,
    isTopPick: base.isTopPick,
    sourcePlatform: base.sourcePlatform,
    sourceSublabel: localizeSourceSublabel(
      base.sourceSublabel,
      locale,
      toTraditionalTw
    ),
    sourceUrl: base.sourceUrl,
    publishedAt: base.publishedAt,
  };
}

function resolveLocalizedSummary(
  summaryZh: string,
  summaryTranslations: SummaryTranslations | null | undefined,
  locale: Locale,
  selectedCount: number
): string {
  if (locale === "zh") return summaryZh;
  if (locale === "zh-TW") {
    return summaryTranslations?.["zh-TW"] || toTraditionalTw(summaryZh);
  }
  if (locale === "en") {
    return (
      summaryTranslations?.en ||
      `Curated ${selectedCount} verified Micro-SaaS launches, real MRR case studies, and high-intent user pain points.`
    );
  }
  return (
    summaryTranslations?.ja ||
    `本日は海外の最新プロダクト、リアルなMRR収益事例、ユーザーの課題シグナルから厳選した ${selectedCount} 件をお届けします。`
  );
}

const ARCHIVE_DATES_LIMIT = 365;
// Cap full multi-locale JSONB corpus per unstable_cache entry strictly below Next.js 2MB limit (~360 * 3.2KB ≈ 1.15MB)
export const RECENT_CORPUS_CACHE_LIMIT = 360;
const HUB_SCAN_WINDOW_LIMIT = 1500;
const HUB_DISPLAY_ITEMS_LIMIT = 200;
const CORPUS_CACHE_REVALIDATE_SECONDS = 600;
const CORPUS_MEMORY_TTL_MS = CORPUS_CACHE_REVALIDATE_SECONDS * 1000;

interface MemoryCacheEntry {
  expiresAt: number;
  value: unknown;
}

const globalForSignalsRepo = globalThis as unknown as {
  __afrRepoMemoryCache?: Map<string, MemoryCacheEntry>;
  __afrRepoInFlightCache?: Map<string, Promise<unknown>>;
};

const repoMemoryCache =
  globalForSignalsRepo.__afrRepoMemoryCache ??
  (globalForSignalsRepo.__afrRepoMemoryCache = new Map<
    string,
    MemoryCacheEntry
  >());

const repoInFlightCache =
  globalForSignalsRepo.__afrRepoInFlightCache ??
  (globalForSignalsRepo.__afrRepoInFlightCache = new Map<
    string,
    Promise<unknown>
  >());

export function clearSignalsRepoMemoryCache(): void {
  repoMemoryCache.clear();
  repoInFlightCache.clear();
}

async function runWithCorpusCache<T>(
  cacheKey: string,
  loader: () => Promise<T>
): Promise<T> {
  if (isTestDbOverrideActive()) {
    return loader();
  }

  const scopedKey = `${cacheKey}:${hasDatabaseConfigured() ? "supabase" : "local"}`;
  const now = Date.now();
  const hit = repoMemoryCache.get(scopedKey);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const pending = repoInFlightCache.get(scopedKey);
  if (pending) {
    return pending as Promise<T>;
  }

  const execute = (async (): Promise<T> => {
    let result: T;
    try {
      const nextCachedLoader = unstable_cache(loader, [scopedKey], {
        revalidate: CORPUS_CACHE_REVALIDATE_SECONDS,
        tags: [SIGNALS_CORPUS_CACHE_TAG],
      });
      result = await nextCachedLoader();
    } catch {
      // Standalone CLI / node:test environment without Next.js incrementalCache store
      result = await loader();
    }

    repoMemoryCache.set(scopedKey, {
      expiresAt: Date.now() + CORPUS_MEMORY_TTL_MS,
      value: result,
    });
    return result;
  })();

  repoInFlightCache.set(scopedKey, execute);
  try {
    return await execute;
  } finally {
    repoInFlightCache.delete(scopedKey);
  }
}

function mapDbRowToRawRecord(
  row: typeof signalItems.$inferSelect
): RawSignalRecord {
  const tags = row.tags ?? [];
  const candidate = {
    titleZh: row.titleZh,
    titleOrig: row.titleOrig,
    whatItIs: row.whatItIs,
    businessSignal: row.businessSignal,
    indieTakeaway: row.indieTakeaway,
    tags,
    sourcePlatform: row.sourcePlatform as SourcePlatform,
    sourceSublabel: row.sourceSublabel,
    translations: row.translations,
  };

  return {
    id: row.id,
    dateKey: row.dateKey,
    titleZh: row.titleZh,
    titleOrig: row.titleOrig,
    category: row.category as SignalCategory,
    whatItIs: row.whatItIs,
    businessSignal: row.businessSignal,
    indieTakeaway: row.indieTakeaway,
    metricsBadge: row.metricsBadge,
    metricType: row.metricType as MetricType,
    tags,
    topics: matchCanonicalTopics(candidate),
    score: row.score,
    isTopPick: row.isTopPick,
    sourcePlatform: row.sourcePlatform as SourcePlatform,
    sourceSublabel: row.sourceSublabel,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt.toISOString(),
    translations: row.translations,
  };
}

function getLocalRawRecords(): RawSignalRecord[] {
  return [...localDataset.items]
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) {
        return b.dateKey.localeCompare(a.dateKey);
      }
      return b.score - a.score;
    })
    .map((item) => ({
      ...item,
      topics: matchCanonicalTopics(item),
      publishedAt: item.publishedAt,
    }));
}

async function loadRecentRawSignalsUncached(): Promise<{
  storageMode: "supabase" | "local-fallback";
  records: RawSignalRecord[];
}> {
  const db = getDb();
  if (db && hasDatabaseConfigured()) {
    try {
      const rows = await db
        .select()
        .from(signalItems)
        .orderBy(desc(signalItems.dateKey), desc(signalItems.score))
        .limit(RECENT_CORPUS_CACHE_LIMIT);

      if (rows.length > 0) {
        return {
          storageMode: "supabase",
          records: rows.map(mapDbRowToRawRecord),
        };
      }
    } catch (error) {
      const safeMsg =
        error instanceof Error
          ? error.message.replace(
              /(postgres(?:ql)?:\/\/)([^@\s]+)@/gi,
              "$1***@"
            )
          : "Database query error";
      console.warn(
        "[AI Founder Radar] Hub corpus query failed, falling back to local dataset:",
        safeMsg
      );
    }
  }

  return {
    storageMode: "local-fallback",
    records: getLocalRawRecords(),
  };
}

const getRecentRawSignals = cache(
  async (): Promise<{
    storageMode: "supabase" | "local-fallback";
    records: RawSignalRecord[];
  }> => runWithCorpusCache("afr-recent-raw-signals-v1", loadRecentRawSignalsUncached)
);

async function computeSeoHubIndexUncached(): Promise<HubDirectory> {
  const recent = await getRecentRawSignals();
  let records = recent.records;

  // When DB exceeds the 360-row 2MB-safe cache window, scan up to 1,500 rows and cache ONLY the ~2KB HubDirectory summary
  if (
    recent.storageMode === "supabase" &&
    recent.records.length >= RECENT_CORPUS_CACHE_LIMIT
  ) {
    const db = getDb();
    if (db && hasDatabaseConfigured()) {
      try {
        const widerRows = await db
          .select()
          .from(signalItems)
          .orderBy(desc(signalItems.dateKey), desc(signalItems.score))
          .limit(HUB_SCAN_WINDOW_LIMIT);
        if (widerRows.length > 0) {
          records = widerRows.map(mapDbRowToRawRecord);
        }
      } catch {
        // Fall back to recent 360-row slice
      }
    }
  }

  const topicMap = new Map<TopicSlug, ActiveTopicStat>();
  const sourceMap = new Map<SourcePlatform, ActiveSourceStat>();

  for (const record of records) {
    const isRevenue =
      record.category === "revenue" || record.metricType === "revenue";

    // Source aggregation
    const prevSource = sourceMap.get(record.sourcePlatform);
    if (!prevSource) {
      sourceMap.set(record.sourcePlatform, {
        platform: record.sourcePlatform,
        count: 1,
        revenueCount: isRevenue ? 1 : 0,
        lastModifiedDate: record.dateKey,
      });
    } else {
      prevSource.count += 1;
      if (isRevenue) prevSource.revenueCount += 1;
      if (record.dateKey > prevSource.lastModifiedDate) {
        prevSource.lastModifiedDate = record.dateKey;
      }
    }

    // Canonical Topic aggregation (uses pre-computed topics on RawSignalRecord)
    for (const slug of record.topics) {
      const prevTopic = topicMap.get(slug);
      if (!prevTopic) {
        topicMap.set(slug, {
          slug,
          count: 1,
          revenueCount: isRevenue ? 1 : 0,
          lastModifiedDate: record.dateKey,
        });
      } else {
        prevTopic.count += 1;
        if (isRevenue) prevTopic.revenueCount += 1;
        if (record.dateKey > prevTopic.lastModifiedDate) {
          prevTopic.lastModifiedDate = record.dateKey;
        }
      }
    }
  }

  const topics = TOPIC_SLUGS.map((slug) => topicMap.get(slug))
    .filter((stat): stat is ActiveTopicStat => Boolean(stat && stat.count > 0))
    .sort((a, b) => b.count - a.count);

  const sources = SOURCE_PLATFORMS.map((p) => sourceMap.get(p))
    .filter(
      (stat): stat is ActiveSourceStat => Boolean(stat && stat.count > 0)
    )
    .sort((a, b) => b.count - a.count);

  return { topics, sources };
}

export const getSeoHubIndex = cache(
  async (): Promise<HubDirectory> =>
    runWithCorpusCache("afr-seo-hub-index-v1", computeSeoHubIndexUncached)
);

async function loadAllDailyOverviewsUncached(): Promise<{
  storageMode: "supabase" | "local-fallback";
  overviews: RawDailyOverviewRecord[];
}> {
  const db = getDb();
  if (db && hasDatabaseConfigured()) {
    try {
      const statsRows = await db
        .select()
        .from(dailyStats)
        .orderBy(desc(dailyStats.dateKey))
        .limit(ARCHIVE_DATES_LIMIT);

      if (statsRows.length > 0) {
        return {
          storageMode: "supabase",
          overviews: statsRows.map((r) => ({
            dateKey: r.dateKey,
            scannedCount: r.scannedCount,
            selectedCount: r.selectedCount,
            estimatedReadMinutes: r.estimatedReadMinutes,
            summaryNote: r.summaryNote,
            summaryTranslations: r.summaryTranslations,
          })),
        };
      }
    } catch {
      // ignore and fall back to local overviews
    }
  }

  return {
    storageMode: "local-fallback",
    overviews: localDataset.overviews.map((o) => ({
      dateKey: o.dateKey,
      scannedCount: o.scannedCount,
      selectedCount: o.selectedCount,
      estimatedReadMinutes: o.estimatedReadMinutes,
      summaryNote: o.summaryNote,
      summaryTranslations: o.summaryTranslations,
    })),
  };
}

const getAllDailyOverviews = cache(
  async (): Promise<{
    storageMode: "supabase" | "local-fallback";
    overviews: RawDailyOverviewRecord[];
  }> => runWithCorpusCache("afr-daily-overviews-v1", loadAllDailyOverviewsUncached)
);

export const getAllAvailableDates = cache(
  async (): Promise<string[]> => {
    const { overviews } = await getAllDailyOverviews();
    return overviews.map((o) => o.dateKey);
  }
);

async function loadDateRawRecordsByQuery(
  dateKey: string
): Promise<RawSignalRecord[]> {
  const db = getDb();
  if (!db || !hasDatabaseConfigured()) return [];
  const rows = await db
    .select()
    .from(signalItems)
    .where(eq(signalItems.dateKey, dateKey))
    .orderBy(desc(signalItems.score));
  return rows.map(mapDbRowToRawRecord);
}

export const getRecentLocalizedSignals = cache(
  async (
    locale: Locale = DEFAULT_LOCALE,
    limit = 40
  ): Promise<{ latestDateKey: string; items: SignalItem[] }> => {
    const [dates, corpus] = await Promise.all([
      getAllAvailableDates(),
      getRecentRawSignals(),
    ]);
    const capped = corpus.records.slice(0, Math.max(1, limit));
    const items = capped.map((rec) => resolveLocalizedSignal(rec, locale));
    const latestDateKey =
      items[0]?.dateKey ?? dates[0] ?? "2026-11-23";
    return { latestDateKey, items };
  }
);

export const getRadarPayload = cache(
  async (
    locale: Locale = DEFAULT_LOCALE,
    requestedDate?: string,
    isArchiveRoute = false
  ): Promise<RadarPagePayload> => {
    const dict = getDictionary(locale);
    const localizedTools = dict.sidebar.tools;
    const [hubDirectory, dailyMeta, corpus] = await Promise.all([
      getSeoHubIndex(),
      getAllDailyOverviews(),
      getRecentRawSignals(),
    ]);

    if (
      dailyMeta.storageMode === "supabase" &&
      dailyMeta.overviews.length > 0
    ) {
      try {
        const availableDates = dailyMeta.overviews.map((o) => o.dateKey);
        let activeOverviewRow: RawDailyOverviewRecord | undefined =
          requestedDate
            ? dailyMeta.overviews.find((o) => o.dateKey === requestedDate)
            : undefined;

        // 仅当历史归档超过 365 天上限时按需单点回查一次 daily_stats
        const oldestCachedOverviewDate =
          availableDates[availableDates.length - 1];
        if (
          !activeOverviewRow &&
          requestedDate &&
          dailyMeta.overviews.length >= ARCHIVE_DATES_LIMIT &&
          oldestCachedOverviewDate &&
          requestedDate < oldestCachedOverviewDate
        ) {
          const db = getDb();
          if (db) {
            const exactRows = await db
              .select()
              .from(dailyStats)
              .where(eq(dailyStats.dateKey, requestedDate))
              .limit(1);
            if (exactRows[0]) {
              activeOverviewRow = {
                dateKey: exactRows[0].dateKey,
                scannedCount: exactRows[0].scannedCount,
                selectedCount: exactRows[0].selectedCount,
                estimatedReadMinutes: exactRows[0].estimatedReadMinutes,
                summaryNote: exactRows[0].summaryNote,
                summaryTranslations: exactRows[0].summaryTranslations,
              };
            }
          }
        }

        if (!activeOverviewRow) {
          activeOverviewRow = dailyMeta.overviews[0];
        }

        const activeDate = activeOverviewRow.dateKey;
        const oldestCorpusDate =
          corpus.records[corpus.records.length - 1]?.dateKey;
        const isFullyCoveredInCorpus =
          corpus.storageMode === "supabase" &&
          (corpus.records.length < RECENT_CORPUS_CACHE_LIMIT ||
            (Boolean(oldestCorpusDate) && activeDate > oldestCorpusDate));

        const dayRawRecords = isFullyCoveredInCorpus
          ? corpus.records.filter((r) => r.dateKey === activeDate)
          : await runWithCorpusCache(`afr-day-items-v1:${activeDate}`, () =>
              loadDateRawRecordsByQuery(activeDate)
            );

        const mappedItems: SignalItem[] = dayRawRecords.map((rec) =>
          resolveLocalizedSignal(rec, locale)
        );

        return {
          locale,
          storageMode: "supabase",
          isArchiveRoute,
          availableDates,
          activeDate,
          overview: {
            dateKey: activeOverviewRow.dateKey,
            scannedCount: activeOverviewRow.scannedCount,
            selectedCount: activeOverviewRow.selectedCount,
            estimatedReadMinutes: activeOverviewRow.estimatedReadMinutes,
            summaryNote: resolveLocalizedSummary(
              activeOverviewRow.summaryNote,
              activeOverviewRow.summaryTranslations,
              locale,
              activeOverviewRow.selectedCount
            ),
          },
          items: mappedItems,
          tools: localizedTools,
          hubDirectory,
        };
      } catch (error) {
        const safeMsg =
          error instanceof Error
            ? error.message.replace(
                /(postgres(?:ql)?:\/\/)([^@\s]+)@/gi,
                "$1***@"
              )
            : "Database query error";
        console.warn(
          "[AI Founder Radar] Supabase query failed, falling back to local dataset:",
          safeMsg
        );
      }
    }

    const availableDates = localDataset.overviews.map((o) => o.dateKey);
    const activeDate =
      requestedDate && availableDates.includes(requestedDate)
        ? requestedDate
        : availableDates[0];

    const rawOverview =
      localDataset.overviews.find((o) => o.dateKey === activeDate) ??
      localDataset.overviews[0];

    const items = corpus.records
      .filter((item) => item.dateKey === activeDate)
      .map((item) => resolveLocalizedSignal(item, locale));

    return {
      locale,
      storageMode: "local-fallback",
      isArchiveRoute,
      availableDates,
      activeDate,
      overview: {
        dateKey: rawOverview.dateKey,
        scannedCount: rawOverview.scannedCount,
        selectedCount: rawOverview.selectedCount,
        estimatedReadMinutes: rawOverview.estimatedReadMinutes,
        summaryNote: resolveLocalizedSummary(
          rawOverview.summaryNote,
          rawOverview.summaryTranslations,
          locale,
          rawOverview.selectedCount
        ),
      },
      items,
      tools: localizedTools,
      hubDirectory,
    };
  }
);

function buildHubPayloadFromMatchedRecords(params: {
  locale: Locale;
  storageMode: "supabase" | "local-fallback";
  availableDates: string[];
  hubDirectory: HubDirectory;
  kind: "topic" | "source";
  slug: string;
  label: string;
  seoTitle: string;
  h1: string;
  description: string;
  matchedRecords: RawSignalRecord[];
}): RadarPagePayload {
  const {
    locale,
    storageMode,
    availableDates,
    hubDirectory,
    kind,
    slug,
    label,
    seoTitle,
    h1,
    description,
    matchedRecords,
  } = params;

  const dict = getDictionary(locale);
  const capped = matchedRecords.slice(0, HUB_DISPLAY_ITEMS_LIMIT);
  const items = capped.map((rec) => resolveLocalizedSignal(rec, locale));

  const revenueCount = items.filter(
    (it) => it.category === "revenue" || it.metricType === "revenue"
  ).length;
  const painPointCount = items.filter(
    (it) => it.category === "pain_point" || it.metricType === "pain"
  ).length;
  const avgScore =
    items.length > 0
      ? Number(
          (
            items.reduce((acc, it) => acc + it.score, 0) / items.length
          ).toFixed(1)
        )
      : 0;
  const latestDateKey =
    items[0]?.dateKey ?? availableDates[0] ?? "2026-11-23";

  return {
    locale,
    storageMode,
    availableDates,
    activeDate: latestDateKey,
    overview: {
      dateKey: latestDateKey,
      scannedCount: matchedRecords.length,
      selectedCount: items.length,
      estimatedReadMinutes: Math.max(2, Math.ceil(items.length / 3.5)),
      summaryNote: description,
    },
    items,
    tools: dict.sidebar.tools,
    hub: {
      kind,
      slug,
      label,
      seoTitle,
      h1,
      description,
      totalSignals: items.length,
      revenueCount,
      painPointCount,
      avgScore,
      latestDateKey,
    },
    hubDirectory,
  };
}

export const getTopicHubPayload = cache(
  async (locale: Locale, slug: TopicSlug): Promise<RadarPagePayload> => {
    const [availableDates, hubDirectory, corpus] = await Promise.all([
      getAllAvailableDates(),
      getSeoHubIndex(),
      getRecentRawSignals(),
    ]);

    const copy = getTopicCopy(slug, locale);
    let matchedRecords = corpus.records.filter((rec) =>
      rec.topics.includes(slug)
    );

    if (
      corpus.storageMode === "supabase" &&
      corpus.records.length >= RECENT_CORPUS_CACHE_LIMIT
    ) {
      const db = getDb();
      if (db && hasDatabaseConfigured()) {
        try {
          matchedRecords = await runWithCorpusCache(
            `afr-topic-items-v1:${slug}`,
            async () => {
              const rows = await db
                .select()
                .from(signalItems)
                .orderBy(desc(signalItems.dateKey), desc(signalItems.score))
                .limit(HUB_SCAN_WINDOW_LIMIT);
              return rows
                .map(mapDbRowToRawRecord)
                .filter((rec) => rec.topics.includes(slug))
                .slice(0, HUB_DISPLAY_ITEMS_LIMIT);
            }
          );
        } catch {
          // Fall back to recent cached corpus slice
        }
      }
    }

    return buildHubPayloadFromMatchedRecords({
      locale,
      storageMode: corpus.storageMode,
      availableDates,
      hubDirectory,
      kind: "topic",
      slug,
      label: copy.label,
      seoTitle: copy.seoTitle,
      h1: copy.h1,
      description: copy.description,
      matchedRecords,
    });
  }
);

export const getSourceHubPayload = cache(
  async (
    locale: Locale,
    platform: SourcePlatform
  ): Promise<RadarPagePayload> => {
    const [availableDates, hubDirectory, corpus] = await Promise.all([
      getAllAvailableDates(),
      getSeoHubIndex(),
      getRecentRawSignals(),
    ]);
    const copy = getSourceCopy(platform, locale);

    // 当语料窗口未触及 360 条安全缓存上限时，直接从内存零查询切片返回
    if (corpus.records.length < RECENT_CORPUS_CACHE_LIMIT) {
      const matchedRecords = corpus.records.filter(
        (rec) => rec.sourcePlatform === platform
      );
      return buildHubPayloadFromMatchedRecords({
        locale,
        storageMode: corpus.storageMode,
        availableDates,
        hubDirectory,
        kind: "source",
        slug: platform,
        label: copy.label,
        seoTitle: copy.seoTitle,
        h1: copy.h1,
        description: copy.description,
        matchedRecords,
      });
    }

    const db = getDb();
    if (db && hasDatabaseConfigured() && corpus.storageMode === "supabase") {
      try {
        const rows = await runWithCorpusCache(
          `afr-source-items-v1:${platform}`,
          () =>
            db
              .select()
              .from(signalItems)
              .where(eq(signalItems.sourcePlatform, platform))
              .orderBy(desc(signalItems.dateKey), desc(signalItems.score))
              .limit(HUB_DISPLAY_ITEMS_LIMIT)
        );
        return buildHubPayloadFromMatchedRecords({
          locale,
          storageMode: "supabase",
          availableDates,
          hubDirectory,
          kind: "source",
          slug: platform,
          label: copy.label,
          seoTitle: copy.seoTitle,
          h1: copy.h1,
          description: copy.description,
          matchedRecords: rows.map(mapDbRowToRawRecord),
        });
      } catch {
        // Fall through to cached corpus slice
      }
    }

    const matchedRecords = corpus.records.filter(
      (rec) => rec.sourcePlatform === platform
    );

    return buildHubPayloadFromMatchedRecords({
      locale,
      storageMode: corpus.storageMode,
      availableDates,
      hubDirectory,
      kind: "source",
      slug: platform,
      label: copy.label,
      seoTitle: copy.seoTitle,
      h1: copy.h1,
      description: copy.description,
      matchedRecords,
    });
  }
);
