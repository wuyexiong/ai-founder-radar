import type { Locale } from "@/i18n/config";
import { toSafeHttpUrl } from "@/lib/utils";
import type {
  MetricType,
  SignalCategory,
  SignalMetaFields,
  SourcePlatform,
} from "@/types/signal";

const COMMUNITY_OR_LISTING_HOST_RE =
  /(^|\.)(reddit\.com|redd\.it|news\.ycombinator\.com|producthunt\.com|indiehackers\.com|trustmrr\.com|acquire\.com)$/i;

const VERIFIED_REVENUE_CUE_RE =
  /\b(mrr|arr|ttm|gmv|revenue|profit|net\s*margin|asking\s*price|valuation|grossing|iap)\b|\$[\d,.]+\s*[kKmMbB]\b|(?:月入|年入|月收|年收|净利|淨利|流水|营收|營收|叫价|叫價|畅销|暢銷|月商|年商)/i;

const PURE_ENGAGEMENT_BADGE_RE = /^[★☆▲↑💬🔥]\s*[\d,.]+/;

const MERE_UNIT_PRICING_BADGE_RE =
  /^\$\s*\d{1,3}(?:\.\d{1,2})?\s*(?:\/\s*(?:mo|month|yr|year|seat|user|wk|week)|(?:起|每月|月付|买断|買斷|ltd|lifetime|pass|scan))\b/i;

/**
 * 严守「翡翠绿营收胶囊 (`revenue`)」门槛：
 * - 仅允许真实/验证的持续营收（MRR / ARR / 净利 / 交易流水 / 并购估值 / 畅销榜内购）使用 `revenue`
 * - 痛点吐槽帖 (`pain_point`) 强制锁定为 `pain`
 * - 纯新品单价（如 `$9/mo`、`$79 LTD`）或纯点赞/Star 热度（`▲ 642`、`★ 14.1k`）强制归为 `heat`
 */
export function enforceStrictMetricType(input: {
  category: SignalCategory;
  proposedMetricType?: string | null;
  sourcePlatform: string;
  metricsBadge?: string | null;
  rawMetric?: string | null;
  businessSignal?: string | null;
  title?: string | null;
}): MetricType {
  if (input.category === "pain_point") {
    return "pain";
  }

  const badge = (input.metricsBadge ?? "").trim();
  const rawMetric = (input.rawMetric ?? "").trim();

  // GitHub 仓库双指标星标一律归入热度标，避免把开源项目误染成绿标营收
  if (input.sourcePlatform === "github" || badge.startsWith("★")) {
    return "heat";
  }

  // 角标本身是纯点赞/评论热度或小额套餐单价时，禁止冒充实名营收绿标
  if (
    badge &&
    (PURE_ENGAGEMENT_BADGE_RE.test(badge) ||
      MERE_UNIT_PRICING_BADGE_RE.test(badge)) &&
    !VERIFIED_REVENUE_CUE_RE.test(badge)
  ) {
    return "heat";
  }

  const evidenceBlob = [
    badge,
    rawMetric,
    input.title ?? "",
    input.category === "revenue" ? input.businessSignal ?? "" : "",
  ].join(" ");

  const hasVerifiedRevenue =
    input.sourcePlatform === "acquire" ||
    input.sourcePlatform === "appstore" ||
    VERIFIED_REVENUE_CUE_RE.test(evidenceBlob);

  if (input.proposedMetricType === "pain") {
    return "pain";
  }

  if (input.proposedMetricType === "revenue") {
    return hasVerifiedRevenue ? "revenue" : "heat";
  }

  if (input.proposedMetricType === "heat") {
    if (
      input.category === "revenue" &&
      hasVerifiedRevenue &&
      !PURE_ENGAGEMENT_BADGE_RE.test(badge)
    ) {
      return "revenue";
    }
    return "heat";
  }

  if (hasVerifiedRevenue && input.category === "revenue") {
    return "revenue";
  }

  return "heat";
}

function normalizeComparableUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "ref") {
        u.searchParams.delete(key);
      }
    }
    const cleanPath = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${cleanPath}${u.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

function safeNullableUrl(raw?: string | null): string | null {
  const safe = toSafeHttpUrl(raw);
  return safe === "#" ? null : safe;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export interface ResolvedSignalLinks {
  productUrl: string | null;
  discussionUrl: string | null;
}

/**
 * 将单条商业信号的外链拆分为「产品直达官网 (`productUrl`)」与「社区原帖/榜单页 (`discussionUrl`)」：
 * - 自动过滤非 HTTP(S) 链接并消除完全指向同一页面的重复双按钮
 * - 对历史 Show HN 外链条目（`sourceUrl` 直接存了产品独立域名）自动识别为 `productUrl`，不再误标「看原帖」
 */
export function resolveSignalLinks(params: {
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
  meta?: SignalMetaFields | null;
}): ResolvedSignalLinks {
  const primary = safeNullableUrl(params.sourceUrl);
  let productUrl = safeNullableUrl(params.meta?.productUrl);
  let discussionUrl = safeNullableUrl(params.meta?.discussionUrl);

  if (primary) {
    const host = getHostname(primary);
    const isCommunityHost = COMMUNITY_OR_LISTING_HOST_RE.test(host);

    if (isCommunityHost) {
      discussionUrl = discussionUrl ?? primary;
    } else if (
      params.sourcePlatform === "hackernews" ||
      params.sourcePlatform === "producthunt" ||
      params.sourcePlatform === "indiehackers" ||
      params.sourcePlatform === "trustmrr"
    ) {
      productUrl = productUrl ?? primary;
    } else {
      // GitHub / App Store 或其他技术源：主链接作为源页，若存在独立 Demo 官网则并列展示双按钮
      discussionUrl = discussionUrl ?? primary;
    }
  }

  // 防止 productUrl 误填入社区讨论域名
  if (productUrl && COMMUNITY_OR_LISTING_HOST_RE.test(getHostname(productUrl))) {
    discussionUrl = discussionUrl ?? productUrl;
    productUrl = null;
  }

  // 若官网与原帖归一化后完全一致，仅保留最贴切的一项，避免渲染重复外链按钮
  if (
    productUrl &&
    discussionUrl &&
    normalizeComparableUrl(productUrl) === normalizeComparableUrl(discussionUrl)
  ) {
    if (COMMUNITY_OR_LISTING_HOST_RE.test(getHostname(discussionUrl))) {
      productUrl = null;
    } else {
      discussionUrl = null;
    }
  }

  return { productUrl, discussionUrl };
}

/**
 * 生成四语种确定性「上架年龄 / 仓库生命期」微胶囊文案（SSR/Hydration 100% 确定性安全，零 `Date.now()` 调用）：
 * - 支持读取 `_meta` 精确字段，并对存量数据库中的 GitHub 7日新锐与 App Store 年份黑马记录自动回溯推算
 */
export function formatSignalAgeBadge(params: {
  locale: Locale;
  sourcePlatform: SourcePlatform;
  dateKey: string;
  publishedAt: string;
  rawSublabel?: string | null;
  metricsBadge?: string | null;
  meta?: SignalMetaFields | null;
}): string | undefined {
  const { locale, sourcePlatform, dateKey, publishedAt, meta } = params;

  // 1. GitHub 新锐仓库创建天数
  let repoDays =
    meta?.ageKind === "repo_created" &&
    typeof meta.ageDays === "number" &&
    Number.isFinite(meta.ageDays)
      ? Math.max(1, Math.round(meta.ageDays))
      : undefined;

  if (
    repoDays === undefined &&
    sourcePlatform === "github" &&
    /7日新锐|7日新銳|7d\s*Breakout|7日間急上昇/i.test(params.rawSublabel ?? "")
  ) {
    const refTs = Date.parse(`${dateKey}T23:59:59Z`);
    const pubTs = Date.parse(publishedAt);
    if (Number.isFinite(refTs) && Number.isFinite(pubTs) && refTs >= pubTs) {
      const diffDays = Math.max(1, Math.round((refTs - pubTs) / 86_400_000));
      if (diffDays <= 14) {
        repoDays = diffDays;
      }
    }
  }

  if (repoDays !== undefined) {
    switch (locale) {
      case "zh":
        return `创建 ${repoDays} 天`;
      case "zh-TW":
        return `建立 ${repoDays} 天`;
      case "ja":
        return `公開 ${repoDays}日`;
      default:
        return `${repoDays}d old`;
    }
  }

  // 2. App Store 上架月数或年份
  if (
    meta?.ageKind === "appstore_release" ||
    sourcePlatform === "appstore"
  ) {
    if (
      typeof meta?.ageMonths === "number" &&
      Number.isFinite(meta.ageMonths) &&
      meta.ageMonths >= 0
    ) {
      const months = Math.round(meta.ageMonths);
      if (months <= 1) {
        switch (locale) {
          case "zh":
            return "新上架 <1个月";
          case "zh-TW":
            return "新上架 <1個月";
          case "ja":
            return "公開1ヶ月未満";
          default:
            return "New (<1mo)";
        }
      }
      if (months < 24) {
        switch (locale) {
          case "zh":
            return `上架 ${months} 个月`;
          case "zh-TW":
            return `上架 ${months} 個月`;
          case "ja":
            return `公開 ${months}ヶ月`;
          default:
            return `Launched ${months}mo ago`;
        }
      }
      const yr = meta.releaseYear;
      if (yr && yr >= 2008 && yr <= 2100) {
        switch (locale) {
          case "zh":
          case "zh-TW":
            return `${yr} 年上架`;
          case "ja":
            return `${yr}年公開`;
          default:
            return `Est. ${yr}`;
        }
      }
      const years = Math.max(2, Math.floor(months / 12));
      switch (locale) {
        case "zh":
        case "zh-TW":
          return `上架 ${years} 年`;
        case "ja":
          return `公開 ${years}年`;
        default:
          return `Launched ${years}y ago`;
      }
    }

    const fallbackYear =
      meta?.releaseYear ??
      Number(
        `${params.metricsBadge ?? ""} ${params.rawSublabel ?? ""}`.match(
          /\b(202[4-9])\s*新黑马/
        )?.[1] ?? "0"
      );
    if (fallbackYear >= 2024 && fallbackYear <= 2100) {
      switch (locale) {
        case "zh":
        case "zh-TW":
          return `${fallbackYear} 新上架`;
        case "ja":
          return `${fallbackYear}年公開`;
        default:
          return `${fallbackYear} Launch`;
      }
    }
  }

  return undefined;
}
