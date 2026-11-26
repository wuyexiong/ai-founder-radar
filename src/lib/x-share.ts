import type { Locale } from "@/i18n/config";
import type { CardLensLabels } from "@/i18n/dictionaries";
import { localizeSourceSublabel } from "@/lib/localize-sublabel";
import { resolveSignalLinks } from "@/lib/signal-meta";
import { buildSignalDetailUrl, resolveOriginalSubtitle } from "@/lib/utils";
import type {
  SignalCategory,
  SignalItem,
  SourcePlatform,
} from "@/types/signal";

export type XShareMode = "no_link_post" | "reply_cta" | "quick_intent";

export const X_SHARE_MODES: readonly XShareMode[] = [
  "no_link_post",
  "reply_cta",
  "quick_intent",
] as const;

export const X_FREE_CHAR_LIMIT = 280;
export const X_URL_WEIGHT = 23;

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const HTTP_URL_RE = /https?:\/\/[^\s\u3000<>()[\]{}"']+/gi;
const TRAILING_URL_PUNCT_RE = /[.,;:!?。，；：！？）】》」』]+$/;
const CJK_OR_KANA_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const PICTOGRAPHIC_ICON_RE = /[\p{Extended_Pictographic}\ufe0f\u200d]+/gu;

/**
 * X (twitter-text) 会把裸域名（如 `podnotes.app`、`Acquire.com`、`cal.com`）也自动解析为 t.co 外链。
 * 在 1 楼无外链防限流模式下，将常见顶级域名前的半角点替换为中点 `·`，既保留人类可读性又彻底规避外链降权。
 */
const X_AUTO_LINK_BARE_DOMAIN_RE =
  /\b([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)\.(com|io|ai|app|dev|co|net|org|sh|so|xyz|me|gg|tools|tech|cloud|page|site|pro|run|bot|chat|vc|tv|cc|ly|to|fm|is|it|us|uk|de|fr|jp|cn|hk|tw|edu|gov|info|biz|design|studio|work|live|link|online|store|shop)\b/gi;

const GENERIC_MULTI_TENANT_HOST_RE =
  /(^|\.)(google\.com|apple\.com|github\.com|gitlab\.com|microsoft\.com|mozilla\.org|notion\.site|notion\.so|gumroad\.com|lemonsqueezy\.com|substack\.com|medium\.com|youtube\.com|x\.com|twitter\.com)$/i;

const GITHUB_RESERVED_OWNERS = new Set([
  "trending",
  "topics",
  "orgs",
  "users",
  "features",
  "explore",
  "collections",
  "marketplace",
  "sponsors",
  "about",
  "pricing",
  "login",
  "signup",
  "settings",
  "search",
  "notifications",
  "pulls",
  "issues",
  "gist",
]);

const NON_PRODUCT_TITLE_PREFIX_RE =
  /^(?:show\s+hn|ask\s+hn|tell\s+hn|launch\s+hn|verified\b|how\b|why\b|what\b|when\b|where\b|who\b|is\s+there|looking\s+for|built\b|building\b|my\b|our\b|we\b|i\b|solo\b|case\s+study|update\b|psa\b|rant\b|discussion\b|question\b|need\b|anyone\b|creators?\b|founders?\b|indie\b|from\b|hit\b|hitting\b|crossed\b|turned\b|turning\b|\$[\d,.]+|\d+\s+(?:days?|weeks?|months?|years?|hours?|weekends?))/i;

const GENERIC_CATEGORY_WORDS = new Set([
  "github",
  "reddit",
  "chrome",
  "shopify",
  "stripe",
  "youtube",
  "tiktok",
  "macos",
  "ios",
  "android",
  "saas",
  "microsaas",
  "show hn",
  "ask hn",
  "product hunt",
  "hacker news",
  "app store",
  "trustmrr",
  "acquire",
]);

const SAFE_PLATFORM_NAMES: Record<SourcePlatform, string> = {
  producthunt: "Product Hunt",
  hackernews: "Hacker News",
  indiehackers: "Indie Hackers",
  acquire: "Acquire",
  reddit: "Reddit",
  github: "GitHub",
  trustmrr: "TrustMRR",
  appstore: "App Store",
};

/**
 * 剥离分享文案中的彩色 Emoji / Icon（如 💰🚀🔥⚡📌📍📄🧩💵🔑💬👇 等），保持干净克制的纯文本排版
 */
export function stripShareIcons(raw: string): string {
  return raw
    .replace(PICTOGRAPHIC_ICON_RE, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function neutralizeBareDomainsForX(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/https?:\/\/(?:www\.)?/gi, "")
    .replace(X_AUTO_LINK_BARE_DOMAIN_RE, "$1·$2");
}

export function normalizeXHandle(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^@+/, "");
  if (!X_HANDLE_RE.test(cleaned)) return null;
  return cleaned;
}

export function getConfiguredXHandle(): string | null {
  return normalizeXHandle(process.env.NEXT_PUBLIC_X_HANDLE);
}

/**
 * 判定单个 Unicode 码点在 X (Twitter) 字符权重计费中是否按 2 权重计算：
 * - CJK 汉字、假名、谚文、全角标点与符号、Emoji/星平面字符均按 2 计费
 * - 标准拉丁字母、ASCII 数字与半角标点按 1 计费
 */
export function getXCodePointWeight(codePoint: number): 1 | 2 {
  if (codePoint > 0xffff) return 2; // Emoji & astral symbols
  if (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0x303f) || // CJK radicals & punctuation
    (codePoint >= 0x3040 && codePoint <= 0x33ff) || // Hiragana, Katakana, CJK compat
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK Unified Ext A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) || // Yi
    (codePoint >= 0xac00 && codePoint <= 0xd7af) || // Hangul Syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK Compatibility Ideographs
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) || // Vertical & small CJK forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) || // Fullwidth symbols
    (codePoint >= 0x2600 && codePoint <= 0x27bf) // Misc symbols & dingbats
  ) {
    return 2;
  }
  return 1;
}

