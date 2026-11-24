import { fetchViaJinaMarkdown } from "@/lib/collectors/jina";
import {
  addScannedCountFromExternal,
  isSafePublicHttpUrl,
  type GitHubStats,
  type RawFetchedItem,
} from "@/lib/collectors/sources";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function isSafeHttpsUrl(raw: string): boolean {
  return (
    isSafePublicHttpUrl(raw) && raw.trim().toLowerCase().startsWith("https://")
  );
}

function cleanText(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "User-Agent": USER_AGENT,
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 1. TrustMRR（Stripe / Polar / RevenueCat 实名验证的公开真实 MRR 榜与新上架项目）
// ============================================================================
const TRUSTMRR_ANONYMOUS_SLUG =
  /(anonymous|hidden[\s-]business|private[\s-]enterprise|stealth[\s-]venture|^https:\/\/trustmrr\.com\/startup\/startup-[a-f0-9]+)/i;

function parseDollarValue(str?: string): number {
  if (!str) return 0;
  const m = str.replace(/,/g, "").match(/\$?\s*([\d.]+)\s*([kKmMbB])?/);
  if (!m) return 0;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return 0;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "k") return base * 1_000;
  if (unit === "m") return base * 1_000_000;
  if (unit === "b") return base * 1_000_000_000;
  return base;
}

