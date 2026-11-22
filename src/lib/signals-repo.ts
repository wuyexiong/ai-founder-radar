import { desc, eq } from "drizzle-orm";
import localDatasetRaw from "@/data/local-signals.json";
import { getDb, hasDatabaseConfigured } from "@/db";
import { dailyStats, signalItems } from "@/db/schema";
import type {
  DailyOverview,
  IndieToolItem,
  MetricType,
  RadarDataset,
  SignalCategory,
  SignalItem,
  SourcePlatform,
} from "@/types/signal";

const localDataset = localDatasetRaw as RadarDataset;

export interface RadarPagePayload {
  storageMode: "supabase" | "local-fallback";
  availableDates: string[];
  activeDate: string;
  overview: DailyOverview;
  items: SignalItem[];
  tools: IndieToolItem[];
}

export async function getRadarPayload(requestedDate?: string): Promise<RadarPagePayload> {
  const db = getDb();

  if (db && hasDatabaseConfigured()) {
    try {
      const statsRows = await db
        .select()
        .from(dailyStats)
        .orderBy(desc(dailyStats.dateKey))
        .limit(30);

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

        const mappedItems: SignalItem[] = dbItems.map((row) => ({
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
        }));

        return {
          storageMode: "supabase",
          availableDates,
          activeDate,
          overview: {
            dateKey: activeOverviewRow.dateKey,
            scannedCount: activeOverviewRow.scannedCount,
            selectedCount: activeOverviewRow.selectedCount,
            estimatedReadMinutes: activeOverviewRow.estimatedReadMinutes,
            summaryNote: activeOverviewRow.summaryNote,
          },
          items: mappedItems,
          tools: localDataset.tools,
        };
      }
    } catch (error) {
      console.warn("[IndieRadar] Supabase query failed, falling back to local dataset:", error);
    }
  }

  const availableDates = localDataset.overviews.map((o) => o.dateKey);
  const activeDate =
    requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : availableDates[0];

  const overview =
    localDataset.overviews.find((o) => o.dateKey === activeDate) ??
    localDataset.overviews[0];

  const items = localDataset.items
    .filter((item) => item.dateKey === activeDate)
    .sort((a, b) => b.score - a.score);

  return {
    storageMode: "local-fallback",
    availableDates,
    activeDate,
    overview,
    items,
    tools: localDataset.tools,
  };
}
