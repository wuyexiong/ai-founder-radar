import { NextResponse } from "next/server";
import { getSiteUrl, isValidLocale, LOCALES } from "@/i18n/config";
import { buildRssFeedXml } from "@/lib/feeds";
import { getRecentLocalizedSignals } from "@/lib/signals-repo";

export const revalidate = 600;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string }> }
) {
  const { locale } = await context.params;
  if (!isValidLocale(locale)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const siteUrl = getSiteUrl();
  const { latestDateKey, items } = await getRecentLocalizedSignals(locale, 40);
  const xml = buildRssFeedXml({
    siteUrl,
    locale,
    latestDateKey,
    items,
  });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