export async function fetchTrustMrr(
  limit = 10,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  try {
    const [homeRes, acquireRes] = await Promise.all([
      fetchViaJinaMarkdown("https://trustmrr.com/", 16000),
      fetchViaJinaMarkdown("https://trustmrr.com/acquire", 16000),
    ]);

    const candidates: Array<
      RawFetchedItem & { rankScore: number; slugUrl: string }
    > = [];
    const seenUrls = new Set<string>();

    const parseSaleCardsFromMarkdown = (md: string) => {
      const saleCardRegex =
        /\[(?:FOR SALE\s+)?!\[[^\]]*\]\([^\)]+\)\s*###\s*([^\]]+?)\]\((https:\/\/trustmrr\.com\/startup\/[a-z0-9_-]+)\)/gi;
      const saleMatches = [...md.matchAll(saleCardRegex)];
      addScannedCountFromExternal(saleMatches.length);

      for (const m of saleMatches) {
        const cardInfo = m[1].replace(/\s+/g, " ").trim();
        const startupUrl = m[2].trim();
        if (!isSafeHttpsUrl(startupUrl)) continue;
        if (seenUrls.has(startupUrl) || excludeUrls?.has(startupUrl)) continue;
        if (
          TRUSTMRR_ANONYMOUS_SLUG.test(startupUrl) ||
          TRUSTMRR_ANONYMOUS_SLUG.test(cardInfo)
        ) {
          continue;
        }

        const revStr =
          cardInfo.match(/Revenue\s*(\$[\d,.]+[kKmM]?)/i)?.[1] ??
          cardInfo.match(/MRR\s*(\$[\d,.]+[kKmM]?)/i)?.[1];
        const priceStr = cardInfo.match(/Price\s*(\$[\d,.]+[kKmM]?)/i)?.[1];
        const multStr = cardInfo.match(/Multiple\s*([\d.]+x)/i)?.[1];
        const revAmount = parseDollarValue(revStr);

        // 过滤无营收玩具（至少 >= $150 实名流水）
        if (revStr && revAmount < 150) continue;
        seenUrls.add(startupUrl);

        const cleanTitlePart = cardInfo
          .replace(/\s*(?:Revenue|MRR|Asking|Price)\s*\$.*$/i, "")
          .trim();
        const metricParts = [
          revStr ? `验证营收 ${revStr}` : "",
          priceStr ? `叫价 ${priceStr}` : "",
          multStr ? `(${multStr})` : "",
        ].filter(Boolean);

        candidates.push({
          title: revStr
            ? `${cleanTitlePart} — Verified Revenue ${revStr}`
            : cleanTitlePart,
          summary: `TrustMRR Stripe/Payment-verified startup: ${cardInfo}`,
          url: startupUrl,
          sourcePlatform: "trustmrr",
          sourceSublabel: "TrustMRR 实名榜",
          rawMetric: metricParts.slice(0, 2).join(" · ") || "Stripe 实名验证",
          publishedAt: new Date().toISOString(),
          rankScore:
            revAmount > 0 ? Math.min(90, Math.log10(revAmount + 10) * 18) : 36,
          slugUrl: startupUrl,
        });
      }
    };

    if (homeRes && homeRes.ok) {
      const homeMd = await homeRes.text();
      parseSaleCardsFromMarkdown(homeMd);

      // 解析首页 What's happening 实时创始人验证项目动态流
      const feedSectionIdx = homeMd.indexOf("## What's happening?");
      if (feedSectionIdx !== -1) {
        const feedMd = homeMd.slice(feedSectionIdx, feedSectionIdx + 10000);
        const updateBlocks = feedMd
          .split(/\[!\[Image \d+:[^\]]*profile picture\]/i)
          .slice(1);
        addScannedCountFromExternal(updateBlocks.length);

        for (const block of updateBlocks) {
          const startupMatch = block.match(
            /!\[Image \d+:[^\]]*logo\]\([^\)]+\)([^\]]+)\]\((https:\/\/trustmrr\.com\/startup\/[a-z0-9_-]+)\)\s*·\s*(\d+[hm]|1d)/i
          );
          if (!startupMatch) continue;
          const startupName = startupMatch[1].trim();
          const startupUrl = startupMatch[2].trim();
          const recencyLabel = startupMatch[3];
          if (!isSafeHttpsUrl(startupUrl)) continue;
          if (seenUrls.has(startupUrl) || excludeUrls?.has(startupUrl)) continue;
          if (TRUSTMRR_ANONYMOUS_SLUG.test(startupUrl)) continue;

          const bodyAfterHeader = block
            .slice((startupMatch.index ?? 0) + startupMatch[0].length)
            .replace(/!\[[^\]]*\]\([^\)]+\)/g, "")
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
            .replace(/\b0\s+0\b|Show more/gi, "")
            .replace(/\s+/g, " ")
            .trim();

          if (bodyAfterHeader.length < 60) continue;
          seenUrls.add(startupUrl);

          candidates.push({
            title: `${startupName}: ${bodyAfterHeader.slice(0, 80)}`,
            summary: `${startupName} (${recencyLabel} ago on TrustMRR): ${bodyAfterHeader.slice(0, 460)}`,
            url: startupUrl,
            sourcePlatform: "trustmrr",
            sourceSublabel: "TrustMRR 动态",
            rawMetric: `TrustMRR 实名项目 · ${recencyLabel}`,
            publishedAt: new Date().toISOString(),
            rankScore: 44,
            slugUrl: startupUrl,
          });
        }
      }
    }

    if (acquireRes && acquireRes.ok) {
      const acquireMd = await acquireRes.text();
      parseSaleCardsFromMarkdown(acquireMd);
    }

    const picked = candidates
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, limit);

    // 经由全局 Jina 并发节流池拉取详情页，避免触发 r.jina.ai 20 RPM 限流
    await Promise.all(
      picked.map(async (item) => {
        try {
          const dRes = await fetchViaJinaMarkdown(item.slugUrl, 9000);
          if (!dRes || !dRes.ok) return;
          const dMd = await dRes.text();
            const titleLine = dMd
              .match(/^Title:\s*(.+)$/m)?.[1]
              ?.replace(/\s*[-|]\s*TrustMRR.*$/i, "")
              .trim();
            const contentIdx = dMd.indexOf("Markdown Content:");
            if (contentIdx !== -1) {
              const afterHeader = dMd.slice(contentIdx + 17);
              // 跳过顶栏赞助商卡片区，从正文 H1 标题 (# StartupName) 开始截取真实详情
              const h1Idx = afterHeader.search(/^#\s+[^\n]+/m);
              const mainSection =
                h1Idx !== -1 ? afterHeader.slice(h1Idx) : afterHeader;

              const cleanBody = mainSection
                .replace(/!\[[^\]]*\]\([^\)]+\)/g, "")
                .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
                .replace(/\s+/g, " ")
                .trim();

              const mrrMatch = cleanBody.match(/MRR\s*(\$[\d,.]+[kKmM]?)/i)?.[1];
              if (mrrMatch && !/\bMRR\s*\$/i.test(item.rawMetric)) {
                item.rawMetric = `MRR ${mrrMatch} · ${item.rawMetric}`
                  .slice(0, 26)
                  .replace(/[\s·]+$/, "");
              }
              if (titleLine && titleLine.length > 4) {
                item.title = titleLine;
              }
              if (cleanBody.length > 60) {
                item.summary = `${item.summary} | Startup Details: ${cleanBody.slice(0, 440)}`;
              }
            }
        } catch {
          // 保留列表卡片信息兜底
        }
      })
    );

    return picked.map(({ rankScore: _r, slugUrl: _s, ...rest }) => rest);
  } catch (err) {
    console.warn("[Collector] TrustMRR fetch skipped:", err);
    return [];
  }
}

