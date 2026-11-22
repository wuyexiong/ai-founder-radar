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
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) IndieRadarBot/0.1";

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchHackerNewsShowHN(limit = 8): Promise<RawFetchedItem[]> {
  try {
    const idsRes = await fetch(
      "https://hacker-news.firebaseio.com/v0/showstories.json",
      { headers: { "User-Agent": USER_AGENT } }
    );
    if (!idsRes.ok) return [];
    const ids = (await idsRes.json()) as number[];
    const topIds = ids.slice(0, limit);

    const stories = await Promise.all(
      topIds.map(async (id) => {
        const res = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`
        );
        if (!res.ok) return null;
        return (await res.json()) as {
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
      .filter((s): s is NonNullable<typeof s> => Boolean(s && s.title))
      .map((s) => ({
        title: s.title!,
        summary: s.text ? decodeXmlEntities(s.text).slice(0, 400) : s.title!,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        sourcePlatform: "hackernews" as const,
        sourceSublabel: "Show HN",
        rawMetric: `▲ ${s.score ?? 0} HN · ${s.descendants ?? 0} 评论`,
        publishedAt: s.time
          ? new Date(s.time * 1000).toISOString()
          : new Date().toISOString(),
      }));
  } catch (err) {
    console.warn("[Collector] Hacker News fetch skipped:", err);
    return [];
  }
}

export async function fetchProductHuntFeed(limit = 8): Promise<RawFetchedItem[]> {
  try {
    const res = await fetch("https://www.producthunt.com/feed", {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

    return entries.slice(0, limit).map((entry, idx) => {
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
      const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
      const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);

      return {
        title: titleMatch ? decodeXmlEntities(titleMatch[1]) : "Product Hunt Launch",
        summary: contentMatch ? decodeXmlEntities(contentMatch[1]).slice(0, 400) : "",
        url: linkMatch ? linkMatch[1] : "https://www.producthunt.com",
        sourcePlatform: "producthunt" as const,
        sourceSublabel: `PH Top #${idx + 1}`,
        rawMetric: `PH 今日推荐 #${idx + 1}`,
        publishedAt: publishedMatch
          ? new Date(publishedMatch[1].trim()).toISOString()
          : new Date().toISOString(),
      };
    });
  } catch (err) {
    console.warn("[Collector] Product Hunt fetch skipped:", err);
    return [];
  }
}

export async function fetchRedditSubreddits(
  subreddits = ["microsaas", "SaaS", "SomebodyMakeThis"],
  perSub = 3
): Promise<RawFetchedItem[]> {
  const results: RawFetchedItem[] = [];

  for (const sub of subreddits) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/top/.rss?t=day&limit=${perSub}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
            Accept: "application/atom+xml,application/xml,text/xml",
          },
        }
      );
      if (res.ok) {
        const xml = await res.text();
        const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
        for (const entry of entries.slice(0, perSub)) {
          const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
          const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? "";
          const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
          const updated = entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] ?? "";
          if (!title || !link) continue;

          results.push({
            title: decodeXmlEntities(title),
            summary: decodeXmlEntities(content).slice(0, 450),
            url: link,
            sourcePlatform: "reddit",
            sourceSublabel: `r/${sub}`,
            rawMetric: sub === "SomebodyMakeThis" ? "💬 Reddit 痛点热帖" : `r/${sub} 今日热帖`,
            publishedAt: updated ? new Date(updated.trim()).toISOString() : new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn(`[Collector] Reddit RSS r/${sub} skipped:`, err);
    }
  }

  // 若代理 IP 被 Reddit 拦截返回空，自动通过 HN Algolia 免费接口补充 SaaS 营收与 Ask HN 痛点帖
  if (results.length === 0) {
    try {
      const algoliaRes = await fetch(
        "https://hn.algolia.com/api/v1/search_by_date?tags=(story,ask_hn)&query=SaaS%20OR%20MRR%20OR%20pricing%20OR%20alternative&hitsPerPage=5"
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
          results.push({
            title: hit.title,
            summary: hit.story_text
              ? decodeXmlEntities(hit.story_text).slice(0, 450)
              : hit.title,
            url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
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
