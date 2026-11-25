import type { Locale } from "@/i18n/config";
import type { CardLensLabels } from "@/i18n/dictionaries";
import { buildSignalDetailUrl } from "@/lib/utils";
import type { SignalCategory, SignalItem } from "@/types/signal";

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
    if (locale === "en" && /[\u3040-\u30ff\u4e00-\u9fff]/.test(stripped)) {
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

function formatHookHeadline(
  locale: Locale,
  category: SignalCategory,
  title: string,
  metricsBadge: string
): string {
  const cleanTitle = title.trim();
  const cleanBadge = metricsBadge.trim();
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
        return `💰 真实变现信号${badgeTag}：${cleanTitle}`;
      case "launch":
        return `🚀 今日出海新品${badgeTag}：${cleanTitle}`;
      case "pain_point":
        return `🔥 海外高赞痛点${badgeTag}：${cleanTitle}`;
      case "ai_trend":
        return `⚡ AI / 开源风向${badgeTag}：${cleanTitle}`;
    }
  }

  if (locale === "zh-TW") {
    switch (category) {
      case "revenue":
        return `💰 真實變現信號${badgeTag}：${cleanTitle}`;
      case "launch":
        return `🚀 今日出海新品${badgeTag}：${cleanTitle}`;
      case "pain_point":
        return `🔥 海外高讚痛點${badgeTag}：${cleanTitle}`;
      case "ai_trend":
        return `⚡ AI / 開源風向${badgeTag}：${cleanTitle}`;
    }
  }

  if (locale === "ja") {
    switch (category) {
      case "revenue":
        return `💰 リアル収益シグナル${badgeTag}：${cleanTitle}`;
      case "launch":
        return `🚀 注目の新着プロダクト${badgeTag}：${cleanTitle}`;
      case "pain_point":
        return `🔥 海外のリアル課題${badgeTag}：${cleanTitle}`;
      case "ai_trend":
        return `⚡ AI・OSS トレンド${badgeTag}：${cleanTitle}`;
    }
  }

  // en
  switch (category) {
    case "revenue":
      return `💰 Verified revenue signal${badgeTag}: ${cleanTitle}`;
    case "launch":
      return `🚀 Notable indie launch${badgeTag}: ${cleanTitle}`;
    case "pain_point":
      return `🔥 Validated buyer pain${badgeTag}: ${cleanTitle}`;
    case "ai_trend":
      return `⚡ AI & OSS signal${badgeTag}: ${cleanTitle}`;
  }
}

function getEngagementPrompt(locale: Locale, category: SignalCategory): string {
  if (locale === "zh") {
    switch (category) {
      case "revenue":
        return "你觉得这个垂直切口在中文或海外细分场景里还能怎么微创新？\n完整拆解、产品官网与一手原帖放评论区 👇";
      case "launch":
        return "如果是你来做这个方向，会保留哪个核心功能、砍掉哪块？\n产品官网与一手讨论链接放评论区 👇";
      case "pain_point":
        return "这种用户主动喊着要付费的痛点，你觉得值得周末出个 MVP 测测吗？\n原帖讨论与完整商机拆解放评论区 👇";
      case "ai_trend":
        return "这个技术/开源风向，你会优先把它包装成什么垂直小工具来收费？\n项目入口与商业化拆解放评论区 👇";
    }
  }

  if (locale === "zh-TW") {
    switch (category) {
      case "revenue":
        return "你覺得這個垂直切角還有哪些細分場景可以微創新？\n完整拆解、產品官網與一手原帖放留言區 👇";
      case "launch":
        return "如果是你來做這個方向，會先保留哪個核心功能？\n產品官網與一手討論連結放留言區 👇";
      case "pain_point":
        return "這種使用者主動喊著想付費的痛點，值得用週末做個 MVP 驗證嗎？\n原帖討論與完整拆解放留言區 👇";
      case "ai_trend":
        return "這個技術/開源風向，你會優先包裝成什麼垂直小工具變現？\n專案入口與商業化拆解放留言區 👇";
    }
  }

  if (locale === "ja") {
    switch (category) {
      case "revenue":
        return "このニッチ領域、日本市場や別業界に横展開するとしたらどこを狙いますか？\n詳細分析・公式サイト・一次情報リンクはリプ欄へ 👇";
      case "launch":
        return "もし自分でこの領域に参入するなら、どの機能に絞り込みますか？\n公式サイトと一次情報リンクはリプ欄へ 👇";
      case "pain_point":
        return "課金意欲が高いリアルな課題ですね。週末MVPで検証する価値ありそうでしょうか？\n元スレッドと詳細分析はリプ欄へ 👇";
      case "ai_trend":
        return "この技術・OSSトレンド、どんな垂直型マイクロSaaSに組み込めそうでしょう？\nプロジェクトURLと分析詳細はリプ欄へ 👇";
    }
  }

  // en
  switch (category) {
    case "revenue":
      return "Would you clone this wedge for another vertical, or is distribution the real moat here?\nFull breakdown, product site & original source in the reply below 👇";
    case "launch":
      return "If you were building a leaner v1 in this space, what would you keep vs. cut?\nProduct website & original discussion link in the reply below 👇";
    case "pain_point":
      return "Feels like a clean weekend-MVP wedge with real buyer urgency — would you ship it?\nOriginal thread & full breakdown in the reply below 👇";
    case "ai_trend":
      return "How would you wrap this into a paid vertical workflow instead of competing on raw tech?\nRepo/source & full commercial breakdown in the reply below 👇";
  }
}

