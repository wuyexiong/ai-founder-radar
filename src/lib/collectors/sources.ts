import { isIP } from "node:net";
import type { SourcePlatform } from "@/types/signal";

export interface RawFetchedItem {
  title: string;
  summary: string;
  url: string;
  sourcePlatform: SourcePlatform;
  sourceSublabel: string;
  rawMetric: string;
  publishedAt: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let scannedRawCandidates = 0;

export function resetScannedCandidatesCount(): void {
  scannedRawCandidates = 0;
}

export function getScannedCandidatesCount(): number {
  return scannedRawCandidates;
}

export function addScannedCountFromExternal(n: number): void {
  if (n > 0) scannedRawCandidates += n;
}

function addScannedCount(n: number): void {
  if (n > 0) scannedRawCandidates += n;
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

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateOrReservedIpv4Octets(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, "").toLowerCase();

  // WHATWG URL 会将 ::ffff:127.0.0.1 规范化为十六进制 ::ffff:7f00:1
  const mappedHexMatch = normalized.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i
  );
  if (mappedHexMatch) {
    const hi = Number.parseInt(mappedHexMatch[1], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    return isPrivateOrReservedIpv4Octets(a, b);
  }

  const mappedDottedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const candidate = mappedDottedMatch ? mappedDottedMatch[1] : normalized;

  const version = isIP(candidate);
  if (version === 4) {
    const [a, b] = candidate.split(".").map(Number);
    return isPrivateOrReservedIpv4Octets(a, b);
  }

  if (version === 6) {
    if (candidate === "::" || candidate === "::1") return true;
    if (candidate.startsWith("::ffff:")) return true;
    if (/^f[cd]/i.test(candidate)) return true; // fc00::/7 Unique Local
    if (/^fe[89ab]/i.test(candidate)) return true; // fe80::/10 Link-Local
    if (/^ff/i.test(candidate)) return true; // Multicast
    return false;
  }

  return false;
}

export function isSafePublicHttpUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    const host = parsed.hostname
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "")
      .toLowerCase();
    if (!host) return false;
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "metadata.google.internal" ||
      host === "metadata"
    ) {
      return false;
    }
    if (isPrivateOrReservedIp(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function readHtmlSnippetLimited(
  res: Response,
  maxBytes = 48_000
): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let totalBytes = 0;
  let html = "";

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - totalBytes;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      totalBytes += chunk.byteLength;
      html += decoder.decode(chunk, { stream: totalBytes < maxBytes });
      if (/<\s*\/\s*head\s*>/i.test(html)) {
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return html;
}

async function fetchPageMetaSnippet(
  url: string,
  timeoutMs = 3500
): Promise<{ title?: string; description?: string }> {
  try {
    let currentUrl = url;
    let res: Response | null = null;

    // 手动校验最多 3 跳重定向目标，防止 302 跳转至 127.0.0.1 / 169.254.169.254 触发 SSRF
    for (let hop = 0; hop <= 3; hop++) {
      if (!isSafePublicHttpUrl(currentUrl)) return {};
      res = await fetchWithTimeout(
        currentUrl,
        {
          headers: { Accept: "text/html,application/xhtml+xml" },
          redirect: "manual",
        },
        timeoutMs
      );

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => undefined);
        if (!location || hop === 3) return {};
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      break;
    }

    if (!res || !res.ok) return {};
    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      await res.body?.cancel().catch(() => undefined);
      return {};
    }

    const html = await readHtmlSnippetLimited(res, 48_000);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch =
      html.match(
        /<meta[^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]+content=["']([^"']+)["']/i
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["']/i
      );

    return {
      title: titleMatch ? decodeXmlEntities(titleMatch[1]) : undefined,
      description: descMatch ? decodeXmlEntities(descMatch[1]) : undefined,
    };
  } catch {
    return {};
  }
}

// ============================================================================
// 1. Show HN（深化去噪：热度增速筛选 + 剔除纯玩具 Demo + 补全作者首评/落地页摘要）
// ============================================================================
const HN_TOY_PATTERN =
  /\b(game|gaming|arcade|racing|chess|wordle|puzzle|retro|80s|ps1|gameboy|emulator|nes|shader|raytracer|fractal|compiler|kernel|without a runtime|proof|riemann|lean4|coq|ascii|quine|dotfiles|advent of code|font|synthesizer|drum machine)\b/i;

const HN_HARD_MONETIZATION_OVERRIDE =
  /\b(saas|pricing|stripe|customer|b2b|mrr|arr|revenue|invoice|billing|crm)\b/i;

const HN_COMMERCIAL_PATTERN =
  /\b(saas|pricing|stripe|customer|b2b|api|sdk|cli|agent|workflow|automation|analytics|crm|monitor|deploy|postgres|database|scraping|email|marketing|seo|invoice|billing|pdf|editor|studio|workspace|mac|ios|chrome extension|copilot|assistant|webhook|auth)\b/i;

export async function fetchHackerNewsShowHN(
  limit = 4,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  try {
    const sinceSec = Math.floor(Date.now() / 1000) - 48 * 3600;
    const algoliaUrl = `https://hn.algolia.com/api/v1/search?tags=show_hn&numericFilters=created_at_i>${sinceSec},points>=5&hitsPerPage=30`;
    const res = await fetchWithTimeout(algoliaUrl, {}, 10000);

    if (res.ok) {
      const data = (await res.json()) as {
        hits?: Array<{
          objectID: string;
          author?: string;
          title: string;
          story_text?: string;
          url?: string;
          points?: number;
          num_comments?: number;
          children?: number[];
          created_at?: string;
          created_at_i?: number;
        }>;
      };

      const rawHits = data.hits ?? [];
      addScannedCount(rawHits.length);

      const scored = rawHits
        .filter((h) => {
          if (!h.title) return false;
          const targetUrl = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
          if (!isSafePublicHttpUrl(targetUrl)) return false;
          if (excludeUrls?.has(targetUrl)) return false;

          const textBlob = `${h.title} ${h.story_text ?? ""} ${h.url ?? ""}`;
          const isToy = HN_TOY_PATTERN.test(textBlob);
          if (isToy && !HN_HARD_MONETIZATION_OVERRIDE.test(textBlob)) return false;
          return true;
        })
        .map((h) => {
          const textBlob = `${h.title} ${h.story_text ?? ""} ${h.url ?? ""}`;
          const commercialMatches = textBlob.match(new RegExp(HN_COMMERCIAL_PATTERN.source, "gi"))?.length ?? 0;
          const isCustomDomain =
            Boolean(h.url) &&
            !/github\.com|gitlab\.com|gist\.github|youtube\.com|arxiv\.org/i.test(h.url!);
          const ageHours = Math.max(
            2,
            (Date.now() / 1000 - (h.created_at_i ?? sinceSec)) / 3600
          );
          const pts = h.points ?? 0;
          const cmts = h.num_comments ?? 0;
          const velocity = (pts + cmts * 1.4) / Math.pow(ageHours, 0.55);
          const rankScore =
            velocity * 4 + commercialMatches * 10 + (isCustomDomain ? 12 : 0);

          return { hit: h, rankScore };
        })
        .sort((a, b) => b.rankScore - a.rankScore)
        .slice(0, limit);

      const enriched = await Promise.all(
        scored.map(async ({ hit }) => {
          const targetUrl =
            hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
          let bodyText = hit.story_text ? decodeXmlEntities(hit.story_text) : "";

          // 若外链帖缺少正文，自动并发提取作者首评自述 + 产品官网 meta description
          if (bodyText.length < 80) {
            const topCommentIds = (hit.children ?? []).slice(0, 3);
            const [commentTexts, pageMeta] = await Promise.all([
              Promise.all(
                topCommentIds.map(async (cid) => {
                  try {
                    const cRes = await fetchWithTimeout(
                      `https://hacker-news.firebaseio.com/v0/item/${cid}.json`,
                      {},
                      2500
                    );
                    if (!cRes.ok) return "";
                    const cJson = (await cRes.json()) as {
                      by?: string;
                      text?: string;
                    };
                    if (cJson?.text && (!hit.author || cJson.by === hit.author)) {
                      return decodeXmlEntities(cJson.text);
                    }
                    return "";
                  } catch {
                    return "";
                  }
                })
              ),
              hit.url
                ? fetchPageMetaSnippet(hit.url, 3000)
                : Promise.resolve<{ title?: string; description?: string }>({}),
            ]);

            const authorPitch = commentTexts.find((t) => t.length > 30) ?? "";
            const metaDesc = pageMeta.description ?? "";
            bodyText = [metaDesc, authorPitch, bodyText]
              .filter(Boolean)
              .join(" | ")
              .trim();
          }

          return {
            title: hit.title,
            summary: (bodyText || hit.title).slice(0, 520),
            url: targetUrl,
            sourcePlatform: "hackernews" as const,
            sourceSublabel: "Show HN",
            rawMetric: `▲ ${hit.points ?? 0} HN · 💬 ${hit.num_comments ?? 0}`,
            publishedAt: hit.created_at || new Date().toISOString(),
          };
        })
      );

      if (enriched.length > 0) return enriched;
    }

    // 兜底：Firebase 官方 Show HN 接口
    const idsRes = await fetchWithTimeout(
      "https://hacker-news.firebaseio.com/v0/showstories.json",
      {},
      8000
    );
    if (!idsRes.ok) return [];
    const ids = (await idsRes.json()) as number[];
    addScannedCount(Math.min(ids.length, 20));

    const stories = await Promise.all(
      ids.slice(0, 16).map(async (id) => {
        const sRes = await fetchWithTimeout(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          {},
          4000
        );
        if (!sRes.ok) return null;
        return (await sRes.json()) as {
          id: number;
          title?: string;
          text?: string;
          url?: string;
          score?: number;
          descendants?: number;
          time?: number;
        };
      })
    );

    return stories
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !s.title || (s.score ?? 0) < 3) return false;
        const url = s.url || `https://news.ycombinator.com/item?id=${s.id}`;
        if (!isSafePublicHttpUrl(url)) return false;
        if (excludeUrls?.has(url)) return false;
        return !HN_TOY_PATTERN.test(s.title) || HN_COMMERCIAL_PATTERN.test(s.title);
      })
      .slice(0, limit)
      .map((s) => ({
        title: s.title!,
        summary: s.text ? decodeXmlEntities(s.text).slice(0, 450) : s.title!,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        sourcePlatform: "hackernews" as const,
        sourceSublabel: "Show HN",
        rawMetric: `▲ ${s.score ?? 0} HN · 💬 ${s.descendants ?? 0}`,
        publishedAt: s.time
          ? new Date(s.time * 1000).toISOString()
          : new Date().toISOString(),
      }));
  } catch (err) {
    console.warn("[Collector] Hacker News Show HN skipped:", err);
    return [];
  }
}

