import { NextResponse } from "next/server";
import { getSiteUrl } from "@/i18n/config";
import { buildLlmsFullTxt } from "@/lib/feeds";
import {
  getRadarPayload,
  getRecentLocalizedSignals,
  getSeoHubIndex,
} from "@/lib/signals-repo";

export const revalidate = 600;

export async function GET() {
  const siteUrl = getSiteUrl();
  const [enPayload, recentEn, hubDirectory] = await Promise.all([
    getRadarPayload("en"),
    getRecentLocalizedSignals("en", 50),
    getSeoHubIndex(),
  ]);

  const body = buildLlmsFullTxt({
    siteUrl,
    latestDateKey: recentEn.latestDateKey || enPayload.activeDate,
    overview: enPayload.overview,
    items: recentEn.items,
    hubDirectory,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