// ============================================================================
// 2. App Store 美区/日区效率与工具畅销榜 JSON（美区 5 + 日区 5 = 10 条独立内购黑马）
// ============================================================================
const BIG_TECH_PUBLISHER_PATTERN =
  /\b(Google|Microsoft|Apple|Adobe|Dropbox|Meta|Facebook|Instagram|Amazon|Blink|Ring|OpenAI|Anthropic|Perplexity|xAI|Notion|Evernote|Bending Spoons|Grammarly|Zoom|Cisco|Webex|Symantec|Norton|LifeLock|McAfee|Avast|Gen Digital|Kaspersky|Bitdefender|Malwarebytes|Nordsec|NordVPN|ExpressVPN|Surfshark|Kape|Proton|1Password|AgileBits|LastPass|Dashlane|Bitwarden|Yahoo|LY Corporation|LINE|Rakuten|SoftBank|NTT|KDDI|Docomo|Sony|Nintendo|Canon|Epson|HP Inc|Brother|ByteDance|TikTok|Tencent|Alibaba|Baidu|WPS|Kingsoft|CamScanner|INTSIG|Goodnotes|Notability|Ginger Labs|Todoist|Doist|Trello|Atlassian|Asana|Monday\.com|Canva|Autodesk|Intuit|Square|Block,\s*Inc|PayPal|Verizon|AT&T|T-Mobile|Opera|Mozilla|Brave Software|Cloudflare|Termius|Panic,\s*Inc|Readdle|Scanner Pro|onenote|outlook)\b/i;

const BIG_TECH_APP_TITLE_PATTERN =
  /^(ChatGPT|Claude|Google\b|Microsoft\b|Dropbox|Adobe\b|Notion|Grammarly|Zoom|1Password|NordVPN|ExpressVPN|Surfshark|McAfee|Norton|LINE\b|Yahoo|PayPay|楽天|マイナポータル|Grok|Perplexity)/i;

const HARDWARE_COMPANION_PATTERN =
  /\b(doorbell|pir motion|dashcam|dash cam|ip camera|security camera|earbuds|hearing aid|obd2|smart watch|smartwatch|bluetooth printer|thermal printer|thermostat|drone|baby monitor)\b/i;

interface ItunesChartConfig {
  country: "us" | "jp";
  genreId: "6007" | "6002";
  sublabel: string;
}

const APPSTORE_CHARTS: ItunesChartConfig[] = [
  { country: "us", genreId: "6007", sublabel: "美区效率畅销" },
  { country: "us", genreId: "6002", sublabel: "美区工具畅销" },
  { country: "jp", genreId: "6007", sublabel: "日区效率畅销" },
  { country: "jp", genreId: "6002", sublabel: "日区工具畅销" },
];

interface ItunesRssEntry {
  "im:name"?: { label?: string };
  "im:artist"?: { label?: string };
  summary?: { label?: string };
  id?: {
    label?: string;
    attributes?: { "im:id"?: string; "im:bundleId"?: string };
  };
  "im:releaseDate"?: { label?: string };
}