// ============================================================================
// 2. Product Hunt 每日新品流
// ============================================================================
export async function fetchProductHuntFeed(
  limit = 4,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  try {
    const res = await fetchWithTimeout("https://www.producthunt.com/feed", {}, 10000);
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    addScannedCount(entries.length);

    const parsed: RawFetchedItem[] = [];
    for (let idx = 0; idx < entries.length && parsed.length < limit; idx++) {
      const entry = entries[idx];
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
      const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
      const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
      const url = linkMatch ? linkMatch[1].trim() : "";
      if (!url || !isSafePublicHttpUrl(url) || excludeUrls?.has(url)) continue;

      parsed.push({
        title: titleMatch ? decodeXmlEntities(titleMatch[1]) : "Product Hunt Launch",
        summary: contentMatch ? decodeXmlEntities(contentMatch[1]).slice(0, 450) : "",
        url,
        sourcePlatform: "producthunt" as const,
        sourceSublabel: `PH Top #${idx + 1}`,
        rawMetric: `PH 今日推荐 #${idx + 1}`,
        publishedAt: publishedMatch
          ? new Date(publishedMatch[1].trim()).toISOString()
          : new Date().toISOString(),
      });
    }
    return parsed;
  } catch (err) {
    console.warn("[Collector] Product Hunt fetch skipped:", err);
    return [];
  }
}