function buildReplyCtaDraft(locale: Locale, replyUrl: string): string {
  switch (locale) {
    case "zh":
      return [
        "👇 完整三要素拆解 + 产品官网 & 一手原帖直达：",
        replyUrl,
        "",
        "每天早上 5 分钟，自动筛完 TrustMRR / Product Hunt / Show HN / Reddit 等 8 大海外一手信源，只留真变现、真痛点。",
      ].join("\n");
    case "zh-TW":
      return [
        "👇 完整三要素拆解 + 產品官網 & 一手原帖直達：",
        replyUrl,
        "",
        "每天早上 5 分鐘，自動篩選 TrustMRR / Product Hunt / Show HN / Reddit 等 8 大海外一手來源，只留真變現與真痛點。",
      ].join("\n");
    case "ja":
      return [
        "👇 詳細分析 + 公式サイト & 一次情報リンクはこちら：",
        replyUrl,
        "",
        "毎朝5分で TrustMRR / Product Hunt / Show HN / Reddit など海外8大ソースから「リアルな収益事例と課題」だけを厳選しています。",
      ].join("\n");
    default:
      return [
        "👇 Full 3-point breakdown + direct product & original source links:",
        replyUrl,
        "",
        "Daily 5-min radar scanning 8 primary indie sources (TrustMRR, Product Hunt, Show HN, Reddit, Acquire & more) — pure commercial signal, zero noise.",
      ].join("\n");
  }
}

function buildQuickIntentDraft(params: {
  item: SignalItem;
  locale: Locale;
  lens: CardLensLabels;
  directUrl: string;
  xHandle: string | null;
}): string {
  const { item, locale, lens, directUrl, xHandle } = params;
  const cleanBadge = item.metricsBadge.trim();
  const cleanTitle = item.title.trim();
  const badgePrefix =
    cleanBadge && !cleanTitle.toLowerCase().includes(cleanBadge.toLowerCase())
      ? `[${cleanBadge}] `
      : "";

  const viaSuffix = xHandle ? ` via @${xHandle}` : "";
  const footerLine = `${directUrl}${viaSuffix}`;
  const footerWeight = measureXTextWeight(footerLine).weighted;

  // 预留 2 个换行符 + 安全余量
  const fullHeadline = `${badgePrefix}${cleanTitle}`;
  const playbookLine = `${lens.playbook.trim()} ${item.indieTakeaway.trim()}`;

  const combined = `${fullHeadline}\n\n${playbookLine}\n\n${footerLine}`;
  if (measureXTextWeight(combined).weighted <= X_FREE_CHAR_LIMIT) {
    return combined;
  }

  // 优先保留完整标题，适度压缩第三行（抄作业/Playbook）
  const newlineBudget = 4; // two "\n\n"
  const availableForContent = X_FREE_CHAR_LIMIT - footerWeight - newlineBudget;
  const headlineWeight = measureXTextWeight(fullHeadline).weighted;

  if (headlineWeight <= availableForContent - 48) {
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

  // 标题本身偏长时：按比例分配标题与核心启发预算
  const maxHeadlineWeight = Math.max(40, Math.floor(availableForContent * 0.54));
  const compactHeadline = truncateToXWeight(fullHeadline, maxHeadlineWeight);
  const remainingWeight =
    availableForContent - measureXTextWeight(compactHeadline).weighted;

  if (remainingWeight >= 28) {
    const compactPlaybook = truncateToXWeight(playbookLine, remainingWeight);
    const candidate = `${compactHeadline}\n\n${compactPlaybook}\n\n${footerLine}`;
    if (measureXTextWeight(candidate).weighted <= X_FREE_CHAR_LIMIT) {
      return candidate;
    }
  }

  // 极端兜底：仅保留压缩标题 + 链接
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
  detailUrl: string;
  replyUrl: string;
  directUrl: string;
  xHandle: string | null;
}

/**
 * 为单张商业信号卡片一次性生成三套针对 X 算法优化的运营文案：
 * 1. no_link_post：1 楼防限流无外链主帖（配 16:9 卡片图使用，最大化算法推荐与收藏）
 * 2. reply_cta：2 楼评论区引流回复（带独立详情页 UTM 链接，承接高意向访问与早报订阅）
 * 3. quick_intent：<= 280 加权字符一键直发帖（带专属 OG 大卡片链接与可选 via @handle）
 */
export function buildXShareBundle(params: BuildXShareDraftsParams): XShareBundle {
  const { item, locale, lens, siteUrl } = params;
  const xHandle =
    params.xHandle !== undefined
      ? normalizeXHandle(params.xHandle)
      : getConfiguredXHandle();

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
  const engagement = getEngagementPrompt(locale, item.category);
  const hashtags = formatXHashtags(item.tags, locale, 2).join(" ");

  const noLinkPost = [
    hook,
    "",
    `${lens.whatItIs.trim()} ${item.whatItIs.trim()}`,
    `${lens.monetization.trim()} ${item.businessSignal.trim()}`,
    `${lens.playbook.trim()} ${item.indieTakeaway.trim()}`,
    "",
    engagement,
    hashtags,
  ]
    .filter((line, idx, arr) => {
      // 保留刻意留白行，但剔除末尾空行
      if (idx === arr.length - 1 && !line.trim()) return false;
      return true;
    })
    .join("\n");

  const replyCta = buildReplyCtaDraft(locale, replyUrl);
  const quickIntent = buildQuickIntentDraft({
    item,
    locale,
    lens,
    directUrl,
    xHandle,
  });

  return {
    drafts: {
      no_link_post: noLinkPost,
      reply_cta: replyCta,
      quick_intent: quickIntent,
    },
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
