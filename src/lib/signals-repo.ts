import { desc, eq } from "drizzle-orm";
import { cache } from "react";
import localDatasetRaw from "@/data/local-signals.json";
import { getDb, hasDatabaseConfigured } from "@/db";
import { dailyStats, signalItems } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localizeSourceSublabel } from "@/lib/localize-sublabel";
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
  score: number;
  isTopPick: boolean;
  sourcePlatform: SourcePlatform;
  sourceSublabel: string;
  sourceUrl: string;
  publishedAt: string;
  translations?: SignalTranslations | null;
}

function resolveLocalizedSignal(
  base: RawSignalRecord,
  locale: Locale
): SignalItem {
  const translations = base.translations ?? {};
  const matchedTopics = matchCanonicalTopics(base);

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
const HUB_SCAN_WINDOW_LIMIT = 1500;
const HUB_DISPLAY_ITEMS_LIMIT = 200;

function mapDbRowToRawRecord(
  row: typeof signalItems.$inferSelect
): RawSignalRecord {
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
    tags: row.tags ?? [],
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
      publishedAt: item.publishedAt,
    }));
}

const getRecentRawSignals = cache(
  async (): Promise<{
    storageMode: "supabase" | "local-fallback";
    records: RawSignalRecord[];
  }> => {
    const db = getDb();
    if (db && hasDatabaseConfigured()) {
      try {
        const rows = await db
          .select()
          .from(signalItems)
          .orderBy(desc(signalItems.dateKey), desc(signalItems.score))
          .limit(HUB_SCAN_WINDOW_LIMIT);

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
);

export const getSeoHubIndex = cache(async (): Promise<HubDirectory> => {
  const { records } = await getRecentRawSignals();

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

    // Canonical Topic aggregation
    const topics = matchCanonicalTopics(record);
    for (const slug of topics) {
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
});

export const getAllAvailableDates = cache(async (): Promise<string[]> => {
  const db = getDb();
  if (db && hasDatabaseConfigured()) {
    try {
      const statsRows = await db
        .select({ dateKey: dailyStats.dateKey })
        .from(dailyStats)
        .orderBy(desc(dailyStats.dateKey))
        .limit(ARCHIVE_DATES_LIMIT);
      if (statsRows.length > 0) {
        return statsRows.map((r) => r.dateKey);
      }
    } catch {
      // ignore and fall back to local dates
    }
  }
  return localDataset.overviews.map((o) => o.dateKey);
});

export const getRadarPayload = cache(
  async (
    locale: Locale = DEFAULT_LOCALE,
    requestedDate?: string
  ): Promise<RadarPagePayload> => {
    const dict = getDictionary(locale);
    const localizedTools = dict.sidebar.tools;
    const hubDirectory = await getSeoHubIndex();
    const db = getDb();

    if (db && hasDatabaseConfigured()) {
      try {
        const dateRows = await db
          .select({ dateKey: dailyStats.dateKey })
          .from(dailyStats)
          .orderBy(desc(dailyStats.dateKey))
          .limit(ARCHIVE_DATES_LIMIT);

        if (dateRows.length > 0) {
          const availableDates = dateRows.map((r) => r.dateKey);
          let activeOverviewRow:
            | (typeof dailyStats.$inferSelect)
            | undefined = undefined;

          if (requestedDate) {
            const exactRows = await db
              .select()
              .from(dailyStats)
              .where(eq(dailyStats.dateKey, requestedDate))
              .limit(1);
            activeOverviewRow = exactRows[0];
          }

          if (!activeOverviewRow) {
            const latestRows = await db
              .select()
              .from(dailyStats)
              .where(eq(dailyStats.dateKey, availableDates[0]))
              .limit(1);
            activeOverviewRow = latestRows[0];
          }

          if (activeOverviewRow) {
            const activeDate = activeOverviewRow.dateKey;
            const dbItems = await db
              .select()
              .from(signalItems)
              .where(eq(signalItems.dateKey, activeDate))
              .orderBy(desc(signalItems.score));

            const mappedItems: SignalItem[] = dbItems.map((row) =>
              resolveLocalizedSignal(mapDbRowToRawRecord(row), locale)
            );

            return {
              locale,
              storageMode: "supabase",
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
          }
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

    const items = localDataset.items
      .filter((item) => item.dateKey === activeDate)
      .sort((a, b) => b.score - a.score)
      .map((item) =>
        resolveLocalizedSignal(
          {
            ...item,
            publishedAt: item.publishedAt,
          },
          locale
        )
      );

    return {
      locale,
      storageMode: "local-fallback",
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
    const matchedRecords = corpus.records.filter((rec) =>
      matchCanonicalTopics(rec).includes(slug)
    );

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
    const [availableDates, hubDirectory] = await Promise.all([
      getAllAvailableDates(),
      getSeoHubIndex(),
    ]);
    const copy = getSourceCopy(platform, locale);

    const db = getDb();
    if (db && hasDatabaseConfigured()) {
      try {
        const rows = await db
          .select()
          .from(signalItems)
          .where(eq(signalItems.sourcePlatform, platform))
          .orderBy(desc(signalItems.dateKey), desc(signalItems.score))
          .limit(HUB_DISPLAY_ITEMS_LIMIT);

        // Only treat Supabase as active when dailyStats has data; otherwise local fallback may apply
        if (rows.length > 0 || availableDates.length > 0) {
          const statsCheck = await db
            .select({ dateKey: dailyStats.dateKey })
            .from(dailyStats)
            .limit(1);
          if (statsCheck.length > 0) {
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
          }
        }
      } catch {
        // Fall through to cached corpus / local dataset
      }
    }

    const corpus = await getRecentRawSignals();
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
