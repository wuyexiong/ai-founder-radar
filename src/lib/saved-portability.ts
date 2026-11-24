import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { isValidSourcePlatform } from "@/lib/seo-taxonomy";
import { buildSignalPermalink, toSafeHttpUrl } from "@/lib/utils";
import type {
  MetricType,
  SignalCategory,
  SignalItem,
  SourcePlatform,
} from "@/types/signal";

export const MAX_SAVED_BACKUP_BYTES = 2 * 1024 * 1024; // 2MB hard ceiling
export const MAX_SAVED_BACKUP_ITEMS = 2000;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_CATEGORIES = new Set<SignalCategory>([
  "launch",
  "revenue",
  "pain_point",
  "ai_trend",
]);

const VALID_METRIC_TYPES = new Set<MetricType>(["revenue", "heat", "pain"]);

const SOURCE_LABELS: Record<SourcePlatform, string> = {
  producthunt: "Product Hunt",
  hackernews: "Hacker News",
  indiehackers: "Indie Hackers",
  acquire: "Acquire.com",
  reddit: "Reddit",
  github: "GitHub",
  trustmrr: "TrustMRR",
  appstore: "App Store",
};

const MARKDOWN_EXPORT_COPY: Record<
  Locale,
  {
    docTitle: string;
    subtitle: (count: number) => string;
    scoreLabel: string;
    dateLabel: string;
    sourceLabel: string;
    categoryLabel: string;
    originalTitleLabel: string;
    tagsLabel: string;
    sourcePostLinkLabel: string;
    permalinkLabel: string;
    emptyNote: string;
  }
> = {
  en: {
    docTitle: "AI Founder Radar — Saved Commercial Signals & Research Notes",
    subtitle: (count) =>
      `Curated ${count} bookmarked Micro-SaaS, Verified MRR & Pain Point signals`,
    scoreLabel: "Score",
    dateLabel: "Issue Date",
    sourceLabel: "Source",
    categoryLabel: "Category",
    originalTitleLabel: "Original Title",
    tagsLabel: "Tags",
    sourcePostLinkLabel: "Original Post",
    permalinkLabel: "Radar Permalink",
    emptyNote: "No saved signals in this export.",
  },
  zh: {
    docTitle: "AI Founder Radar — 出海商机与产品灵感收藏笔记",
    subtitle: (count) => `共导出 ${count} 条高价值 Micro-SaaS、真实 MRR 与海外痛点信号`,
    scoreLabel: "商业评分",
    dateLabel: "归档日期",
    sourceLabel: "一手信源",
    categoryLabel: "信号分类",
    originalTitleLabel: "英文原题",
    tagsLabel: "切口标签",
    sourcePostLinkLabel: "查看一手原帖",
    permalinkLabel: "本站永久锚点",
    emptyNote: "当前暂无已收藏的商业信号。",
  },
  "zh-TW": {
    docTitle: "AI Founder Radar — 出海商機與產品靈感收藏筆記",
    subtitle: (count) => `共匯出 ${count} 則高價值 Micro-SaaS、真實 MRR 與海外痛點信號`,
    scoreLabel: "商業評分",
    dateLabel: "歸檔日期",
    sourceLabel: "一手來源",
    categoryLabel: "信號分類",
    originalTitleLabel: "英文原題",
    tagsLabel: "切角標籤",
    sourcePostLinkLabel: "檢視一手原帖",
    permalinkLabel: "本站永久連結",
    emptyNote: "目前尚無已收藏的商業信號。",
  },
  ja: {
    docTitle: "AI Founder Radar — 保存済みビジネスシグナル＆リサーチノート",
    subtitle: (count) =>
      `厳選 Micro-SaaS・リアルMRR・海外課題シグナル 全 ${count} 件`,
    scoreLabel: "スコア",
    dateLabel: "収録日",
    sourceLabel: "情報ソース",
    categoryLabel: "カテゴリ",
    originalTitleLabel: "英語原題",
    tagsLabel: "タグ",
    sourcePostLinkLabel: "元記事リンク",
    permalinkLabel: "パーマリンク",
    emptyNote: "保存済みのシグナルはありません。",
  },
};