export function containsHttpUrl(text: string): boolean {
  HTTP_URL_RE.lastIndex = 0;
  return HTTP_URL_RE.test(text);
}

export interface XTextWeightMetrics {
  weighted: number;
  remaining: number;
  overFreeLimit: boolean;
  hasUrl: boolean;
}

/**
 * 按 X 官方加权规则（t.co URL=23、CJK/Emoji=2、ASCII=1）精确计算文案长度
 */
export function measureXTextWeight(text: string): XTextWeightMetrics {
  if (!text) {
    return {
      weighted: 0,
      remaining: X_FREE_CHAR_LIMIT,
      overFreeLimit: false,
      hasUrl: false,
    };
  }

  let weighted = 0;
  let hasUrl = false;
  let cursor = 0;
  HTTP_URL_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = HTTP_URL_RE.exec(text)) !== null) {
    const start = match.index;
    const rawMatched = match[0];
    const cleanUrl = rawMatched.replace(TRAILING_URL_PUNCT_RE, "");
    const end = start + cleanUrl.length;

    // 累加 URL 之前的普通文本
    for (const ch of text.slice(cursor, start)) {
      weighted += getXCodePointWeight(ch.codePointAt(0) ?? 0);
    }

    if (cleanUrl.length > 0) {
      weighted += X_URL_WEIGHT;
      hasUrl = true;
      cursor = end;
    } else {
      cursor = start;
    }
  }

  // 累加最后一段剩余文本
  for (const ch of text.slice(cursor)) {
    weighted += getXCodePointWeight(ch.codePointAt(0) ?? 0);
  }

  return {
    weighted,
    remaining: X_FREE_CHAR_LIMIT - weighted,
    overFreeLimit: weighted > X_FREE_CHAR_LIMIT,
    hasUrl,
  };
}

/**
 * 按 X 加权字符预算优雅截断文本，保留完整英文单词与自然收尾省略号
 */