// ============================================================================
// 3. Indie Hackers（社区营收实战热帖 + Build Board Stripe 验证新品榜）
// ============================================================================
export async function fetchIndieHackers(
  limit = 3,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  try {
    const [homeRes, productsRes] = await Promise.allSettled([
      fetchWithTimeout(
        "https://r.jina.ai/https://www.indiehackers.com/",
        { headers: { "X-Return-Format": "markdown" } },
        14000
      ),
      fetchWithTimeout(
        "https://r.jina.ai/https://www.indiehackers.com/products?revenueVerification=stripe&sorting=newest-first",
        { headers: { "X-Return-Format": "markdown" } },
        14000
      ),
    ]);

    const candidates: Array<RawFetchedItem & { rank: number; needBodyFetch?: boolean }> = [];

    // 3a. 解析首页顶部实时社区热帖与 Featured 当日快讯（截断底部常青分类归档区）
    if (homeRes.status === "fulfilled" && homeRes.value.ok) {
      const md = await homeRes.value.text();
      // 仅取首页前 18 个实时流条目，避开页面底部数月前的 /post/tech 等静态归档块
      const postBlocks = md.split(/^###\s+/m).slice(1, 19);
      addScannedCount(postBlocks.length);

      for (const block of postBlocks) {
        const headerMatch = block.match(
          /^\[([^\]]+)\]\((https:\/\/www\.indiehackers\.com\/(?:post|product)\/[^\s\)]+)\)/
        );
        if (!headerMatch) continue;
        const rawTitle = headerMatch[1].trim();
        const rawUrl = headerMatch[2].split("#")[0];
        if (excludeUrls?.has(rawUrl)) continue;
        // 跳过旧版静态专栏路径
        if (/\/post\/(tech|lifestyle|creators|ai)\//i.test(rawUrl)) continue;

        const upvotes = Number(block.match(/\[(\d+)\s+upvotes?\]/i)?.[1] ?? "0");
        const comments = Number(block.match(/\[(\d+)\s+comments?\]/i)?.[1] ?? "0");
        const hasMoneySignal =
          /\$\d|mrr|arr|revenue|customers?|paying|launch|pricing|saas|profit/i.test(rawTitle);

        const isNumbersNews = rawUrl.includes("/post/numbers/") || rawUrl.includes("/post/takes/");
        const rank =
          upvotes * 2 +
          comments * 0.8 +
          (hasMoneySignal ? 25 : 0) +
          (isNumbersNews ? 12 : 0);

        candidates.push({
          title: rawTitle,
          summary: rawTitle,
          url: rawUrl,
          sourcePlatform: "indiehackers",
          sourceSublabel: isNumbersNews ? "IH 营收快讯" : "IH 实战热帖",
          rawMetric:
            comments > 0
              ? `▲ ${upvotes} · 💬 ${comments} IH`
              : `▲ ${upvotes} IH 热度`,
          publishedAt: new Date().toISOString(),
          rank,
          needBodyFetch: true,
        });
      }
    }

    // 3b. 解析 The Build Board 新品与里程碑更新
    if (productsRes.status === "fulfilled" && productsRes.value.ok) {
      const md = await productsRes.value.text();
      const lineRegex =
        /\[\]\((https:\/\/www\.indiehackers\.com\/product\/[^\s\)]+)\)\d+\s+!\[[^\]]*\]\([^\)]+\)\*\*([^*]+)\*\*(?:\[\]\((https?:\/\/[^\s\)]+)[^\)]*\))?([^\n]+?)\[(\d+)\]\([^\)]*"Upvote"\)/g;
      const matches = [...md.matchAll(lineRegex)];
      addScannedCount(matches.length);

      for (const m of matches) {
        const productUrl = m[1].split("#")[0];
        if (excludeUrls?.has(productUrl)) continue;
        const productName = m[2].trim();
        const blurb = m[4].replace(/\s+/g, " ").trim();
        const upvotes = Number(m[5] ?? "0");
        const revenueMatch = blurb.match(
          /(\$\s?[\d,.]+[kKmM]?|\d+\s?k\s?€|\d+\+?\s+paying customers)/i
        );

        candidates.push({
          title: `${productName}: ${blurb.slice(0, 95)}`,
          summary: `${productName} — ${blurb}`.slice(0, 480),
          url: productUrl,
          sourcePlatform: "indiehackers",
          sourceSublabel: "IH Build Board",
          rawMetric: revenueMatch
            ? `${revenueMatch[1]} · ▲ ${upvotes}`
            : `IH 新品榜 · ▲ ${upvotes}`,
          publishedAt: new Date().toISOString(),
          rank: upvotes * 3 + (revenueMatch ? 35 : 10),
          needBodyFetch: false,
        });
      }
    }

    const picked = candidates.sort((a, b) => b.rank - a.rank).slice(0, limit + 3);
    const freshPicked: typeof picked = [];
    const maxAgeMs = 7 * 24 * 3600 * 1000; // 严格锁定最近 7 天内的新帖

    // 为选中的社区热帖抓取首段正文，并双重校验 Header 与正文日期，严防旧帖混入
    await Promise.all(
      picked.map(async (item) => {
        if (!item.needBodyFetch) {
          freshPicked.push(item);
          return;
        }
        try {
          const detailRes = await fetchWithTimeout(
            `https://r.jina.ai/${item.url}`,
            { headers: { "X-Return-Format": "markdown" } },
            6500
          );
          if (!detailRes.ok) return;
          const detailMd = await detailRes.text();

          const headerDateStr = detailMd.match(/^Published Time:\s*(.+)$/m)?.[1]?.trim();
          const bodyDateStr = detailMd.match(
            /\[((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})\]/i
          )?.[1];
          const dateCandidate = headerDateStr || bodyDateStr;

          if (dateCandidate) {
            const pubTs = Date.parse(dateCandidate);
            if (Number.isFinite(pubTs)) {
              if (Date.now() - pubTs > maxAgeMs) {
                return; // 丢弃超过 7 天的旧帖
              }
              item.publishedAt = new Date(pubTs).toISOString();
            }
          }

          const contentIdx = detailMd.indexOf("Markdown Content:");
          if (contentIdx !== -1) {
            const bodyClean = detailMd
              .slice(contentIdx + 17)
              .replace(/!\[[^\]]*\]\([^\)]+\)/g, "")
              .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
              .replace(/[#>*_`]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (bodyClean.length > 80) {
              item.summary = bodyClean.slice(0, 520);
            }
          }
          freshPicked.push(item);
        } catch {
          freshPicked.push(item);
        }
      })
    );

    return freshPicked
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit)
      .map(({ rank: _r, needBodyFetch: _n, ...rest }) => rest);
  } catch (err) {
    console.warn("[Collector] Indie Hackers fetch skipped:", err);
    return [];
  }
}

