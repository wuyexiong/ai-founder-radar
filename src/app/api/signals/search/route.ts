import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isValidLocale, type Locale } from "@/i18n/config";
import { isValidSourcePlatform } from "@/lib/seo-taxonomy";
import {
  isValidSignalCategory,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  searchSignalsCorpus,
} from "@/lib/signals-repo";

const SEARCH_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawQuery = (searchParams.get("q") ?? "").trim();

  if (rawQuery.length < 2) {
    return NextResponse.json(
      { ok: true, items: [] },
      { status: 200, headers: SEARCH_CACHE_HEADERS }
    );
  }

  const query = rawQuery.slice(0, SEARCH_QUERY_MAX_LENGTH);
  const rawLocale = searchParams.get("locale");
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const rawCategory = searchParams.get("category");
  const category = isValidSignalCategory(rawCategory) ? rawCategory : undefined;

  const rawPlatform = searchParams.get("platform");
  const platform = isValidSourcePlatform(rawPlatform) ? rawPlatform : undefined;

  const rawLimit = searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(SEARCH_MAX_LIMIT, Math.max(1, parsedLimit))
    : SEARCH_DEFAULT_LIMIT;

  const result = await searchSignalsCorpus({
    query,
    locale,
    category,
    platform,
    limit,
  });

  return NextResponse.json(
    {
      ok: true,
      items: result.items,
      count: result.items.length,
      storageMode: result.storageMode,
    },
    { status: 200, headers: SEARCH_CACHE_HEADERS }
  );
}