export function truncateToXWeight(raw: string, maxWeight: number): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned || maxWeight <= 0) return "";
  if (measureXTextWeight(cleaned).weighted <= maxWeight) return cleaned;

  const ellipsis = "…";
  const ellipsisWeight = getXCodePointWeight(ellipsis.codePointAt(0) ?? 0x2026);
  const budget = Math.max(0, maxWeight - ellipsisWeight);
  if (budget === 0) return ellipsis;

  const chars = Array.from(cleaned);
  let acc = 0;
  let cutIndex = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const w = getXCodePointWeight(chars[i]!.codePointAt(0) ?? 0);
    if (acc + w > budget) break;
    acc += w;
    cutIndex = i + 1;
  }

  let sliced = chars.slice(0, cutIndex).join("");
  const nextChar = chars[cutIndex];

  // 若正好在英文单词中间截断，退回到上一个空格边界
  if (
    nextChar &&
    /[A-Za-z0-9]/.test(nextChar) &&
    /[A-Za-z0-9]$/.test(sliced)
  ) {
    const lastSpace = sliced.lastIndexOf(" ");
    if (lastSpace >= Math.floor(sliced.length * 0.45)) {
      sliced = sliced.slice(0, lastSpace);
    }
  }

  const trimmed = sliced
    .replace(/[\s,;:—–\-/|([{（【「『、，；：]+$/u, "")
    .trimEnd();

  return trimmed ? `${trimmed}${ellipsis}` : ellipsis;
}

/**
 * 将卡片标签净化为 X 合法的短 Hashtag（上限 2 个，避免触发 X 垃圾标签降权）
 */
export function formatXHashtags(
  tags: readonly string[],
  locale: Locale,
  maxCount = 2
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    if (result.length >= maxCount) break;
    const stripped = raw
      .trim()
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (!stripped || stripped.length < 2) continue;

    // 英文语种严禁渗入 CJK 标签
    if (locale === "en" && CJK_OR_KANA_RE.test(stripped)) {
      continue;
    }

    const key = stripped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(`#${stripped}`);
  }

  if (result.length === 0) {
    switch (locale) {
      case "zh":
        return ["#独立开发", "#出海SaaS"];
      case "zh-TW":
        return ["#獨立開發", "#MicroSaaS"];
      case "ja":
        return ["#個人開発", "#MicroSaaS"];
      default:
        return ["#IndieHackers", "#MicroSaaS"];
    }
  }

  return result;
}

export interface SignalOriginInfo {
  platformLabel: string;
  sourceProvenance: string;
  subjectName: string | null;
  productHost: string | null;
  safeProductHost: string | null;
  noLinkSubjectLabel: string | null;
  canvasBadgeLabel: string | null;
  cleanOrigTitle: string | null;
  noLinkOrigTitle: string | null;
  productUrl: string | null;
  discussionUrl: string | null;
}

function extractGitHubRepoSlug(
  urls: Array<string | null | undefined>,
  titleOrig?: string | null
): string | null {
  for (const raw of urls) {
    if (!raw) continue;
    const m = raw.match(
      /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[/?#]|$)/i
    );
    if (!m) continue;
    const owner = m[1]!;
    const repo = m[2]!.replace(/\.git$/i, "");
    if (!owner || !repo || GITHUB_RESERVED_OWNERS.has(owner.toLowerCase())) {
      continue;
    }
    return `${owner}/${repo}`;
  }

  if (titleOrig) {
    const titleRepo = titleOrig
      .trim()
      .match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+(?:[—–-]|:)\s+/);
    if (titleRepo?.[1]) {
      return titleRepo[1].replace(/\.git$/i, "");
    }
  }

  return null;
}

function extractDedicatedProductHost(productUrl: string | null): string | null {
  if (!productUrl) return null;
  try {
    const host = new URL(productUrl)
      .hostname.replace(/^www\./i, "")
      .toLowerCase();
    if (!host || GENERIC_MULTI_TENANT_HOST_RE.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function extractExplicitProductName(
  item: SignalItem,
  cleanedOrig: string | null,
  discussionUrl: string | null
): string | null {
  if (cleanedOrig) {
    const withoutHnPrefix = cleanedOrig
      .replace(/^(?:Show\s+HN|Launch\s+HN)\s*:\s*/i, "")
      .trim();

    // App Store 条目格式为 "${appName} (${artist})"，完整保留冒号副标题但剥离末尾公司括号
    if (item.sourcePlatform === "appstore") {
      const appMatch = withoutHnPrefix.match(
        /^([A-Za-z0-9][A-Za-z0-9\s.:&'+–-]{1,46}?)\s*\([^()]+\)$/
      );
      if (
        appMatch?.[1] &&
        !NON_PRODUCT_TITLE_PREFIX_RE.test(appMatch[1].trim())
      ) {
        return appMatch[1].trim();
      }
    }

    const sepMatch = withoutHnPrefix.match(
      /^([A-Za-z0-9][A-Za-z0-9\s._&'+/-]{1,33}?)\s*(?:[—–-]\s+|:\s+)/
    );
    if (sepMatch?.[1]) {
      const candidate = sepMatch[1].trim();
      const wordCount = candidate.split(/\s+/).length;
      if (
        wordCount <= 4 &&
        !NON_PRODUCT_TITLE_PREFIX_RE.test(candidate) &&
        !GENERIC_CATEGORY_WORDS.has(candidate.toLowerCase())
      ) {
        return candidate;
      }
    }
  }

  // 从中/日提炼标题前缀兜底提取明确英文品牌名（如 "ChurnRescue：专门挽回..."）
  const zhPrefixMatch = (item.titleZh || item.title)
    .trim()
    .match(
      /^([A-Za-z][A-Za-z0-9._&'+-]{1,26}(?:\s+[A-Za-z0-9._&'+-]{1,18})?)\s*[：:]/
    );
  if (zhPrefixMatch?.[1]) {
    const candidate = zhPrefixMatch[1].trim();
    if (
      !NON_PRODUCT_TITLE_PREFIX_RE.test(candidate) &&
      !GENERIC_CATEGORY_WORDS.has(candidate.toLowerCase())
    ) {
      return candidate;
    }
  }

  // TrustMRR 实名项目详情页 URL slug 兜底（如 https://trustmrr.com/startup/podnotes -> podnotes）
  for (const rawUrl of [discussionUrl, item.sourceUrl]) {
    if (!rawUrl) continue;
    const slugMatch = rawUrl.match(
      /^https?:\/\/(?:www\.)?trustmrr\.com\/startup\/([a-z0-9][a-z0-9_-]{1,30})(?:[/?#]|$)/i
    );
    const slug = slugMatch?.[1];
    if (
      slug &&
      !/^(?:anonymous|hidden[\s-]?business|private[\s-]?enterprise|stealth[\s-]?venture|startup-[a-f0-9]+)$/i.test(
        slug
      )
    ) {
      return slug;
    }
  }

  return null;
}

function formatSourceProvenance(
  platform: SourcePlatform,
  rawSublabel: string | undefined | null,
  locale: Locale
): string {
  const platformLabel = SAFE_PLATFORM_NAMES[platform] ?? platform;
  let sub = stripShareIcons(localizeSourceSublabel(rawSublabel, locale));
  if (!sub) return platformLabel;

  if (locale === "en" && CJK_OR_KANA_RE.test(sub)) {
    return platformLabel;
  }

  const escapedPlatform = platformLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  sub = sub
    .replace(new RegExp(`^${escapedPlatform}\\s*[·•:\\-–—]?\\s*`, "i"), "")
    .replace(
      platform === "producthunt"
        ? /^PH\s+/i
        : platform === "indiehackers"
          ? /^IH\s+/i
          : /^$/,
      ""
    )
    .trim();

  if (!sub || sub.toLowerCase() === platformLabel.toLowerCase()) {
    return platformLabel;
  }
  return `${platformLabel} · ${neutralizeBareDomainsForX(sub)}`;
}

/**
 * 统一解析卡片的「原产品 / 开源仓库 / 一手信源与双轨外链」元数据，
 * 同时服务 X 三模式文案模板与 16:9 Canvas 分享配图。
 */
export function resolveSignalOriginInfo(
  item: SignalItem,
  locale: Locale
): SignalOriginInfo {
  const platformLabel =
    SAFE_PLATFORM_NAMES[item.sourcePlatform] ?? item.sourcePlatform;
  const sourceProvenance = formatSourceProvenance(
    item.sourcePlatform,
    item.sourceSublabel,
    locale
  );

  const { productUrl, discussionUrl } = resolveSignalLinks({
    sourcePlatform: item.sourcePlatform,
    sourceUrl: item.sourceUrl,
    meta: {
      productUrl: item.productUrl,
      discussionUrl: item.discussionUrl,
    },
  });

  const rawOrig = resolveOriginalSubtitle({
    locale: "zh",
    title: "",
    titleOrig: item.titleOrig,
  });
  const strippedOrig = rawOrig
    ? stripShareIcons(rawOrig.replace(/https?:\/\/\S+/gi, ""))
    : null;
  const cleanOrigTitle =
    strippedOrig && !(locale === "en" && CJK_OR_KANA_RE.test(strippedOrig))
      ? strippedOrig
      : null;
  const noLinkOrigTitle = cleanOrigTitle
    ? neutralizeBareDomainsForX(cleanOrigTitle)
    : null;

  const repoSlug =
    item.sourcePlatform === "github"
      ? extractGitHubRepoSlug(
          [discussionUrl, item.sourceUrl, productUrl],
          cleanOrigTitle
        )
      : extractGitHubRepoSlug([discussionUrl, item.sourceUrl], null);

  const productHost = extractDedicatedProductHost(productUrl);
  const safeProductHost = productHost
    ? neutralizeBareDomainsForX(productHost)
    : null;

  const subjectName =
    repoSlug ?? extractExplicitProductName(item, cleanOrigTitle, discussionUrl);
  const safeSubjectName = subjectName
    ? neutralizeBareDomainsForX(subjectName)
    : null;

  const isRedundantSlug =
    Boolean(subjectName && productHost) &&
    subjectName === subjectName!.toLowerCase() &&
    productHost!.split(".")[0] === subjectName!.toLowerCase();

  let noLinkSubjectLabel: string | null = null;
  if (safeSubjectName && safeProductHost && !isRedundantSlug) {
    if (
      safeSubjectName.toLowerCase().replace(/\s+/g, "") ===
      safeProductHost.toLowerCase()
    ) {
      noLinkSubjectLabel = safeSubjectName;
    } else {
      noLinkSubjectLabel =
        locale === "en"
          ? `${safeSubjectName} (${safeProductHost})`
          : `${safeSubjectName}（${safeProductHost}）`;
    }
  } else if (safeProductHost && isRedundantSlug) {
    noLinkSubjectLabel = safeProductHost;
  } else if (safeSubjectName) {
    noLinkSubjectLabel = safeSubjectName;
  } else if (safeProductHost) {
    noLinkSubjectLabel = safeProductHost;
  }

  let canvasBadgeLabel: string | null = null;
  if (repoSlug && productHost) {
    canvasBadgeLabel = `${repoSlug} · ${productHost}`;
  } else if (repoSlug) {
    canvasBadgeLabel = repoSlug;
  } else if (subjectName && productHost && !isRedundantSlug) {
    const titleHasSubject = item.title
      .toLowerCase()
      .includes(subjectName.toLowerCase());
    canvasBadgeLabel = titleHasSubject
      ? productHost
      : `${subjectName} · ${productHost}`;
  } else if (productHost) {
    canvasBadgeLabel = productHost;
  } else if (subjectName) {
    const titleHasSubject = item.title
      .toLowerCase()
      .includes(subjectName.toLowerCase());
    canvasBadgeLabel = titleHasSubject ? null : subjectName;
  }

  return {
    platformLabel,
    sourceProvenance,
    subjectName,
    productHost,
    safeProductHost,
    noLinkSubjectLabel,
    canvasBadgeLabel,
    cleanOrigTitle,
    noLinkOrigTitle,
    productUrl,
    discussionUrl,
  };
}

function buildNoLinkOriginLines(
  item: SignalItem,
  locale: Locale,
  origin: SignalOriginInfo
): string[] {
  const isRepo = item.sourcePlatform === "github";

  if (locale === "en") {
    if (origin.noLinkSubjectLabel) {
      const prefix = isRepo ? "Repo:" : "Product:";
      return [
        `${prefix} ${origin.noLinkSubjectLabel} · Source: ${origin.sourceProvenance}`,
      ];
    }
    return [`Source: ${origin.sourceProvenance}`];
  }

  if (locale === "zh-TW") {
    if (origin.noLinkSubjectLabel) {
      const prefix = isRepo ? "開源專案：" : "原產品：";
      return [
        `${prefix}${origin.noLinkSubjectLabel}（來源：${origin.sourceProvenance}）`,
      ];
    }
    return [`一手來源：${origin.sourceProvenance}`];
  }

  if (locale === "ja") {
    if (origin.noLinkSubjectLabel) {
      const prefix = isRepo ? "対象リポジトリ：" : "対象プロダクト：";
      return [
        `${prefix}${origin.noLinkSubjectLabel}（出典：${origin.sourceProvenance}）`,
      ];
    }
    return [`一次情報元：${origin.sourceProvenance}`];
  }

  // zh：无任何 Emoji Icon，且不再输出冗余的「英文原题」行
  if (origin.noLinkSubjectLabel) {
    const prefix = isRepo ? "开源项目：" : "原产品：";
    return [
      `${prefix}${origin.noLinkSubjectLabel}（信源：${origin.sourceProvenance}）`,
    ];
  }
  return [`一手信源：${origin.sourceProvenance}`];
}

function formatHookHeadline(
  locale: Locale,
  category: SignalCategory,
  title: string,
  metricsBadge: string
): string {
  const cleanTitle = stripShareIcons(title);
  const cleanBadge = stripShareIcons(metricsBadge);
  const badgeAlreadyInTitle =
    Boolean(cleanBadge) &&
    cleanTitle.toLowerCase().includes(cleanBadge.toLowerCase());

  const badgeTag =
    cleanBadge && !badgeAlreadyInTitle
      ? locale === "en"
        ? ` (${cleanBadge})`
        : ` [${cleanBadge}]`
      : "";

  if (locale === "zh") {
    switch (category) {
      case "revenue":
        return `真实变现信号${badgeTag}：${cleanTitle}`;
      case "launch":
        return `今日出海新品${badgeTag}：${cleanTitle}`;
      case "pain_point":
        return `海外高赞痛点${badgeTag}：${cleanTitle}`;
      case "ai_trend":
        return `AI / 开源风向${badgeTag}：${cleanTitle}`;
    }
  }

  if (locale === "zh-TW") {
    switch (category) {
      case "revenue":
        return `真實變現信號${badgeTag}：${cleanTitle}`;
      case "launch":
        return `今日出海新品${badgeTag}：${cleanTitle}`;
      case "pain_point":
        return `海外高讚痛點${badgeTag}：${cleanTitle}`;
      case "ai_trend":
        return `AI / 開源風向${badgeTag}：${cleanTitle}`;
    }
  }

  if (locale === "ja") {
    switch (category) {
      case "revenue":
        return `リアル収益シグナル${badgeTag}：${cleanTitle}`;
      case "launch":
        return `注目の新着プロダクト${badgeTag}：${cleanTitle}`;
      case "pain_point":
        return `海外のリアル課題${badgeTag}：${cleanTitle}`;
      case "ai_trend":
        return `AI・OSS トレンド${badgeTag}：${cleanTitle}`;
    }
  }

  // en
  switch (category) {
    case "revenue":
      return `Verified revenue signal${badgeTag}: ${cleanTitle}`;
    case "launch":
      return `Notable indie launch${badgeTag}: ${cleanTitle}`;
    case "pain_point":
      return `Validated buyer pain${badgeTag}: ${cleanTitle}`;
    case "ai_trend":
      return `AI & OSS signal${badgeTag}: ${cleanTitle}`;
  }
}

function getEngagementPrompt(locale: Locale, category: SignalCategory): string {
  if (locale === "zh") {
    switch (category) {
      case "revenue":
        return "你觉得这个垂直切口在中文或海外细分场景里还能怎么微创新？\n原产品官网、一手原帖与完整拆解放评论区。";
      case "launch":
        return "如果是你来做这个方向，会保留哪个核心功能、砍掉哪块？\n原产品官网与一手讨论链接放评论区。";
      case "pain_point":
        return "这种用户主动喊着要付费的痛点，你觉得值得周末出个 MVP 测测吗？\n一手原帖与完整商机拆解放评论区。";
      case "ai_trend":
        return "这个技术/开源风向，你会优先把它包装成什么垂直小工具来收费？\n开源仓库、官网与商业化拆解放评论区。";
    }
  }

  if (locale === "zh-TW") {
    switch (category) {
      case "revenue":
        return "你覺得這個垂直切角還有哪些細分場景可以微創新？\n原產品官網、一手原帖與完整拆解放留言區。";
      case "launch":
        return "如果是你來做這個方向，會先保留哪個核心功能？\n原產品官網與一手討論連結放留言區。";
      case "pain_point":
        return "這種使用者主動喊著想付費的痛點，值得用週末做個 MVP 驗證嗎？\n一手原帖與完整拆解放留言區。";
      case "ai_trend":
        return "這個技術/開源風向，你會優先包裝成什麼垂直小工具變現？\n開源專案、官網與商業化拆解放留言區。";
    }
  }

  if (locale === "ja") {
    switch (category) {
      case "revenue":
        return "このニッチ領域、日本市場や別業界に横展開するとしたらどこを狙いますか？\n公式サイト・一次情報リンク・詳細分析はリプ欄へ。";
      case "launch":
        return "もし自分でこの領域に参入するなら、どの機能に絞り込みますか？\n公式サイトと一次情報リンクはリプ欄へ。";
      case "pain_point":
        return "課金意欲が高いリアルな課題ですね。週末MVPで検証する価値ありそうでしょうか？\n元スレッドと詳細分析はリプ欄へ。";
      case "ai_trend":
        return "この技術・OSSトレンド、どんな垂直型マイクロSaaSに組み込めそうでしょう？\nリポジトリ・公式サイト・分析詳細はリプ欄へ。";
    }
  }

  // en
  switch (category) {
    case "revenue":
      return "Would you clone this wedge for another vertical, or is distribution the real moat here?\nDirect product site, original source & full breakdown in the reply below.";
    case "launch":
      return "If you were building a leaner v1 in this space, what would you keep vs. cut?\nDirect product site & original discussion link in the reply below.";
    case "pain_point":
      return "Feels like a clean weekend-MVP wedge with real buyer urgency — would you ship it?\nOriginal thread & full commercial breakdown in the reply below.";
    case "ai_trend":
      return "How would you wrap this into a paid vertical workflow instead of competing on raw tech?\nRepo, product site & full breakdown in the reply below.";
  }
}

function buildReplyCtaDraft(
  locale: Locale,
  item: SignalItem,
  origin: SignalOriginInfo,
  replyUrl: string
): string {
  const isRepo = item.sourcePlatform === "github";
  const isAppStore =
    item.sourcePlatform === "appstore" &&
    Boolean(
      origin.discussionUrl && /apps\.apple\.com/i.test(origin.discussionUrl)
    );

  if (locale === "zh") {
    const lines = ["原产品与一手原帖直达："];
    if (origin.productUrl) {
      lines.push(`原产品官网：${origin.productUrl}`);
    }
    if (origin.discussionUrl) {
      const srcLabel = isRepo
        ? "开源仓库"
        : isAppStore
          ? "App Store"
          : `一手原帖（${origin.platformLabel}）`;
      lines.push(`${srcLabel}：${origin.discussionUrl}`);
    }
    lines.push(`完整商业拆解：${replyUrl}`);
    lines.push(
      "",
      "每天 5 分钟筛完 TrustMRR / Product Hunt / Show HN / Reddit 等 8 大海外一手信源，只留真变现与真痛点。"
    );
    return lines.join("\n");
  }

  if (locale === "zh-TW") {
    const lines = ["原產品與一手原帖直達："];
    if (origin.productUrl) {
      lines.push(`原產品官網：${origin.productUrl}`);
    }
    if (origin.discussionUrl) {
      const srcLabel = isRepo
        ? "開源專案"
        : isAppStore
          ? "App Store"
          : `一手原帖（${origin.platformLabel}）`;
      lines.push(`${srcLabel}：${origin.discussionUrl}`);
    }
    lines.push(`完整商業拆解：${replyUrl}`);
    lines.push(
      "",
      "每天 5 分鐘篩選 TrustMRR / Product Hunt / Show HN / Reddit 等 8 大海外一手來源，只留真變現與真痛點。"
    );
    return lines.join("\n");
  }

  if (locale === "ja") {
    const lines = ["公式サイト・一次情報リンク直通："];
    if (origin.productUrl) {
      lines.push(`公式サイト：${origin.productUrl}`);
    }
    if (origin.discussionUrl) {
      const srcLabel = isRepo
        ? "リポジトリ"
        : isAppStore
          ? "App Store"
          : `元記事（${origin.platformLabel}）`;
      lines.push(`${srcLabel}：${origin.discussionUrl}`);
    }
    lines.push(`詳細ビジネス分析：${replyUrl}`);
    lines.push(
      "",
      "毎朝5分で TrustMRR / Product Hunt / Show HN / Reddit など海外8大ソースからリアルな収益事例と課題だけを厳選。"
    );
    return lines.join("\n");
  }

  // en
  const lines = ["Direct product & primary source links:"];
  if (origin.productUrl) {
    lines.push(`Product: ${origin.productUrl}`);
  }
  if (origin.discussionUrl) {
    const srcLabel = isRepo
      ? "Repo"
      : isAppStore
        ? "App Store"
        : `Original (${origin.platformLabel})`;
    lines.push(`${srcLabel}: ${origin.discussionUrl}`);
  }
  lines.push(`Full breakdown: ${replyUrl}`);
  lines.push(
    "",
    "Daily 5-min indie radar scanning 8 primary sources — pure commercial signal, zero noise."
  );
  return lines.join("\n");
}

function buildQuickFooterLines(params: {
  locale: Locale;
  item: SignalItem;
  origin: SignalOriginInfo;
  directUrl: string;
  xHandle: string | null;
}): string[] {
  const { locale, item, origin, directUrl, xHandle } = params;
  const viaSuffix = xHandle ? ` via @${xHandle}` : "";
  const isRepo = item.sourcePlatform === "github";
  const isAppStore =
    item.sourcePlatform === "appstore" &&
    Boolean(
      origin.discussionUrl && /apps\.apple\.com/i.test(origin.discussionUrl)
    );

  const lines: string[] = [];
  if (locale === "zh") {
    if (origin.productUrl) lines.push(`官网：${origin.productUrl}`);
    if (origin.discussionUrl) {
      const lbl = isRepo ? "仓库" : isAppStore ? "商店" : "原帖";
      lines.push(`${lbl}：${origin.discussionUrl}`);
    }
    lines.push(`拆解：${directUrl}${viaSuffix}`);
    return lines;
  }

  if (locale === "zh-TW") {
    if (origin.productUrl) lines.push(`官網：${origin.productUrl}`);
    if (origin.discussionUrl) {
      const lbl = isRepo ? "專案" : isAppStore ? "商店" : "原帖";
      lines.push(`${lbl}：${origin.discussionUrl}`);
    }
    lines.push(`拆解：${directUrl}${viaSuffix}`);
    return lines;
  }

  if (locale === "ja") {
    if (origin.productUrl) lines.push(`公式：${origin.productUrl}`);
    if (origin.discussionUrl) {
      const lbl = isRepo ? "Repo" : isAppStore ? "App" : "元記事";
      lines.push(`${lbl}：${origin.discussionUrl}`);
    }
    lines.push(`解説：${directUrl}${viaSuffix}`);
    return lines;
  }

  // en
  if (origin.productUrl) lines.push(`Site: ${origin.productUrl}`);
  if (origin.discussionUrl) {
    const lbl = isRepo ? "Repo" : isAppStore ? "App" : "Source";
    lines.push(`${lbl}: ${origin.discussionUrl}`);
  }
  lines.push(`Brief: ${directUrl}${viaSuffix}`);
  return lines;
}

function buildQuickIntentDraft(params: {
  item: SignalItem;
  locale: Locale;
  lens: CardLensLabels;
  origin: SignalOriginInfo;
  directUrl: string;
  xHandle: string | null;
}): string {
  const { item, locale, lens, origin, directUrl, xHandle } = params;
  const cleanBadge = stripShareIcons(item.metricsBadge);
  const cleanTitle = stripShareIcons(item.title);
  const badgePrefix =
    cleanBadge && !cleanTitle.toLowerCase().includes(cleanBadge.toLowerCase())
      ? `[${cleanBadge}] `
      : "";

  const rawSubject = origin.subjectName
    ? neutralizeBareDomainsForX(origin.subjectName)
    : origin.safeProductHost;
  const hasSubjectInTitle =
    Boolean(rawSubject) &&
    cleanTitle
      .toLowerCase()
      .includes((origin.subjectName ?? origin.productHost ?? "").toLowerCase());
  const subjectPrefix =
    rawSubject && !hasSubjectInTitle
      ? `${rawSubject} · `
      : !rawSubject &&
          !cleanTitle.toLowerCase().includes(origin.platformLabel.toLowerCase())
        ? `${origin.platformLabel} · `
        : "";

  const footerLine = buildQuickFooterLines({
    locale,
    item,
    origin,
    directUrl,
    xHandle,
  }).join("\n");
  const footerWeight = measureXTextWeight(footerLine).weighted;

  const fullHeadline = `${badgePrefix}${subjectPrefix}${cleanTitle}`;
  const cleanPlaybookLabel = stripShareIcons(lens.playbook);
  const cleanTakeaway = stripShareIcons(item.indieTakeaway);
  const playbookLine = `${cleanPlaybookLabel} ${cleanTakeaway}`;

  const combined = `${fullHeadline}\n\n${playbookLine}\n\n${footerLine}`;
  if (measureXTextWeight(combined).weighted <= X_FREE_CHAR_LIMIT) {
    return combined;
  }

  const newlineBudget = 4; // two "\n\n"
  const availableForContent = X_FREE_CHAR_LIMIT - footerWeight - newlineBudget;
  const headlineWeight = measureXTextWeight(fullHeadline).weighted;

  if (headlineWeight <= availableForContent - 42) {
    const remainingForPlaybook = availableForContent - headlineWeight;
    const compactPlaybook = truncateToXWeight(
      playbookLine,
      remainingForPlaybook
    );
    const candidate = `${fullHeadline}\n\n${compactPlaybook}\n\n${footerLine}`;
    if (measureXTextWeight(candidate).weighted <= X_FREE_CHAR_LIMIT) {
      return candidate;
    }
  }

  const maxHeadlineWeight = Math.max(44, Math.floor(availableForContent * 0.58));
  const compactHeadline = truncateToXWeight(fullHeadline, maxHeadlineWeight);
  const remainingWeight =
    availableForContent - measureXTextWeight(compactHeadline).weighted;

  if (remainingWeight >= 26) {
    const compactPlaybook = truncateToXWeight(playbookLine, remainingWeight);
    const candidate = `${compactHeadline}\n\n${compactPlaybook}\n\n${footerLine}`;
    if (measureXTextWeight(candidate).weighted <= X_FREE_CHAR_LIMIT) {
      return candidate;
    }
  }

  const tightHeadline = truncateToXWeight(
    fullHeadline,
    X_FREE_CHAR_LIMIT - footerWeight - 2
  );
  return `${tightHeadline}\n\n${footerLine}`;
}

export interface BuildXShareDraftsParams {
  item: SignalItem;
  locale: Locale;
  lens: CardLensLabels;
  siteUrl: string;
  xHandle?: string | null;
}

export interface XShareBundle {
  drafts: Record<XShareMode, string>;
  origin: SignalOriginInfo;
  detailUrl: string;
  replyUrl: string;
  directUrl: string;
  xHandle: string | null;
}

/**
 * 为单张商业信号卡片一次性生成三套无 Emoji Icon 噪音的纯净 X 运营文案：
 * 1. no_link_post：1 楼防限流无外链主帖（附纯文本原产品/仓库名 + 信源出处，无外链不降权）
 * 2. reply_cta：2 楼评论区引流回复（同时附上原产品官网、一手原帖与本站 UTM 拆解链接）
 * 3. quick_intent：<= 280 加权字符一键直发帖（带产品标识前缀 + 原产品/原帖/本站拆解直达链接）
 */
export function buildXShareBundle(params: BuildXShareDraftsParams): XShareBundle {
  const { item, locale, lens, siteUrl } = params;
  const xHandle =
    params.xHandle !== undefined
      ? normalizeXHandle(params.xHandle)
      : getConfiguredXHandle();

  const origin = resolveSignalOriginInfo(item, locale);

  const detailUrl = buildSignalDetailUrl({
    siteUrl,
    locale,
    signalId: item.id,
  });

  const replyUrl = buildSignalDetailUrl({
    siteUrl,
    locale,
    signalId: item.id,
    utmSource: "x_reply",
    utmMedium: "social",
    utmCampaign: "card_share",
  });

  const directUrl = buildSignalDetailUrl({
    siteUrl,
    locale,
    signalId: item.id,
    utmSource: "x_share",
    utmMedium: "social",
    utmCampaign: "card_share",
  });

  const hook = formatHookHeadline(
    locale,
    item.category,
    item.title,
    item.metricsBadge
  );
  const originLines = buildNoLinkOriginLines(item, locale, origin);
  const engagement = getEngagementPrompt(locale, item.category);
  const hashtags = formatXHashtags(item.tags, locale, 2).join(" ");

  const cleanWhatLabel = stripShareIcons(lens.whatItIs);
  const cleanMonetizationLabel = stripShareIcons(lens.monetization);
  const cleanPlaybookLabel = stripShareIcons(lens.playbook);

  const noLinkPost = [
    hook,
    ...originLines,
    "",
    `${cleanWhatLabel} ${stripShareIcons(item.whatItIs)}`,
    `${cleanMonetizationLabel} ${stripShareIcons(item.businessSignal)}`,
    `${cleanPlaybookLabel} ${stripShareIcons(item.indieTakeaway)}`,
    "",
    engagement,
    hashtags,
  ]
    .filter((line, idx, arr) => {
      if (idx === arr.length - 1 && !line.trim()) return false;
      return true;
    })
    .join("\n");

  const replyCta = buildReplyCtaDraft(locale, item, origin, replyUrl);
  const quickIntent = buildQuickIntentDraft({
    item,
    locale,
    lens,
    origin,
    directUrl,
    xHandle,
  });

  return {
    drafts: {
      no_link_post: noLinkPost,
      reply_cta: replyCta,
      quick_intent: quickIntent,
    },
    origin,
    detailUrl,
    replyUrl,
    directUrl,
    xHandle,
  };
}

export function buildXIntentUrl(text: string): string {
  const normalized = text.trim();
  return `https://x.com/intent/post?text=${encodeURIComponent(normalized)}`;
}