// ============================================================================
// 4. Acquire.com（最新待售盈利 SaaS / AI / App 挂牌：真实 ARR、TTM 营收与利润）
// ============================================================================
const ACQUIRE_TECH_SLUG =
  /(saas|ai|app|plugin|shopify|wordpress|chrome|extension|software|platform|micro|api|tool|automation|analytics|crm|portal|studio|directory)/i;
const ACQUIRE_EXCLUDE_SLUG =
  /(hemp|cannabis|realtors-doing|trucking|cleaning-company|landscaping)/i;

export async function fetchAcquireListings(
  limit = 3,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  try {
    const sitemapRes = await fetchWithTimeout(
      "https://app.acquire.com/sitemap.xml",
      {},
      10000
    );

    if (sitemapRes.ok) {
      const xml = await sitemapRes.text();
      const urlBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)];
      addScannedCount(urlBlocks.length);

      const listings = urlBlocks
        .map((m) => {
          const block = m[1];
          const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? "";
          const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? "";
          return { loc, lastmod, ts: lastmod ? Date.parse(lastmod) : 0 };
        })
        .filter((item) => {
          if (!item.loc.includes("/public/")) return false;
          if (excludeUrls?.has(item.loc)) return false;
          if (ACQUIRE_EXCLUDE_SLUG.test(item.loc)) return false;
          return ACQUIRE_TECH_SLUG.test(item.loc);
        })
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit);

      const detailed = await Promise.all(
        listings.map(async (entry): Promise<RawFetchedItem | null> => {
          try {
            const jinaRes = await fetchWithTimeout(
              `https://r.jina.ai/${entry.loc}`,
              { headers: { "X-Return-Format": "markdown" } },
              12000
            );
            if (jinaRes.ok) {
              const md = await jinaRes.text();
              const titleLine =
                md
                  .match(/^Title:\s*(.+)$/m)?.[1]
                  ?.replace(/\s*\|\s*Acquire\.com.*$/i, "")
                  .trim() ?? "";

              const ttmRev = md.match(
                /TTM revenue[\s\S]{0,80}?(\$[\d,.]+[kKmMbB]?)/i
              )?.[1];
              const ttmProfit = md.match(
                /TTM profit[\s\S]{0,80}?(\$[\d,.]+[kKmMbB]?)/i
              )?.[1];
              const arr = md.match(
                /\bARR\b[\s\S]{0,120}?(\$[\d,.]+[kKmMbB]?)/i
              )?.[1];
              const lastMonthRev = md.match(
                /Last months? revenue[\s\S]{0,80}?(\$[\d,.]+[kKmMbB]?)/i
              )?.[1];

              const contentIdx = md.indexOf("Markdown Content:");
              const cleanBody =
                contentIdx !== -1
                  ? md
                      .slice(contentIdx + 17)
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 520)
                  : md.replace(/\s+/g, " ").slice(0, 520);

              const badgeParts: string[] = [];
              if (arr && arr !== "$0") badgeParts.push(`ARR ${arr}`);
              else if (ttmRev) badgeParts.push(`年收 ${ttmRev}`);
              if (ttmProfit && ttmProfit !== "$0") badgeParts.push(`净利 ${ttmProfit}`);
              else if (lastMonthRev && lastMonthRev !== "$0")
                badgeParts.push(`月收 ${lastMonthRev}`);

              const slugFallbackTitle = entry.loc
                .split("/public/")[1]
                ?.replace(/^[a-z0-9]+-/, "")
                .replace(/-/g, " ");

              return {
                title: titleLine || slugFallbackTitle || "Acquire Vetted SaaS Listing",
                summary: cleanBody,
                url: entry.loc,
                sourcePlatform: "acquire",
                sourceSublabel: "Acquire 待售挂牌",
                rawMetric:
                  badgeParts.length > 0
                    ? badgeParts.join(" · ")
                    : "Acquire 盈利挂牌",
                publishedAt: entry.lastmod || new Date().toISOString(),
              };
            }
          } catch {
            // 回退直连 meta 提取
          }

          const meta = await fetchPageMetaSnippet(entry.loc, 4000);
          if (!meta.title && !meta.description) return null;
          return {
            title: (meta.title ?? "Acquire Startup Listing")
              .replace(/\s*\|\s*Acquire\.com.*$/i, "")
              .trim(),
            summary: (meta.description ?? meta.title ?? "").slice(0, 480),
            url: entry.loc,
            sourcePlatform: "acquire",
            sourceSublabel: "Acquire 待售挂牌",
            rawMetric: "Acquire 挂牌项目",
            publishedAt: entry.lastmod || new Date().toISOString(),
          };
        })
      );

      const validItems = detailed.filter((x): x is RawFetchedItem => Boolean(x));
      if (validItems.length > 0) return validItems;
    }

    // 二级兜底：Acquire SaaS 公开精选列表页
    const fallbackRes = await fetchWithTimeout(
      "https://r.jina.ai/https://acquire.com/saas-companies-for-sale/",
      { headers: { "X-Return-Format": "markdown" } },
      12000
    );
    if (!fallbackRes.ok) return [];
    const md = await fallbackRes.text();
    const itemRegex =
      /\*\s+\[([^\]]+?Asking price\s*\$[\d,.]+[kKmM]?[^\]]*)\]\((https:\/\/app\.acquire\.com\/startup\/[^\s\)\?]+)[^\)]*\)/gi;
    const matches = [...md.matchAll(itemRegex)];
    addScannedCount(matches.length);

    const results: RawFetchedItem[] = [];
    for (const m of matches) {
      if (results.length >= limit) break;
      const url = m[2].trim();
      if (excludeUrls?.has(url)) continue;
      const text = m[1].replace(/\s+/g, " ").trim();
      const askMatch = text.match(/Asking price\s*(\$[\d,.]+[kKmM]?(?:\s*\([^)]+\))?)/i);
      results.push({
        title: text.replace(/Asking price.*$/i, "").trim(),
        summary: text,
        url,
        sourcePlatform: "acquire",
        sourceSublabel: "Acquire SaaS 精选",
        rawMetric: askMatch ? `叫价 ${askMatch[1]}` : "Acquire 在售 SaaS",
        publishedAt: new Date().toISOString(),
      });
    }
    return results;
  } catch (err) {
    console.warn("[Collector] Acquire.com fetch skipped:", err);
    return [];
  }
}

