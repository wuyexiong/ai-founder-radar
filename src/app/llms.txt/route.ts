import { NextResponse } from "next/server";
import { getSiteUrl } from "@/i18n/config";
import { buildLlmsTxt } from "@/lib/feeds";
import { getAllAvailableDates, getSeoHubIndex } from "@/lib/signals-repo";

export const revalidate = 600;

export async function GET() {
  const siteUrl = getSiteUrl();
  const [hubDirectory, availableDates] = await Promise.all([
    getSeoHubIndex(),
    getAllAvailableDates(),
  ]);

  const body = buildLlmsTxt({
    siteUrl,
    hubDirectory,
    availableDates,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
