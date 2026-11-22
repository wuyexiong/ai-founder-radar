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
  perSub = 4
): Promise<RawFetchedItem[]> {
  const results: RawFetchedItem[] = [];

  for (const sub of subreddits) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/top.json?t=day&limit=${perSub}`,
        { headers: { "User-Agent": USER_AGENT } }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
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

      const posts = json.data?.children ?? [];
      for (const post of posts) {
        const d = post.data;
        results.push({
          title: d.title,
          summary: (d.selftext || d.title).replace(/\s+/g, " ").slice(0, 500),
          url: `https://www.reddit.com${d.permalink}`,
          sourcePlatform: "reddit",
          sourceSublabel: `r/${sub}`,
          rawMetric:
            sub === "SomebodyMakeThis"
              ? `💬 ${d.num_comments ?? 0} 痛点讨论`
              : `▲ ${d.ups ?? 0} · ${d.num_comments ?? 0} 评`,
          publishedAt: d.created_utc
            ? new Date(d.created_utc * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[Collector] Reddit r/${sub} fetch skipped:`, err);
    }
  }

  return results;
}
