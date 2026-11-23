import type { MetadataRoute } from "next";
import { getSiteUrl, HREFLANG_MAP, LOCALES } from "@/i18n/config";
import { getAllAvailableDates } from "@/lib/signals-repo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const dates = await getAllAvailableDates();
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

  // 2. 每日独立归档页（dates × 4 语种）
  for (const dateKey of dates) {
    const dayAlternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      dayAlternates[HREFLANG_MAP[loc]] = `${siteUrl}/${loc}/daily/${dateKey}`;
    }
    dayAlternates["x-default"] = `${siteUrl}/en/daily/${dateKey}`;

    const parsedDate = new Date(`${dateKey}T00:00:00Z`);
    const lastMod = Number.isNaN(parsedDate.getTime()) ? now : parsedDate;

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
