import type { NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  isPlausibleArchiveDate,
  isValidLocale,
  type Locale,
} from "@/i18n/config";
import { renderRadarOgImage } from "@/lib/og-renderer";
import {
  getSourceCopy,
  getTopicCopy,
  isValidSourcePlatform,
  isValidTopicSlug,
} from "@/lib/seo-taxonomy";
import {
  getRadarPayload,
  getSourceHubPayload,
  getTopicHubPayload,
} from "@/lib/signals-repo";

const OG_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function withOgCacheHeaders(res: Response): Response {
  res.headers.set("Cache-Control", OG_CACHE_CONTROL);
  return res;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  const { slug = [] } = await context.params;
  const rawLocale = slug[0];
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const section = slug[1];
  const target = slug[2];

  // 1. /og/[locale] -> Latest Daily Briefing
  if (!section) {
    const enPayload = await getRadarPayload("en");
    const topHeadline =
      enPayload.items[0]?.title ||
      enPayload.items[0]?.titleOrig ||
      "Daily Micro-SaaS Launches, Verified MRR & Pain Points";

    return withOgCacheHeaders(
      renderRadarOgImage({
        kind: "home",
        locale,
        dateLabel: `${enPayload.activeDate} | LATEST`,
        headline: topHeadline,
        subheadline: enPayload.overview.summaryNote,
        items: enPayload.items,
      })
    );
  }

  // 2. /og/[locale]/daily/[date] -> Daily Archive Briefing
  if (section === "daily") {
    const requestedDate = isPlausibleArchiveDate(target) ? target : undefined;
    const enPayload = await getRadarPayload("en", requestedDate, true);
    const topHeadline =
      enPayload.items[0]?.title ||
      enPayload.items[0]?.titleOrig ||
      `${enPayload.activeDate} Indie SaaS & MRR Signal Briefing`;

    return withOgCacheHeaders(
      renderRadarOgImage({
        kind: "daily",
        locale,
        dateLabel: enPayload.activeDate,
        headline: topHeadline,
        subheadline: enPayload.overview.summaryNote,
        items: enPayload.items,
      })
    );
  }

  // 3. /og/[locale]/topic/[tag] -> Evergreen Niche Topic Hub
  if (section === "topic") {
    if (!isValidTopicSlug(target)) {
      return withOgCacheHeaders(
        renderRadarOgImage({
          kind: "topic",
          locale,
          headline: "Profitable Micro-SaaS Niche Intelligence Hub",
        })
      );
    }

    const enCopy = getTopicCopy(target, "en");
    const enPayload = await getTopicHubPayload("en", target);

    return withOgCacheHeaders(
      renderRadarOgImage({
        kind: "topic",
        locale,
        dateLabel: `UPDATED ${enPayload.activeDate}`,
        headline: enCopy.h1,
        subheadline:
          enPayload.items[0]?.title ||
          enPayload.items[0]?.titleOrig ||
          enCopy.description,
        items: enPayload.items,
      })
    );
  }

  // 4. /og/[locale]/source/[platform] -> Primary Source Hub
  if (section === "source") {
    if (!isValidSourcePlatform(target)) {
      return withOgCacheHeaders(
        renderRadarOgImage({
          kind: "source",
          locale,
          headline: "Global Indie SaaS Primary Signal Source Hub",
        })
      );
    }

    const enCopy = getSourceCopy(target, "en");
    const enPayload = await getSourceHubPayload("en", target);

    return withOgCacheHeaders(
      renderRadarOgImage({
        kind: "source",
        locale,
        dateLabel: `UPDATED ${enPayload.activeDate}`,
        headline: enCopy.h1,
        subheadline:
          enPayload.items[0]?.title ||
          enPayload.items[0]?.titleOrig ||
          enCopy.description,
        items: enPayload.items,
      })
    );
  }

  // Fallback default card
  return withOgCacheHeaders(
    renderRadarOgImage({
      kind: "default",
      locale,
      headline: "5-Minute Daily Micro-SaaS, Verified MRR & Pain Point Radar",
    })
  );
}
