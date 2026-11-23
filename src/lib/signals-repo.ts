import { desc, eq } from "drizzle-orm";
import localDatasetRaw from "@/data/local-signals.json";
import { getDb, hasDatabaseConfigured } from "@/db";
import { dailyStats, signalItems } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
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

export interface RadarPagePayload {
  locale: Locale;
  storageMode: "supabase" | "local-fallback";
  availableDates: string[];
  activeDate: string;
  overview: DailyOverview;
  items: SignalItem[];
  tools: IndieToolItem[];
}

function resolveLocalizedSignal(
  base: {
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
  },
  locale: Locale
): SignalItem {
  const translations = base.translations ?? {};

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
    score: base.score,
    isTopPick: base.isTopPick,
    sourcePlatform: base.sourcePlatform,
    sourceSublabel: base.sourceSublabel,
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

export async function getAllAvailableDates(): Promise<string[]> {
  const db = getDb();
  if (db && hasDatabaseConfigured()) {
    try {
      const statsRows = await db
        .select({ dateKey: dailyStats.dateKey })
        .from(dailyStats)
        .orderBy(desc(dailyStats.dateKey))
        .limit(90);
      if (statsRows.length > 0) {
        return statsRows.map((r) => r.dateKey);
      }
    } catch {
      // ignore and fall back to local dates
    }
  }
  return localDataset.overviews.map((o) => o.dateKey);
}

export async function getRadarPayload(
  locale: Locale = DEFAULT_LOCALE,
  requestedDate?: string
): Promise<RadarPagePayload> {
  const dict = getDictionary(locale);
  const localizedTools = dict.sidebar.tools;
  const db = getDb();

  if (db && hasDatabaseConfigured()) {
    try {
      const statsRows = await db
        .select()
        .from(dailyStats)
        .orderBy(desc(dailyStats.dateKey))
        .limit(60);

      if (statsRows.length > 0) {
        const availableDates = statsRows.map((r) => r.dateKey);
        const activeDate =
          requestedDate && availableDates.includes(requestedDate)
            ? requestedDate
            : availableDates[0];

        const activeOverviewRow =
          statsRows.find((r) => r.dateKey === activeDate) ?? statsRows[0];

        const dbItems = await db
          .select()
          .from(signalItems)
          .where(eq(signalItems.dateKey, activeDate))
          .orderBy(desc(signalItems.score));

        const mappedItems: SignalItem[] = dbItems.map((row) =>
          resolveLocalizedSignal(
            {
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
            },
            locale
          )
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
        "[IndieRadar] Supabase query failed, falling back to local dataset:",
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
  };
}
