export type SignalCategory = "launch" | "revenue" | "pain_point" | "ai_trend";

export type SourcePlatform =
  | "producthunt"
  | "hackernews"
  | "reddit"
  | "github"
  | "trustmrr"
  | "appstore";

export type MetricType = "revenue" | "heat" | "pain";

export interface SignalItem {
  id: string;
  dateKey: string; // YYYY-MM-DD
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
}

export interface DailyOverview {
  dateKey: string;
  scannedCount: number;
  selectedCount: number;
  estimatedReadMinutes: number;
  summaryNote: string;
}

export interface IndieToolItem {
  name: string;
  tagline: string;
  category: string;
  freeTierNote: string;
  url: string;
}

export interface RadarDataset {
  overviews: DailyOverview[];
  items: SignalItem[];
  tools: IndieToolItem[];
}