// ============================================================================
// 6. Reddit（优先可选官方 Script OAuth -> 默认免认证 Arctic Shift 实时镜像 -> HN 痛点兜底）
// ============================================================================
const REDDIT_JUNK_PATTERN =
  /press a button and money|upvote if you|dm me for free|join my discord|whatsapp group/i;

export async function fetchRedditSubreddits(
  subreddits = ["SaaS", "microsaas", "SomebodyMakeThis"],
  perSub = 2,
  excludeUrls?: Set<string>
): Promise<RawFetchedItem[]> {
  const results: RawFetchedItem[] = [];

  // 轨道 1：若用户配置了免费 Reddit Script OAuth 凭据，优先走官方 oauth.reddit.com
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetchWithTimeout(
        "https://www.reddit.com/api/v1/access_token",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "nodejs:com.indieradar.collector:v0.2",
          },
          body: "grant_type=client_credentials",
        },
        8000
      );
      if (tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { access_token?: string };
        if (tokenData.access_token) {
          for (const sub of subreddits) {
            const subRes = await fetchWithTimeout(
              `https://oauth.reddit.com/r/${sub}/top?t=day&limit=${perSub * 3}`,
              {
                headers: {
                  Authorization: `Bearer ${tokenData.access_token}`,
                  "User-Agent": "nodejs:com.indieradar.collector:v0.2",
                },
              },
              8000
            );
            if (!subRes.ok) continue;
            const listing = (await subRes.json()) as {
              data?: {
                children?: Array<{
                  data: {
                    title: string;
                    selftext?: string;
                    permalink: string;
                    ups?: number;
                    num_comments?: number;
                    created_utc?: number;
                  };
                }>;
              };
            };
            const children = listing.data?.children ?? [];
            addScannedCount(children.length);
            for (const c of children) {
              const d = c.data;
              const url = `https://www.reddit.com${d.permalink}`;
              if (excludeUrls?.has(url)) continue;
              results.push({
                title: d.title,
                summary: (d.selftext ? decodeXmlEntities(d.selftext) : d.title).slice(0, 500),
                url,
                sourcePlatform: "reddit",
                sourceSublabel: `r/${sub}`,
                rawMetric: `▲ ${d.ups ?? 0} · 💬 ${d.num_comments ?? 0}`,
                publishedAt: d.created_utc
                  ? new Date(d.created_utc * 1000).toISOString()
                  : new Date().toISOString(),
              });
              if (results.filter((r) => r.sourceSublabel === `r/${sub}`).length >= perSub) break;
            }
          }
          if (results.length > 0) return results;
        }
      }
    } catch (err) {
      console.warn("[Collector] Reddit OAuth failed, switching to Arctic Shift:", err);
    }
  }

  // 轨道 2（默认主力）：免 Key 零配置 Arctic Shift 镜像 API（代理与 GitHub Actions 机房 IP 均 200 OK）
  const afterSec = Math.floor(Date.now() / 1000) - 48 * 3600;
  await Promise.all(
    subreddits.map(async (sub) => {
      try {
        const apiUrl = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${encodeURIComponent(
          sub
        )}&after=${afterSec}&limit=60`;
        let res = await fetchWithTimeout(apiUrl, {}, 16000).catch(() => null);
        if (!res || !res.ok) {
          res = await fetchWithTimeout(apiUrl, {}, 16000);
        }
        if (!res.ok) return;

        const payload = (await res.json()) as {
          data?: Array<{
            id: string;
            title?: string;
            selftext?: string;
            permalink?: string;
            url?: string;
            score?: number;
            num_comments?: number;
            created_utc?: number;
            removed_by_category?: string | null;
          }>;
        };

        const rawPosts = payload.data ?? [];
        addScannedCount(rawPosts.length);

        const isPainSub = sub.toLowerCase() === "somebodymakethis";

        const filtered = rawPosts
          .filter((p) => {
            if (!p.title || p.title.includes("[ Removed by Reddit ]")) return false;
            if (p.removed_by_category) return false;
            const body = (p.selftext ?? "").trim();
            if (!body || body === "[removed]" || body === "[deleted]") return false;
            if (body.length < 55 && (p.score ?? 0) < 3) return false;
            if (REDDIT_JUNK_PATTERN.test(`${p.title} ${body}`)) return false;

            const fullUrl = p.permalink
              ? `https://www.reddit.com${p.permalink}`
              : p.url || "";
            if (!fullUrl || !isSafePublicHttpUrl(fullUrl) || excludeUrls?.has(fullUrl)) return false;
            return true;
          })
          .map((p) => {
            const text = `${p.title} ${p.selftext ?? ""}`;
            const signalBoost = isPainSub
              ? /\b(pay|tired of|frustrated|wish|manual|spreadsheet|expensive|alternative|automate|extension|app|software|tool)\b/i.test(
                  text
                )
                ? 12
                : 0
              : /(\$\d|mrr|arr|revenue|paying|customers?|pricing|churn|seo|launched|competitor|stripe)/i.test(
                    text
                  )
                ? 15
                : 0;

            const score = p.score ?? 1;
            const comments = p.num_comments ?? 0;
            return {
              post: p,
              rank: signalBoost + score * 2.5 + comments * 1.2,
            };
          })
          .sort((a, b) => b.rank - a.rank)
          .slice(0, perSub);

        for (const { post } of filtered) {
          const fullUrl = post.permalink
            ? `https://www.reddit.com${post.permalink}`
            : post.url!;
          const score = post.score ?? 1;
          const comments = post.num_comments ?? 0;

          results.push({
            title: decodeXmlEntities(post.title!),
            summary: decodeXmlEntities(post.selftext ?? "").slice(0, 520),
            url: fullUrl,
            sourcePlatform: "reddit",
            sourceSublabel: `r/${sub}`,
            rawMetric: isPainSub
              ? `💬 ${comments} 讨论 · ▲ ${score}`
              : `▲ ${score} · 💬 ${comments}`,
            publishedAt: post.created_utc
              ? new Date(post.created_utc * 1000).toISOString()
              : new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn(`[Collector] Arctic Shift r/${sub} skipped:`, err);
      }
    })
  );

  // 轨道 3：极端情况下双通道均为空，使用 HN Algolia Ask HN / SaaS 痛点帖兜底
  if (results.length === 0) {
    try {
      const algoliaRes = await fetchWithTimeout(
        "https://hn.algolia.com/api/v1/search_by_date?tags=(story,ask_hn)&query=SaaS%20OR%20MRR%20OR%20pricing%20OR%20alternative&hitsPerPage=4",
        {},
        8000
      );
      if (algoliaRes.ok) {
        const data = (await algoliaRes.json()) as {
          hits?: Array<{
            objectID: string;
            title: string;
            story_text?: string;
            url?: string;
            points?: number;
            num_comments?: number;
            created_at?: string;
          }>;
        };
        for (const hit of data.hits ?? []) {
          const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
          if (!isSafePublicHttpUrl(url) || excludeUrls?.has(url)) continue;
          results.push({
            title: hit.title,
            summary: hit.story_text
              ? decodeXmlEntities(hit.story_text).slice(0, 450)
              : hit.title,
            url,
            sourcePlatform: "hackernews",
            sourceSublabel: hit.title.startsWith("Ask HN") ? "Ask HN 痛点" : "HN 创业讨论",
            rawMetric: `▲ ${hit.points ?? 0} · 💬 ${hit.num_comments ?? 0}`,
            publishedAt: hit.created_at || new Date().toISOString(),
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return results;
}