export async function fetchAppStoreTopGrossing(
  limit = 10,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  const usCandidates: Array<RawFetchedItem & { score: number; bundleId: string }> = [];
  const jpCandidates: Array<RawFetchedItem & { score: number; bundleId: string }> = [];

  await Promise.all(
    APPSTORE_CHARTS.map(async (chart) => {
      try {
        const url = `https://itunes.apple.com/${chart.country}/rss/topgrossingapplications/limit=60/genre=${chart.genreId}/json`;
        const res = await fetchWithTimeout(url, {}, 12000);
        if (!res.ok) return;

        const data = (await res.json()) as {
          feed?: { entry?: ItunesRssEntry[] };
        };
        const entries = data.feed?.entry ?? [];
        addScannedCountFromExternal(entries.length);

        entries.forEach((entry, idx) => {
          const rank = idx + 1;
          const appName = entry["im:name"]?.label?.trim() ?? "";
          const artist = entry["im:artist"]?.label?.trim() ?? "";
          const rawSummary = entry.summary?.label ?? "";
          const rawLink = entry.id?.label?.split("?")[0] ?? "";
          const bundleId =
            entry.id?.attributes?.["im:bundleId"] ??
            entry.id?.attributes?.["im:id"] ??
            rawLink;
          const releaseStr = entry["im:releaseDate"]?.label ?? "";

          if (!appName || !rawLink || !isSafeHttpsUrl(rawLink)) return;
          if (excludeUrls?.has(rawLink)) return;

          if (
            BIG_TECH_PUBLISHER_PATTERN.test(artist) ||
            BIG_TECH_APP_TITLE_PATTERN.test(appName) ||
            HARDWARE_COMPANION_PATTERN.test(`${appName} ${rawSummary.slice(0, 400)}`)
          ) {
            return;
          }

          const releaseTs = releaseStr ? Date.parse(releaseStr) : NaN;
          const ageMonths = Number.isFinite(releaseTs)
            ? Math.max(0, (Date.now() - releaseTs) / (30.44 * 86400 * 1000))
            : 36;
          const releaseYear = Number.isFinite(releaseTs)
            ? new Date(releaseTs).getUTCFullYear()
            : null;

          let freshnessBonus = 0;
          if (ageMonths <= 15) freshnessBonus = 55;
          else if (ageMonths <= 28) freshnessBonus = 32;
          else if (ageMonths <= 42) freshnessBonus = 12;
          else if (ageMonths > 66) freshnessBonus = -20;

          const hasSubscriptionCue =
            /weekly|annual|lifetime|subscription|free trial|ai\b|gpt|scanner|voice|note|habit|widget|cleaner|pdf|translator|文字起こし|AI|サブスク|月額|年額|無料トライアル/i.test(
              `${appName} ${rawSummary}`
            );

          const rankBonus = Math.max(0, 55 - rank);
          const totalScore =
            freshnessBonus + rankBonus + (hasSubscriptionCue ? 14 : 0);

          const cleanedSummary = cleanText(rawSummary).slice(0, 500);
          const yearTag =
            releaseYear && releaseYear >= 2025 ? ` · ${releaseYear}新黑马` : "";

          const candidate = {
            title: `${appName} (${artist})`,
            summary: `[${chart.sublabel} #${rank}${
              releaseYear ? `, 上架年份: ${releaseYear}` : ""
            }] 开发者: ${artist} | 功能与内购描述: ${cleanedSummary}`,
            url: rawLink,
            sourcePlatform: "appstore" as const,
            sourceSublabel: `${chart.sublabel} #${rank}`,
            rawMetric: `${chart.sublabel} #${rank}${yearTag}`,
            publishedAt: new Date().toISOString(),
            score: totalScore,
            bundleId,
          };

          if (chart.country === "us") {
            usCandidates.push(candidate);
          } else {
            jpCandidates.push(candidate);
          }
        });
      } catch (err) {
        console.warn(`[Collector] AppStore ${chart.sublabel} skipped:`, err);
      }
    })
  );

  usCandidates.sort((a, b) => b.score - a.score);
  jpCandidates.sort((a, b) => b.score - a.score);

  // 美区选 Top 5 + 日区选 Top 5（按 bundleId 跨区防重，并控制单一细分类别上限以保证多样性）
  const selected: RawFetchedItem[] = [];
  const usedBundles = new Set<string>();
  let qrPickedCount = 0;
  let cleanerPickedCount = 0;
  let vpnPickedCount = 0;

  const tryPick = (item: (typeof usCandidates)[number]) => {
    if (usedBundles.has(item.bundleId)) return false;
    const isQrApp = /\bqr\b|barcode|バーコード/i.test(item.title);
    const isCleaner = /\bclean|cleaner|storage|クリーナー/i.test(item.title);
    const isVpn = /\bvpn\b|proxy|adblock|広告ブロック/i.test(item.title);

    if (isQrApp && qrPickedCount >= 1) return false;
    if (isCleaner && cleanerPickedCount >= 2) return false;
    if (isVpn && vpnPickedCount >= 2) return false;

    if (isQrApp) qrPickedCount++;
    if (isCleaner) cleanerPickedCount++;
    if (isVpn) vpnPickedCount++;

    usedBundles.add(item.bundleId);
    const { score: _s, bundleId: _b, ...cleanItem } = item;
    selected.push(cleanItem);
    return true;
  };

  const usQuota = Math.ceil(limit / 2);
  for (const item of usCandidates) {
    if (selected.length >= usQuota) break;
    tryPick(item);
  }

  for (const item of jpCandidates) {
    if (selected.length >= limit) break;
    tryPick(item);
  }

  for (const item of usCandidates) {
    if (selected.length >= limit) break;
    tryPick(item);
  }

  return selected;
}