function isSafeStringKey(key: string): boolean {
  return Boolean(key && key.length <= 160 && !FORBIDDEN_KEYS.has(key));
}

function cleanSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeMarkdownLinkText(text: string): string {
  return cleanSingleLine(text).replace(/[[\]]/g, "\\$&");
}

/**
 * 严格校验并净化单条收藏信号快照，阻断原型污染与非 HTTP(S) 恶意协议（如 `javascript:`）
 */
export function sanitizeSavedSignalItem(raw: unknown): SignalItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string") return null;
  const id = obj.id.trim();
  if (!isSafeStringKey(id)) return null;

  if (typeof obj.dateKey !== "string" || !ISO_DATE_RE.test(obj.dateKey.trim())) {
    return null;
  }
  const dateKey = obj.dateKey.trim();

  if (typeof obj.sourceUrl !== "string") return null;
  const safeSourceUrl = toSafeHttpUrl(obj.sourceUrl);
  if (safeSourceUrl === "#") return null;

  if (typeof obj.score !== "number" || !Number.isFinite(obj.score)) {
    return null;
  }
  const score = Math.min(10, Math.max(0, obj.score));

  const titleCandidate =
    typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim()
      : typeof obj.titleOrig === "string" && obj.titleOrig.trim()
        ? obj.titleOrig.trim()
        : typeof obj.titleZh === "string" && obj.titleZh.trim()
          ? obj.titleZh.trim()
          : "";
  if (!titleCandidate) return null;

  if (
    obj.category !== undefined &&
    (typeof obj.category !== "string" ||
      !VALID_CATEGORIES.has(obj.category as SignalCategory))
  ) {
    return null;
  }
  const category: SignalCategory =
    typeof obj.category === "string" &&
    VALID_CATEGORIES.has(obj.category as SignalCategory)
      ? (obj.category as SignalCategory)
      : "launch";

  if (
    obj.metricType !== undefined &&
    (typeof obj.metricType !== "string" ||
      !VALID_METRIC_TYPES.has(obj.metricType as MetricType))
  ) {
    return null;
  }
  const metricType: MetricType =
    typeof obj.metricType === "string" &&
    VALID_METRIC_TYPES.has(obj.metricType as MetricType)
      ? (obj.metricType as MetricType)
      : category === "revenue"
        ? "revenue"
        : category === "pain_point"
          ? "pain"
          : "heat";

  if (
    obj.sourcePlatform !== undefined &&
    (typeof obj.sourcePlatform !== "string" ||
      !isValidSourcePlatform(obj.sourcePlatform))
  ) {
    return null;
  }
  const sourcePlatform: SourcePlatform =
    typeof obj.sourcePlatform === "string" &&
    isValidSourcePlatform(obj.sourcePlatform)
      ? obj.sourcePlatform
      : "producthunt";

  const tags = Array.isArray(obj.tags)
    ? obj.tags
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .slice(0, 16)
        .map((t) => t.trim().slice(0, 64))
    : [];

  const topics = Array.isArray(obj.topics)
    ? obj.topics
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .slice(0, 12)
        .map((t) => t.trim().slice(0, 64))
    : undefined;

  return {
    id,
    dateKey,
    title: titleCandidate.slice(0, 400),
    titleZh:
      typeof obj.titleZh === "string"
        ? obj.titleZh.trim().slice(0, 400)
        : titleCandidate.slice(0, 400),
    titleOrig:
      typeof obj.titleOrig === "string"
        ? obj.titleOrig.trim().slice(0, 400)
        : titleCandidate.slice(0, 400),
    category,
    whatItIs:
      typeof obj.whatItIs === "string"
        ? obj.whatItIs.trim().slice(0, 1200)
        : "",
    businessSignal:
      typeof obj.businessSignal === "string"
        ? obj.businessSignal.trim().slice(0, 1200)
        : "",
    indieTakeaway:
      typeof obj.indieTakeaway === "string"
        ? obj.indieTakeaway.trim().slice(0, 1200)
        : "",
    metricsBadge:
      typeof obj.metricsBadge === "string"
        ? obj.metricsBadge.trim().slice(0, 120)
        : "",
    metricType,
    tags,
    score,
    isTopPick: Boolean(obj.isTopPick),
    sourcePlatform,
    sourceSublabel:
      typeof obj.sourceSublabel === "string"
        ? obj.sourceSublabel.trim().slice(0, 120)
        : "",
    sourceUrl: safeSourceUrl,
    publishedAt:
      typeof obj.publishedAt === "string" && obj.publishedAt.trim()
        ? obj.publishedAt.trim().slice(0, 64)
        : `${dateKey}T00:00:00.000Z`,
    ...(topics ? { topics } : {}),
  };
}

