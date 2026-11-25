import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  HTML_LANG_MAP,
  LOCALE_TIMEZONE_MAP,
  type Locale,
} from "@/i18n/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isSafeHttpUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function toSafeHttpUrl(raw: string | undefined | null): string {
  if (!raw) return "#";
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return "#";
  } catch {
    return "#";
  }
}

export function formatDeterministicClock(
  iso: string,
  locale: Locale
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const timeZone = LOCALE_TIMEZONE_MAP[locale] ?? "UTC";
  const clock = new Intl.DateTimeFormat(HTML_LANG_MAP[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);

  return locale === "en" ? `${clock} UTC` : clock;
}

const ISO_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 顶栏日期胶囊智能格式化（SSR/Hydration 确定性安全）：
 * - 与最新一期（referenceDateKey）同年份时省略年份前缀，返回 `MM-DD`（如 `11-24`）
 * - 跨年份归档或缺少参照年份时保留完整 `YYYY-MM-DD`（如 `2025-11-24`）
 */
export function formatHeaderArchiveDate(
  dateKey: string,
  referenceDateKey?: string | null
): string {
  const normalized = dateKey.trim();
  if (!ISO_DATE_KEY_RE.test(normalized)) return dateKey;

  const refYear = referenceDateKey?.trim().slice(0, 4);
  if (refYear && /^\d{4}$/.test(refYear) && normalized.slice(0, 4) === refYear) {
    return normalized.slice(5);
  }
  return normalized;
}

export function buildSignalPermalink(params: {
  siteUrl: string;
  locale: Locale;
  dateKey: string;
  signalId: string;
  utmSource?: string;
}): string {
  const base = params.siteUrl.trim().replace(/\/$/, "");
  const query = params.utmSource?.trim()
    ? `?utm_source=${encodeURIComponent(params.utmSource.trim())}`
    : "";
  return `${base}/${params.locale}/daily/${params.dateKey}${query}#${encodeURIComponent(params.signalId)}`;
}

export function buildSignalDetailUrl(params: {
  siteUrl: string;
  locale: Locale;
  signalId: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): string {
  const base = params.siteUrl.trim().replace(/\/$/, "");
  const queryParts: string[] = [];
  if (params.utmSource?.trim()) {
    queryParts.push(`utm_source=${encodeURIComponent(params.utmSource.trim())}`);
  }
  if (params.utmMedium?.trim()) {
    queryParts.push(`utm_medium=${encodeURIComponent(params.utmMedium.trim())}`);
  }
  if (params.utmCampaign?.trim()) {
    queryParts.push(
      `utm_campaign=${encodeURIComponent(params.utmCampaign.trim())}`
    );
  }
  const query = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  return `${base}/${params.locale}/signal/${encodeURIComponent(params.signalId)}${query}`;
}

export function buildTrackedOutboundUrl(
  raw: string | undefined | null,
  utm: {
    source?: string;
    medium?: string;
    campaign?: string;
  } = {}
): string {
  if (!raw) return "#";
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "#";
    }
    const source = utm.source?.trim() || "radar.aibuildon.com";
    if (!parsed.searchParams.has("utm_source")) {
      parsed.searchParams.set("utm_source", source);
    }
    if (utm.medium?.trim() && !parsed.searchParams.has("utm_medium")) {
      parsed.searchParams.set("utm_medium", utm.medium.trim());
    }
    if (utm.campaign?.trim() && !parsed.searchParams.has("utm_campaign")) {
      parsed.searchParams.set("utm_campaign", utm.campaign.trim());
    }
    return parsed.toString();
  } catch {
    return "#";
  }
}

export function formatSignalShareBrief(params: {
  title: string;
  metricsBadge: string;
  whatItIsLabel: string;
  whatItIs: string;
  monetizationLabel: string;
  businessSignal: string;
  playbookLabel: string;
  indieTakeaway: string;
  shareLinkLabel: string;
  permalink: string;
}): string {
  const badgePrefix = params.metricsBadge.trim()
    ? `[${params.metricsBadge.trim()}] `
    : "";
  return [
    `${badgePrefix}${params.title.trim()}`,
    `${params.whatItIsLabel.trim()} ${params.whatItIs.trim()}`,
    `${params.monetizationLabel.trim()} ${params.businessSignal.trim()}`,
    `${params.playbookLabel.trim()} ${params.indieTakeaway.trim()}`,
    `${params.shareLinkLabel.trim()} ${params.permalink.trim()}`,
  ].join("\n");
}

