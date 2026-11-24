import { HREFLANG_MAP, LOCALES, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getSourceCopy, getTopicCopy } from "@/lib/seo-taxonomy";
import type { HubDirectory } from "@/lib/signals-repo";
import {
  buildSignalDetailUrl,
  buildSignalPermalink,
  toSafeHttpUrl,
} from "@/lib/utils";
import type { DailyOverview, SignalItem } from "@/types/signal";

export const FOLO_USER_ID = "1392517160695285734";

export const FOLO_FEED_IDS: Record<Locale, string> = {
  zh: "1392517834419144145",
  "zh-TW": "1392519475190688121",
  ja: "1392520234191246987",
  en: "1392518752146427301",
};

const VALID_SIGNAL_ID_RE = /^sig-[a-zA-Z0-9_-]{2,80}$/;

export function escapeXml(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc2822Date(isoOrDate: string, fallback: Date): string {
  const parsed = new Date(isoOrDate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toUTCString();
  }
  const dayFallback = new Date(`${isoOrDate}T00:00:00Z`);
  if (!Number.isNaN(dayFallback.getTime())) {
    return dayFallback.toUTCString();
  }
  return fallback.toUTCString();
}

export function buildRssFeedXml(params: {
  siteUrl: string;
  locale: Locale;
  latestDateKey: string;
  items: SignalItem[];
}): string {
  const base = params.siteUrl.trim().replace(/\/$/, "");
  const dict = getDictionary(params.locale);
  const feedUrl = `${base}/${params.locale}/feed.xml`;
  const channelLink = `${base}/${params.locale}`;
  const fallbackNow = new Date(`${params.latestDateKey}T00:00:00Z`);
  const safeFallback = Number.isNaN(fallbackNow.getTime())
    ? new Date()
    : fallbackNow;

  const lastBuildDate =
    params.items.length > 0
      ? toRfc2822Date(params.items[0].publishedAt, safeFallback)
      : safeFallback.toUTCString();

  const itemsXml = params.items
    .map((item) => {
      const trimmedId = item.id.trim();
      const permalink = VALID_SIGNAL_ID_RE.test(trimmedId)
        ? buildSignalDetailUrl({
            siteUrl: base,
            locale: params.locale,
            signalId: trimmedId,
            utmSource: "rss",
          })
        : buildSignalPermalink({
            siteUrl: base,
            locale: params.locale,
            dateKey: item.dateKey,
            signalId: item.id,
            utmSource: "rss",
          });
      const safeSource = toSafeHttpUrl(item.sourceUrl);
      const sourceHref = safeSource === "#" ? permalink : safeSource;
      const badgePrefix = item.metricsBadge.trim()
        ? `[${item.metricsBadge.trim()}] `
        : "";
      const categoryLabel =
        dict.card.categories[item.category] ?? dict.card.categories.launch;

      const htmlSummary = [
        `<p><strong>${escapeXml(dict.card.whatItIs)}</strong> ${escapeXml(item.whatItIs)}</p>`,
        `<p><strong>${escapeXml(dict.card.monetization)}</strong> ${escapeXml(item.businessSignal)}</p>`,
        `<p><strong>${escapeXml(dict.card.playbook)}</strong> ${escapeXml(item.indieTakeaway)}</p>`,
        `<p><a href="${escapeXml(sourceHref)}">${escapeXml(dict.card.viewSource)} ↗</a> · <a href="${escapeXml(permalink)}">AI Founder Radar (${escapeXml(item.score.toFixed(1))}/10)</a></p>`,
      ].join("");

      const categoryTags = [categoryLabel, ...item.tags]
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => `      <category>${escapeXml(c)}</category>`)
        .join("\n");

      return [
        "    <item>",
        `      <title>${escapeXml(`${badgePrefix}${item.title}`)}</title>`,
        `      <link>${escapeXml(permalink)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(`${item.id}:${params.locale}`)}</guid>`,
        `      <pubDate>${escapeXml(toRfc2822Date(item.publishedAt, safeFallback))}</pubDate>`,
        categoryTags,
        `      <description>${escapeXml(htmlSummary)}</description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const foloFeedId = FOLO_FEED_IDS[params.locale];
  const foloChallengeXml =
    foloFeedId && FOLO_USER_ID
      ? [
          "    <follow_challenge>",
          `      <feedId>${escapeXml(foloFeedId)}</feedId>`,
          `      <userId>${escapeXml(FOLO_USER_ID)}</userId>`,
          "    </follow_challenge>",
        ].join("\n")
      : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(dict.meta.siteTitle)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${escapeXml(dict.meta.siteDescription)}</description>`,
    `    <language>${escapeXml(HREFLANG_MAP[params.locale])}</language>`,
    `    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>`,
    "    <ttl>60</ttl>",
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    foloChallengeXml,
    itemsXml,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((segment) => segment !== "")
    .join("\n");
}

export function buildLlmsTxt(params: {
  siteUrl: string;
  hubDirectory: HubDirectory;
  availableDates: string[];
}): string {
  const base = params.siteUrl.trim().replace(/\/$/, "");
  const recentDates = params.availableDates.slice(0, 7);

  const lines: string[] = [
    "# AI Founder Radar",
    "",
    "> Daily 5-minute commercial intelligence radar for Indie Hackers, Solo Founders, and Micro-SaaS builders. Automatically scans 8 primary global sources (TrustMRR, App Store US/JP Top Grossing, Product Hunt, Hacker News Show HN, GitHub Trending & 7d Breakouts, Indie Hackers, Acquire.com, and Reddit) and distills high-signal items into What It Is, Verified Monetization ($MRR/$ARR), and Replicable Indie Playbooks across 4 languages (EN, ZH-CN, ZH-TW, JA).",
    "",
    "## Live Multilingual Dashboards & RSS Feeds",
    `- [English Live Radar](${base}/en): Daily curated Micro-SaaS launches, verified MRR & buyer pain points`,
    `- [简体中文实时看板](${base}/zh): 每日出海搞钱、真实 MRR 变现拆解与海外用户痛点精选`,
    `- [繁體中文即時看板](${base}/zh-TW): 每日海外 Micro-SaaS 真實營收與獨立開發靈感雷達`,
    `- [日本語リアルタイムボード](${base}/ja): 海外個人開発・Micro-SaaS収益事例＆課題シグナル厳選`,
    `- [English RSS 2.0 Feed](${base}/en/feed.xml)`,
    `- [简体中文 RSS 2.0 订阅源](${base}/zh/feed.xml)`,
    `- [繁體中文 RSS 2.0 訂閱源](${base}/zh-TW/feed.xml)`,
    `- [日本語 RSS 2.0 フィード](${base}/ja/feed.xml)`,
    `- [Full LLM Context Dump (Markdown)](${base}/llms-full.txt): Latest curated commercial signals with full structured 3-point breakdowns`,
  ];

  if (params.hubDirectory.topics.length > 0) {
    lines.push("", "## Evergreen Profitable Niche Hubs");
    for (const topic of params.hubDirectory.topics) {
      const copy = getTopicCopy(topic.slug, "en");
      lines.push(
        `- [${copy.label}](${base}/en/topic/${topic.slug}): ${copy.description} (${topic.count} curated signals)`
      );
    }
  }

  if (params.hubDirectory.sources.length > 0) {
    lines.push("", "## Primary Signal Source Hubs");
    for (const src of params.hubDirectory.sources) {
      const copy = getSourceCopy(src.platform, "en");
      lines.push(
        `- [${copy.label}](${base}/en/source/${src.platform}): ${copy.description} (${src.count} curated signals)`
      );
    }
  }

  if (recentDates.length > 0) {
    lines.push("", "## Recent Daily Briefings");
    for (const d of recentDates) {
      lines.push(
        `- [${d} Global Founder Briefing (EN)](${base}/en/daily/${d}) · [中文归档](${base}/zh/daily/${d}) · [日本語](${base}/ja/daily/${d})`
      );
    }
  }

  lines.push(
    "",
    "## Citation & Crawling Policy",
    `- Sitemap: ${base}/sitemap.xml`,
    `- All locales (${LOCALES.map((l) => `/${l}`).join(", ")}) are symmetrically cross-linked via hreflang.`,
    "- AI search engines and research agents are welcome to cite structured MRR signals and link back to the canonical daily or topic hub URL.",
    ""
  );

  return lines.join("\n");
}

export function buildLlmsFullTxt(params: {
  siteUrl: string;
  latestDateKey: string;
  overview: DailyOverview;
  items: SignalItem[];
  hubDirectory: HubDirectory;
}): string {
  const base = params.siteUrl.trim().replace(/\/$/, "");
  const lines: string[] = [
    "# AI Founder Radar — Full Structured Commercial Intelligence Context",
    "",
    `> Canonical Site: ${base}/en | Latest Sync Date: ${params.latestDateKey} | Curated Window Signals: ${params.items.length}`,
    "",
    "## Editorial Pulse",
    params.overview.summaryNote ||
      "Curated high-signal Micro-SaaS launches, verified MRR case studies, and buyer pain points.",
    "",
    "## Latest Curated Commercial Signals (Sorted by Date & Commercial Score)",
  ];

  for (const item of params.items) {
    const permalink = buildSignalPermalink({
      siteUrl: base,
      locale: "en",
      dateKey: item.dateKey,
      signalId: item.id,
      utmSource: "llms_txt",
    });
    const safeSource = toSafeHttpUrl(item.sourceUrl);

    lines.push(
      "",
      `### [${item.metricsBadge}] ${item.title} (Score: ${item.score.toFixed(1)}/10 · ${item.dateKey})`,
      `- **Category**: \`${item.category}\` | **Source**: \`${item.sourcePlatform}\`${item.sourceSublabel ? ` (${item.sourceSublabel})` : ""}`,
      `- **What It Is**: ${item.whatItIs}`,
      `- **Monetization & Traction**: ${item.businessSignal}`,
      `- **Replicable Indie Playbook**: ${item.indieTakeaway}`,
      item.tags.length > 0 ? `- **Angles**: ${item.tags.join(", ")}` : "",
      `- **Radar Permalink**: ${permalink}`,
      safeSource !== "#" ? `- **Primary Source URL**: ${safeSource}` : ""
    );
  }

  if (params.hubDirectory.topics.length > 0) {
    lines.push("", "## Active Topic Hubs Index");
    for (const t of params.hubDirectory.topics) {
      const enCopy = getTopicCopy(t.slug, "en");
      lines.push(
        `- ${enCopy.label} (${t.count} signals, ${t.revenueCount} revenue cases): ${base}/en/topic/${t.slug} | ${base}/zh/topic/${t.slug} | ${base}/ja/topic/${t.slug}`
      );
    }
  }

  lines.push("");
  return lines.filter((line, idx, arr) => !(line === "" && arr[idx - 1] === "")).join("\n");
}