export function sortSavedSignalItems(items: SignalItem[]): SignalItem[] {
  return [...items].sort((a, b) => {
    if (a.dateKey !== b.dateKey) {
      return b.dateKey.localeCompare(a.dateKey);
    }
    return b.score - a.score;
  });
}

/**
 * 按日期倒序生成可直接导入 Obsidian / Notion / 飞书的 Markdown 调研笔记
 */
export function formatSavedSignalsMarkdown(
  items: SignalItem[],
  locale: Locale,
  siteUrl: string
): string {
  const dict = getDictionary(locale);
  const copy = MARKDOWN_EXPORT_COPY[locale] ?? MARKDOWN_EXPORT_COPY.en;
  const cleanSiteUrl = siteUrl.trim().replace(/\/$/, "");
  const sorted = sortSavedSignalItems(items);

  const lines: string[] = [
    `# ${copy.docTitle}`,
    "",
    `> ${copy.subtitle(sorted.length)} · [${cleanSiteUrl}](${cleanSiteUrl}/${locale})`,
    "",
  ];

  if (sorted.length === 0) {
    lines.push(`_${copy.emptyNote}_`, "");
    return lines.join("\n");
  }

  sorted.forEach((item, index) => {
    const badgePrefix = item.metricsBadge.trim()
      ? `[${cleanSingleLine(item.metricsBadge)}] `
      : "";
    const headingTitle = cleanSingleLine(item.title);
    const categoryText =
      dict.card.categories[item.category] ?? dict.card.categories.launch;
    const sourceBrand =
      SOURCE_LABELS[item.sourcePlatform] ?? item.sourcePlatform;
    const safePostUrl = toSafeHttpUrl(item.sourceUrl);
    const permalink = buildSignalPermalink({
      siteUrl: cleanSiteUrl,
      locale,
      dateKey: item.dateKey,
      signalId: item.id,
      utmSource: "saved_md",
    });

    lines.push(`## ${index + 1}. ${badgePrefix}${headingTitle}`);
    lines.push("");
    lines.push(
      `- **${copy.dateLabel}**: \`${item.dateKey}\` | **${copy.scoreLabel}**: \`${item.score.toFixed(1)}/10\` | **${copy.categoryLabel}**: ${categoryText} | **${copy.sourceLabel}**: ${sourceBrand}`
    );

    if (
      item.titleOrig &&
      cleanSingleLine(item.titleOrig).toLowerCase() !==
        headingTitle.toLowerCase()
    ) {
      lines.push(
        `- **${copy.originalTitleLabel}**: ${cleanSingleLine(item.titleOrig)}`
      );
    }

    lines.push(
      `- **${dict.card.whatItIs.trim()}** ${cleanSingleLine(item.whatItIs)}`
    );
    lines.push(
      `- **${dict.card.monetization.trim()}** ${cleanSingleLine(item.businessSignal)}`
    );
    lines.push(
      `- **${dict.card.playbook.trim()}** ${cleanSingleLine(item.indieTakeaway)}`
    );

    if (item.tags.length > 0) {
      const renderedTags = item.tags
        .map((t) => `\`${cleanSingleLine(t)}\``)
        .join(" ");
      lines.push(`- **${copy.tagsLabel}**: ${renderedTags}`);
    }

    const linkParts: string[] = [];
    if (safePostUrl !== "#") {
      linkParts.push(
        `[${escapeMarkdownLinkText(copy.sourcePostLinkLabel)}](${safePostUrl})`
      );
    }
    linkParts.push(
      `[${escapeMarkdownLinkText(copy.permalinkLabel)}](${permalink})`
    );
    lines.push(`- 🔗 ${linkParts.join(" · ")}`);
    lines.push("", "---", "");
  });

  return lines.join("\n");
}

