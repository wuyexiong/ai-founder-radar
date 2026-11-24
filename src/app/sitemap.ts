import type { MetadataRoute } from "next";
import { getSiteUrl, HREFLANG_MAP, LOCALES } from "@/i18n/config";
import { getAllAvailableDates, getSeoHubIndex } from "@/lib/signals-repo";

export const revalidate = 3600;

function parseSafeLastMod(dateKey: string, fallback: Date): Date {
  const parsed = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const [dates, hubIndex] = await Promise.all([
    getAllAvailableDates(),
    getSeoHubIndex(),
  ]);
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [];

  // 1. 四语种首页入口
  const homeAlternates: Record<string, string> = {};
  for (const loc of LOCALES) {
    homeAlternates[HREFLANG_MAP[loc]] = `${siteUrl}/${loc}`;
  }
  homeAlternates["x-default"] = `${siteUrl}/en`;

  for (const loc of LOCALES) {
    entries.push({
      url: `${siteUrl}/${loc}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: loc === "en" ? 1.0 : 0.95,
      alternates: {
        languages: homeAlternates,
      },
    });
  }

  // 2. 常青赛道专题聚合页（仅收录已有真实信号入库的活跃专题 × 4 语种，杜绝空壳页稀释权重）
  for (const topic of hubIndex.topics) {
    const topicAlternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      topicAlternates[HREFLANG_MAP[loc]] =
        `${siteUrl}/${loc}/topic/${topic.slug}`;
    }
    topicAlternates["x-default"] = `${siteUrl}/en/topic/${topic.slug}`;
    const lastMod = parseSafeLastMod(topic.lastModifiedDate, now);

    for (const loc of LOCALES) {
      entries.push({
        url: `${siteUrl}/${loc}/topic/${topic.slug}`,
        lastModified: lastMod,
        changeFrequency: "daily",
        priority: 0.9,
        alternates: {
          languages: topicAlternates,
        },
      });
    }
  }

  // 3. 一手信源专题聚合页（仅收录已有真实信号入库的活跃信源 × 4 语种）
  for (const src of hubIndex.sources) {
    const sourceAlternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      sourceAlternates[HREFLANG_MAP[loc]] =
        `${siteUrl}/${loc}/source/${src.platform}`;
    }
    sourceAlternates["x-default"] = `${siteUrl}/en/source/${src.platform}`;
    const lastMod = parseSafeLastMod(src.lastModifiedDate, now);

    for (const loc of LOCALES) {
      entries.push({
        url: `${siteUrl}/${loc}/source/${src.platform}`,
        lastModified: lastMod,
        changeFrequency: "daily",
        priority: 0.88,
        alternates: {
          languages: sourceAlternates,
        },
      });
    }
  }

  // 4. 每日独立归档页（dates × 4 语种）
  for (const dateKey of dates) {
    const dayAlternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      dayAlternates[HREFLANG_MAP[loc]] = `${siteUrl}/${loc}/daily/${dateKey}`;
    }
    dayAlternates["x-default"] = `${siteUrl}/en/daily/${dateKey}`;
    const lastMod = parseSafeLastMod(dateKey, now);

    for (const loc of LOCALES) {
      entries.push({
        url: `${siteUrl}/${loc}/daily/${dateKey}`,
        lastModified: lastMod,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: {
          languages: dayAlternates,
        },
      });
    }
  }

  return entries;
}
