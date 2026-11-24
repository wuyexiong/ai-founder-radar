import type { Locale } from "@/i18n/config";

export type SignalCategory = "launch" | "revenue" | "pain_point" | "ai_trend";

export type SourcePlatform =
  | "producthunt"
  | "hackernews"
  | "reddit"
  | "indiehackers"
  | "acquire"
  | "github"
  | "trustmrr"
  | "appstore";

export type MetricType = "revenue" | "heat" | "pain";

export interface LocalizedSignalFields {
  title: string;
  whatItIs: string;
  businessSignal: string;
  indieTakeaway: string;
  metricsBadge?: string;
  tags: string[];
}

export type SignalTranslations = Partial<
  Record<Exclude<Locale, "zh">, LocalizedSignalFields>
>;

export type SummaryTranslations = Partial<Record<Exclude<Locale, "zh">, string>>;

export interface SignalItem {
  id: string;
  dateKey: string; // YYYY-MM-DD
  title: string; // 当前语种标题
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
  translations?: SignalTranslations;
}

export interface DailyOverview {
  dateKey: string;
  scannedCount: number;
  selectedCount: number;
  estimatedReadMinutes: number;
  summaryNote: string;
  summaryTranslations?: SummaryTranslations;
}

export interface IndieToolItem {
  name: string;
  tagline: string;
  category: string;
  freeTierNote: string;
  url: string;
}

export interface RadarDataset {
  overviews: Array<Omit<DailyOverview, "summaryNote"> & { summaryNote: string }>;
  items: Array<Omit<SignalItem, "title"> & { title?: string }>;
  tools?: IndieToolItem[];
}