const SYNTHETIC_ORIG_SUFFIX_RE =
  /\s*(?:[—–-]|\|)\s*Verified Revenue\s+\$[\d,.]+[kKmMbB]?.*$/i;

const DANGLING_STOPWORD_RE =
  /\s+(?:and|or|with|for|to|in|of|by|on|at|from|into|via|the|a|an)$/i;

/**
 * 按完整句子或单词边界优雅截断长英文简介，杜绝采集器 `.slice(0, N)` 把末尾单词切成两半
 */
export function truncateAtWordBoundary(raw: string, maxChars = 220): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;

  const windowSlice = cleaned.slice(0, maxChars);

  // 1. 优先在句号/感叹号/问号边界完整收尾（无需省略号）
  const sentenceFloor = Math.floor(maxChars * 0.45);
  const sentenceMatches = [...windowSlice.matchAll(/[.!?](?=\s|$)/g)];
  const lastSentenceEnd = sentenceMatches[sentenceMatches.length - 1];
  if (lastSentenceEnd && (lastSentenceEnd.index ?? 0) >= sentenceFloor) {
    return windowSlice.slice(0, (lastSentenceEnd.index ?? 0) + 1).trim();
  }

  // 2. 退回最近一个空格边界，剔除末尾悬空连词/介词并补齐省略号
  const lastSpaceIdx = windowSlice.lastIndexOf(" ");
  if (lastSpaceIdx >= Math.floor(maxChars * 0.55)) {
    const wholeWords = windowSlice
      .slice(0, lastSpaceIdx)
      .replace(/[,;:\-—–/\s]+$/, "")
      .replace(DANGLING_STOPWORD_RE, "")
      .replace(/[,;:\-—–/\s]+$/, "")
      .trim();
    if (wholeWords) return `${wholeWords}…`;
  }

  return `${windowSlice.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function healLegacyHardSlicedTitle(cleaned: string): string {
  const splitMatch = cleaned.match(/^(.+?(?:\s+[—–-]\s+|:\s+))(.+)$/);
  if (!splitMatch) return cleaned;

  const prefix = splitMatch[1];
  const tail = splitMatch[2];
  const isLegacySliceWindow =
    (tail.length >= 78 && tail.length <= 80) ||
    (tail.length >= 93 && tail.length <= 95);

  if (!isLegacySliceWindow || /[.!?…)"'\]]$/.test(tail)) {
    return cleaned;
  }

  // 若前半段已包含完整首句，直接保留干净首句
  const firstSentence = tail.match(/^(.{30,}?[.!?])\s+/);
  if (firstSentence) {
    return `${prefix}${firstSentence[1].trim()}`;
  }

  // 否则剥离末尾可能被硬切一半的残缺 token 与悬空介词，补齐标准省略号
  const lastSpace = tail.lastIndexOf(" ");
  if (lastSpace > 20) {
    const healedTail = tail
      .slice(0, lastSpace)
      .replace(/[,;:\-—–/\s]+$/, "")
      .replace(DANGLING_STOPWORD_RE, "")
      .replace(/[,;:\-—–/\s]+$/, "")
      .trim();
    if (healedTail) {
      return `${prefix}${healedTail}…`;
    }
  }

  return `${cleaned}…`;
}

/**
 * 解析详情页副标题（英文原名对照）：
 * - 在英文路由 (`en`) 下主标题已为地道英文，自动隐藏重复英文原题
 * - 自动剥离采集器拼接的人工后缀（如 `— Verified Revenue $14k`）
 * - 自动修复早期存量数据因 80/95 字符硬切造成的半截尾词
 */
export function resolveOriginalSubtitle(params: {
  locale: Locale;
  title: string;
  titleOrig?: string | null;
}): string | null {
  if (params.locale === "en") return null;
  if (!params.titleOrig) return null;

  const cleaned = healLegacyHardSlicedTitle(
    params.titleOrig
      .replace(SYNTHETIC_ORIG_SUFFIX_RE, "")
      .replace(/\s+/g, " ")
      .trim()
  );

  if (!cleaned) return null;
  if (cleaned.toLowerCase() === params.title.trim().toLowerCase()) {
    return null;
  }
  return cleaned;
}
