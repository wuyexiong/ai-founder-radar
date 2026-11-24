import type { Locale } from "@/i18n/config";

type LocalizedText = Record<Locale, string>;

const EXACT_SUBLABEL_MAP: Record<string, LocalizedText> = {
  "TrustMRR 实名榜": {
    en: "Verified Leaderboard",
    zh: "实名验证榜",
    "zh-TW": "實名驗證榜",
    ja: "認証済み収益ランキング",
  },
  "TrustMRR 飙升榜": {
    en: "Trending MRR",
    zh: "飙升榜",
    "zh-TW": "飆升榜",
    ja: "急上昇ランキング",
  },
  "TrustMRR 动态": {
    en: "Founder Updates",
    zh: "创始人动态",
    "zh-TW": "創辦人動態",
    ja: "開発者アップデート",
  },
  "GitHub 7日新锐": {
    en: "7d Breakout",
    zh: "7日新锐",
    "zh-TW": "7日新銳",
    ja: "7日間急上昇",
  },
  "GitHub Trending": {
    en: "Daily Trending",
    zh: "每日飙升",
    "zh-TW": "每日飆升",
    ja: "デイリートレンド",
  },
  "IH 营收快讯": {
    en: "Revenue Briefing",
    zh: "营收快讯",
    "zh-TW": "營收快訊",
    ja: "収益ニュース",
  },
  "IH 实战热帖": {
    en: "Founder Post",
    zh: "实战热帖",
    "zh-TW": "實戰熱帖",
    ja: "実践レポート",
  },
  "IH Build Board": {
    en: "Build Board",
    zh: "Build Board",
    "zh-TW": "Build Board",
    ja: "Build Board",
  },
  "Acquire 待售挂牌": {
    en: "For-Sale Listing",
    zh: "待售挂牌",
    "zh-TW": "待售掛牌",
    ja: "売却案件",
  },
  "Acquire SaaS 精选": {
    en: "SaaS Picks",
    zh: "SaaS 精选",
    "zh-TW": "SaaS 精選",
    ja: "SaaS 注目案件",
  },
  "Ask HN 痛点": {
    en: "Ask HN",
    zh: "Ask HN 痛点",
    "zh-TW": "Ask HN 痛點",
    ja: "Ask HN 課題",
  },
  "HN 创业讨论": {
    en: "HN Discussion",
    zh: "HN 创业讨论",
    "zh-TW": "HN 創業討論",
    ja: "HN 議論",
  },
  "US Productivity 异动": {
    en: "US Productivity Movers",
    zh: "美区效率异动",
    "zh-TW": "美區效率異動",
    ja: "US 仕事効率化急上昇",
  },
};

const APPSTORE_PREFIX_MAP: Array<{
  pattern: RegExp;
  labels: LocalizedText;
}> = [
  {
    pattern: /^(?:美区效率畅销|US Productivity)\s*(#\d+)?$/i,
    labels: {
      en: "US Productivity",
      zh: "美区效率畅销",
      "zh-TW": "美區效率暢銷",
      ja: "US 仕事効率化",
    },
  },
  {
    pattern: /^(?:美区工具畅销|US Utilities)\s*(#\d+)?$/i,
    labels: {
      en: "US Utilities",
      zh: "美区工具畅销",
      "zh-TW": "美區工具暢銷",
      ja: "US ユーティリティ",
    },
  },
  {
    pattern: /^(?:日区效率畅销|JP Productivity)\s*(#\d+)?$/i,
    labels: {
      en: "JP Productivity",
      zh: "日区效率畅销",
      "zh-TW": "日區效率暢銷",
      ja: "JP 仕事効率化",
    },
  },
  {
    pattern: /^(?:日区工具畅销|JP Utilities)\s*(#\d+)?$/i,
    labels: {
      en: "JP Utilities",
      zh: "日区工具畅销",
      "zh-TW": "日區工具暢銷",
      ja: "JP ユーティリティ",
    },
  },
];

const HAS_CJK_RE = /[\u4e00-\u9fff]/;

export function localizeSourceSublabel(
  rawSublabel: string | undefined | null,
  locale: Locale,
  fallbackTwConvert?: (text: string) => string
): string {
  const trimmed = (rawSublabel ?? "").trim();
  if (!trimmed) return "";

  const exact = EXACT_SUBLABEL_MAP[trimmed];
  if (exact) {
    return exact[locale];
  }

  for (const entry of APPSTORE_PREFIX_MAP) {
    const match = trimmed.match(entry.pattern);
    if (match) {
      const rankSuffix = match[1] ? ` ${match[1]}` : "";
      return `${entry.labels[locale]}${rankSuffix}`;
    }
  }

  if (locale === "zh-TW" && fallbackTwConvert && HAS_CJK_RE.test(trimmed)) {
    return fallbackTwConvert(trimmed);
  }

  return trimmed;
}