export function serializeSavedSignalsBackup(
  map: Record<string, SignalItem>
): string {
  const cleanItems: Record<string, SignalItem> = {};
  for (const [key, rawItem] of Object.entries(map)) {
    if (!isSafeStringKey(key)) continue;
    const valid = sanitizeSavedSignalItem(rawItem);
    if (valid) {
      cleanItems[valid.id] = valid;
    }
  }

  return JSON.stringify(
    {
      version: 1,
      app: "ai-founder-radar",
      exportedAt: new Date().toISOString(),
      count: Object.keys(cleanItems).length,
      items: cleanItems,
    },
    null,
    2
  );
}

export interface MergeSavedBackupResult {
  merged: Record<string, SignalItem>;
  addedCount: number;
  validCount: number;
}

export function parseAndMergeSavedSignalsBackup(
  rawJson: string,
  existing: Record<string, SignalItem>
): MergeSavedBackupResult {
  if (typeof rawJson !== "string" || rawJson.trim().length === 0) {
    throw new Error("EMPTY_BACKUP");
  }

  if (rawJson.length > MAX_SAVED_BACKUP_BYTES) {
    throw new Error("BACKUP_TOO_LARGE");
  }
  const byteLength = new TextEncoder().encode(rawJson).byteLength;
  if (byteLength > MAX_SAVED_BACKUP_BYTES) {
    throw new Error("BACKUP_TOO_LARGE");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("INVALID_JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("INVALID_BACKUP_FORMAT");
  }

  // 构建零原型污染的安全合并字典（最终再导出为干净普通对象供 React state / JSON 序列化）
  const safeStore = new Map<string, SignalItem>();
  for (const [key, existingItem] of Object.entries(existing)) {
    if (!isSafeStringKey(key)) continue;
    const validExisting = sanitizeSavedSignalItem(existingItem);
    if (validExisting) {
      safeStore.set(validExisting.id, validExisting);
    }
  }

  let candidateList: unknown[] = [];
  if (Array.isArray(parsed)) {
    candidateList = parsed;
  } else {
    const envelope = parsed as Record<string, unknown>;
    const hasEnvelopeItems =
      Object.prototype.hasOwnProperty.call(envelope, "items") &&
      envelope.items &&
      typeof envelope.items === "object";

    if (hasEnvelopeItems) {
      if (Array.isArray(envelope.items)) {
        candidateList = envelope.items;
      } else {
        const itemsObj = envelope.items as Record<string, unknown>;
        for (const key of Object.keys(itemsObj)) {
          if (FORBIDDEN_KEYS.has(key)) continue;
          candidateList.push(itemsObj[key]);
        }
      }
    } else {
      for (const key of Object.keys(envelope)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        candidateList.push(envelope[key]);
      }
    }
  }

  let addedCount = 0;
  let validCount = 0;

  for (const rawCandidate of candidateList) {
    if (validCount >= MAX_SAVED_BACKUP_ITEMS) break;
    const valid = sanitizeSavedSignalItem(rawCandidate);
    if (!valid) continue;

    validCount += 1;
    if (!safeStore.has(valid.id)) {
      safeStore.set(valid.id, valid);
      addedCount += 1;
    }
  }

  // 若输入非空候选集但 0 条通过安全校验，拒绝导入以便前端提示错误
  if (candidateList.length > 0 && validCount === 0) {
    throw new Error("NO_VALID_ITEMS");
  }

  const merged: Record<string, SignalItem> = {};
  for (const [id, item] of safeStore.entries()) {
    merged[id] = item;
  }

  return {
    merged,
    addedCount,
    validCount,
  };
}