// ============================================================================
// 3. GitHub 双轨独立配额：多语言 Trending 每日飙升榜 (10 条) + 近 7 日新锐 AI 开源黑马 (4 条)
// ============================================================================
const GH_TRENDING_LANGUAGES = ["", "typescript", "python", "rust", "go"] as const;

let ghTrendingMinDelayMs = 800;
let ghTrendingMaxDelayMs = 1200;

export function setExtraSourcesTimingForTests(
  overrides: {
    ghTrendingMinDelayMs?: number;
    ghTrendingMaxDelayMs?: number;
  } | null
): void {
  ghTrendingMinDelayMs = overrides?.ghTrendingMinDelayMs ?? 800;
  ghTrendingMaxDelayMs = overrides?.ghTrendingMaxDelayMs ?? 1200;
}

function sleepPoliteTrendingInterval(): Promise<void> {
  const span = Math.max(0, ghTrendingMaxDelayMs - ghTrendingMinDelayMs);
  const ms =
    ghTrendingMinDelayMs +
    (span > 0 ? Math.floor(Math.random() * (span + 1)) : 0);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGitHubTrendingUrl(lang: string): string {
  return lang
    ? `https://github.com/trending/${encodeURIComponent(lang)}?since=daily`
    : "https://github.com/trending?since=daily";
}

const GH_NOISE_PATTERN =
  /\b(gta|recompilation|cheat|hack|crack|leak|pirate|awesome-|interview|leetcode|roadmap|tutorial|course|curriculum|book|textbook|wallpaper|dotfiles|font|emulator|minecraft|roblox|pokemon|free-api|reverse-engineer)\b/i;

const GH_COMMERCIAL_AI_PATTERN =
  /\b(ai|agent|agents|llm|mcp|rag|voice|speech|tts|ocr|video|browser|scraper|crawl|workflow|automation|saas|crm|erp|billing|analytics|dashboard|editor|canvas|slides|pdf|markdown|email|seo|support|chat|copilot|sandbox|memory|eval|gateway|workspace|desktop|studio|sdk|platform|assistant)\b/i;

interface TrendingCandidateEntry {
  repoPath: string;
  url: string;
  description: string;
  langLabel: string;
  totalStars: number;
  starsToday: number;
}

export async function fetchGitHubTrending(
  trendingLimit = 10,
  breakoutLimit = 4,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  const excludedLower = new Set(
    Array.from(excludeUrls ?? [], (u) => u.trim().toLowerCase())
  );
  const pickedLowerUrls = new Set<string>();
  const allTrendingStatsByUrl = new Map<
    string,
    { totalStars: number; starsToday: number }
  >();
  const trendingPicked: RawFetchedItem[] = [];
  const breakoutPicked: RawFetchedItem[] = [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  const fetchAllDailyTrendingPages = async (): Promise<string[]> => {
    const pages: string[] = [];
    for (let idx = 0; idx < GH_TRENDING_LANGUAGES.length; idx++) {
      if (idx > 0) {
        await sleepPoliteTrendingInterval();
      }
      const lang = GH_TRENDING_LANGUAGES[idx];
      try {
        const res = await fetchWithTimeout(
          buildGitHubTrendingUrl(lang),
          {},
          12000
        );
        if (res.ok) {
          pages.push(await res.text());
        }
      } catch {
        // 单个语言榜单超时或失败不影响其余语言池
      }
    }
    return pages;
  };

  const [trendingPagesRes, breakoutRes] = await Promise.allSettled([
    fetchAllDailyTrendingPages(),
    fetchWithTimeout(
      `https://api.github.com/search/repositories?q=created:>${sevenDaysAgo}+stars:>60&sort=stars&order=desc&per_page=40`,
      { headers: { Accept: "application/vnd.github+json" } },
      12000
    ),
  ]);

  // 3a. 独立配额池 A：多语言 GitHub Trending 每日飙升榜（按仓库 URL 去重并合并有效双指标）
  if (trendingPagesRes.status === "fulfilled" && trendingPagesRes.value.length > 0) {
    const candidateByLowerUrl = new Map<string, TrendingCandidateEntry>();

    for (const html of trendingPagesRes.value) {
      const articles =
        html.match(/<article class="Box-row"[\s\S]*?<\/article>/g) ?? [];
      addScannedCountFromExternal(articles.length);

      for (const art of articles) {
        const repoPath = art
          .match(/<h2[^>]*>[\s\S]*?<a[^>]+href="\/([^"\/]+\/[^"\/]+)"/)?.[1]
          ?.trim();
        if (!repoPath) continue;
        const repoUrl = `https://github.com/${repoPath}`;
        if (!isSafeHttpsUrl(repoUrl)) continue;
        const lowerUrl = repoUrl.toLowerCase();

        const descRaw =
          art.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ??
          art.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ??
          "";
        const description = cleanText(descRaw);
        const lang =
          cleanText(
            art.match(
              /itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/
            )?.[1] ?? ""
          ) || "Open Source";
        const starsTodayStr =
          art.match(/([\d,]+)\s+stars\s+today/i)?.[1] ?? "0";
        const starsToday = Number(starsTodayStr.replace(/,/g, "")) || 0;
        const totalStarsStr =
          art.match(/href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/)?.[1] ??
          "";
        const totalStars =
          Number(cleanText(totalStarsStr).replace(/,/g, "")) || starsToday;

        const prevStats = allTrendingStatsByUrl.get(lowerUrl);
        allTrendingStatsByUrl.set(lowerUrl, {
          totalStars: Math.max(prevStats?.totalStars ?? 0, totalStars),
          starsToday: Math.max(prevStats?.starsToday ?? 0, starsToday),
        });

        if (excludedLower.has(lowerUrl)) continue;
        const blob = `${repoPath} ${description}`;
        if (GH_NOISE_PATTERN.test(blob)) continue;

        const existing = candidateByLowerUrl.get(lowerUrl);
        if (existing) {
          existing.totalStars = Math.max(existing.totalStars, totalStars);
          existing.starsToday = Math.max(existing.starsToday, starsToday);
          if (!existing.description && description) {
            existing.description = description;
          }
          if (
            existing.langLabel === "Open Source" &&
            lang !== "Open Source"
          ) {
            existing.langLabel = lang;
          }
          continue;
        }

        candidateByLowerUrl.set(lowerUrl, {
          repoPath,
          url: repoUrl,
          description,
          langLabel: lang,
          totalStars,
          starsToday,
        });
      }
    }

    const sortedTrending = Array.from(candidateByLowerUrl.values())
      .sort(
        (a, b) => b.starsToday - a.starsToday || b.totalStars - a.totalStars
      )
      .slice(0, trendingLimit);

    for (const entry of sortedTrending) {
      pickedLowerUrls.add(entry.url.toLowerCase());
      const githubStats: GitHubStats = {
        totalStars: entry.totalStars,
        starsDelta: entry.starsToday,
        deltaKind: "today",
      };
      trendingPicked.push({
        title: entry.description
          ? `${entry.repoPath} — ${entry.description.slice(0, 95)}`
          : entry.repoPath,
        summary: `GitHub Trending Daily (${entry.langLabel}, ★ ${entry.totalStars.toLocaleString("en-US")}, +${entry.starsToday.toLocaleString("en-US")} stars today): ${
          entry.description || entry.repoPath
        }`,
        url: entry.url,
        sourcePlatform: "github",
        sourceSublabel: "GitHub Trending",
        rawMetric: `★ ${formatCompactCount(entry.totalStars)} (+${formatDeltaCount(entry.starsToday)} 今日)`,
        publishedAt: new Date().toISOString(),
        githubStats,
      });
    }
  }

  // 3b. 独立配额池 B：近 7 天新诞生的高星爆发 AI / 工具仓库（专挖超早期可商业化黑马）
  if (breakoutRes.status === "fulfilled" && breakoutRes.value.ok) {
    const json = (await breakoutRes.value.json()) as {
      items?: Array<{
        full_name: string;
        html_url: string;
        description?: string | null;
        stargazers_count?: number;
        language?: string | null;
        homepage?: string | null;
        topics?: string[];
        license?: { spdx_id?: string | null } | null;
        created_at?: string;
      }>;
    };

    const items = json.items ?? [];
    addScannedCountFromExternal(items.length);

    const breakoutCandidates: Array<RawFetchedItem & { rankScore: number }> = [];
    const seenBreakoutLower = new Set<string>();

    for (const repo of items) {
      const repoUrl = repo.html_url;
      if (!repoUrl || !isSafeHttpsUrl(repoUrl)) continue;
      const lowerUrl = repoUrl.toLowerCase();
      if (
        excludedLower.has(lowerUrl) ||
        pickedLowerUrls.has(lowerUrl) ||
        seenBreakoutLower.has(lowerUrl)
      ) {
        continue;
      }

      const desc = (repo.description ?? "").trim();
      if (desc.length < 20) continue;
      const topicsStr = (repo.topics ?? []).join(" ");
      const blob = `${repo.full_name} ${desc} ${topicsStr}`;

      if (GH_NOISE_PATTERN.test(blob)) continue;
      if (!GH_COMMERCIAL_AI_PATTERN.test(blob)) continue;

      const stars = repo.stargazers_count ?? 0;
      const licenseId = repo.license?.spdx_id ?? "";
      const isPermissive = /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC)$/i.test(
        licenseId
      );
      const hasDemoSite = Boolean(
        repo.homepage && repo.homepage.startsWith("http")
      );

      const rankScore =
        stars * 0.85 + (isPermissive ? 35 : 0) + (hasDemoSite ? 20 : 0);

      const trendingMatch = allTrendingStatsByUrl.get(lowerUrl);
      let githubStats: GitHubStats;
      let rawMetric: string;

      if (trendingMatch && trendingMatch.starsToday > 0) {
        const mergedTotal = Math.max(stars, trendingMatch.totalStars);
        githubStats = {
          totalStars: mergedTotal,
          starsDelta: trendingMatch.starsToday,
          deltaKind: "today",
        };
        rawMetric = `★ ${formatCompactCount(mergedTotal)} (+${formatDeltaCount(trendingMatch.starsToday)} 今日)`;
      } else {
        const createdTs = repo.created_at ? Date.parse(repo.created_at) : NaN;
        const ageDays = Number.isFinite(createdTs)
          ? Math.max(1, (Date.now() - createdTs) / (86400 * 1000))
          : 7;
        const starsPerDay = Math.max(1, Math.round(stars / ageDays));
        githubStats = {
          totalStars: stars,
          starsDelta: starsPerDay,
          deltaKind: "per_day",
        };
        rawMetric = `★ ${formatCompactCount(stars)} (+${formatDeltaCount(starsPerDay)}/日)`;
      }

      seenBreakoutLower.add(lowerUrl);
      breakoutCandidates.push({
        title: `${repo.full_name} — ${desc.slice(0, 95)}`,
        summary: `7-Day Breakout Open-Source Repo (${
          repo.language ?? "AI"
        }, ★ ${stars}, License: ${licenseId || "Custom"}${
          hasDemoSite ? `, Website: ${repo.homepage}` : ""
        }): ${desc}`,
        url: repoUrl,
        sourcePlatform: "github",
        sourceSublabel: "GitHub 7日新锐",
        rawMetric,
        publishedAt: repo.created_at || new Date().toISOString(),
        githubStats,
        rankScore,
      });
    }

    breakoutCandidates
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, breakoutLimit)
      .forEach(({ rankScore: _r, ...item }) => breakoutPicked.push(item));
  }

  return [...trendingPicked, ...breakoutPicked];
}

function formatCompactCount(n: number): string {
  const safe = Math.max(0, Math.round(n));
  if (safe >= 1000) return `${(safe / 1000).toFixed(1)}k`;
  return String(safe);
}

function formatDeltaCount(n: number): string {
  const safe = Math.max(0, Math.round(n));
  if (safe >= 10_000) return `${(safe / 1000).toFixed(1)}k`;
  return safe.toLocaleString("en-US");
}
