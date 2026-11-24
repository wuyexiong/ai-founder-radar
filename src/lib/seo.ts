import type { Metadata } from "next";
import {
  getSiteUrl,
  HREFLANG_MAP,
  LOCALES,
  type Locale,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { toSafeHttpUrl } from "@/lib/utils";
import type { DailyOverview, SignalItem } from "@/types/signal";

interface BuildSeoParams {
  locale: Locale;
  dateKey: string;
  isArchiveRoute: boolean;
  overview: DailyOverview;
  items: SignalItem[];
}

export function buildRadarMetadata({
  locale,
  dateKey,
  isArchiveRoute,
  overview,
  items,
}: BuildSeoParams): Metadata {
  const dict = getDictionary(locale);
  const siteUrl = getSiteUrl();

  const canonicalPath = isArchiveRoute
    ? `/${locale}/daily/${dateKey}`
    : `/${locale}`;
  const ogImagePath = isArchiveRoute
    ? `/og/${locale}/daily/${dateKey}`
    : `/og/${locale}`;

  const title = isArchiveRoute
    ? dict.meta.dailyTitle(dateKey, items[0]?.title, items.length)
    : dict.meta.siteTitle;

  const description = isArchiveRoute
    ? dict.meta.dailyDescription(dateKey, overview.summaryNote, items.length)
    : dict.meta.siteDescription;

  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    const hreflang = HREFLANG_MAP[loc];
    languages[hreflang] = isArchiveRoute
      ? `${siteUrl}/${loc}/daily/${dateKey}`
      : `${siteUrl}/${loc}`;
  }
  languages["x-default"] = isArchiveRoute
    ? `${siteUrl}/en/daily/${dateKey}`
    : `${siteUrl}/en`;

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: {
      canonical: `${siteUrl}${canonicalPath}`,
      languages,
      types: {
        "application/rss+xml": `${siteUrl}/${locale}/feed.xml`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${canonicalPath}`,
      siteName: "AI Founder Radar",
      locale: HREFLANG_MAP[locale].replace("-", "_"),
      type: "website",
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImagePath],
    },
    robots: {
      index: true,
      follow: true,
    },
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()
      ? {
          verification: {
            google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.trim(),
          },
        }
      : {}),
  };
}

export function buildRadarJsonLd({
  locale,
  dateKey,
  isArchiveRoute,
  overview,
  items,
}: BuildSeoParams) {
  const dict = getDictionary(locale);
  const siteUrl = getSiteUrl();
  const pageUrl = isArchiveRoute
    ? `${siteUrl}/${locale}/daily/${dateKey}`
    : `${siteUrl}/${locale}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "AI Founder Radar",
        description: dict.meta.siteDescription,
        inLanguage: HREFLANG_MAP[locale],
      },
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: isArchiveRoute
          ? dict.meta.dailyTitle(dateKey, items[0]?.title, items.length)
          : dict.meta.siteTitle,
        description: overview.summaryNote || dict.meta.siteDescription,
        datePublished: dateKey,
        inLanguage: HREFLANG_MAP[locale],
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.map((item, idx) => {
            const safeUrl = toSafeHttpUrl(item.sourceUrl);
            return {
              "@type": "ListItem",
              position: idx + 1,
              name: item.title,
              description: `${item.whatItIs} ${item.businessSignal}`,
              url: safeUrl === "#" ? pageUrl : safeUrl,
            };
          }),
        },
      },
    ],
  };
}

export interface BuildSignalDetailSeoParams {
  locale: Locale;
  item: SignalItem;
}

export function buildSignalDetailMetadata({
  locale,
  item,
}: BuildSignalDetailSeoParams): Metadata {
  const siteUrl = getSiteUrl();
  const canonicalPath = `/${locale}/signal/${encodeURIComponent(item.id)}`;
  const ogImagePath = `/og/${locale}/signal/${encodeURIComponent(item.id)}`;
  const badgePrefix = item.metricsBadge.trim()
    ? `[${item.metricsBadge.trim()}] `
    : "";
  const title = `${badgePrefix}${item.title} | AI Founder Radar`;
  const description = [item.whatItIs, item.businessSignal, item.indieTakeaway]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 260);

  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    languages[HREFLANG_MAP[loc]] =
      `${siteUrl}/${loc}/signal/${encodeURIComponent(item.id)}`;
  }
  languages["x-default"] =
    `${siteUrl}/en/signal/${encodeURIComponent(item.id)}`;

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: {
      canonical: `${siteUrl}${canonicalPath}`,
      languages,
      types: {
        "application/rss+xml": `${siteUrl}/${locale}/feed.xml`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${canonicalPath}`,
      siteName: "AI Founder Radar",
      locale: HREFLANG_MAP[locale].replace("-", "_"),
      type: "article",
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImagePath],
    },
    robots: {
      index: true,
      follow: true,
    },
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()
      ? {
          verification: {
            google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.trim(),
          },
        }
      : {}),
  };
}

export function buildSignalDetailJsonLd({
  locale,
  item,
}: BuildSignalDetailSeoParams) {
  const dict = getDictionary(locale);
  const siteUrl = getSiteUrl();
  const homeUrl = `${siteUrl}/${locale}`;
  const dailyUrl = `${siteUrl}/${locale}/daily/${item.dateKey}`;
  const pageUrl = `${siteUrl}/${locale}/signal/${encodeURIComponent(item.id)}`;

  const externalUrls = [item.productUrl, item.discussionUrl, item.sourceUrl]
    .map((u) => toSafeHttpUrl(u))
    .filter((u) => u !== "#");
  const uniqueSameAs = Array.from(new Set(externalUrls));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "AI Founder Radar",
        description: dict.meta.siteDescription,
        inLanguage: HREFLANG_MAP[locale],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: dict.hub.breadcrumbHome,
            item: homeUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: dict.signalDetail.breadcrumbDaily(item.dateKey),
            item: dailyUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: item.title,
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        url: pageUrl,
        mainEntityOfPage: pageUrl,
        headline: item.title,
        description: `${item.whatItIs} ${item.businessSignal}`,
        datePublished: item.dateKey,
        dateModified: item.dateKey,
        inLanguage: HREFLANG_MAP[locale],
        isPartOf: { "@id": `${siteUrl}/#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        ...(uniqueSameAs.length > 0 ? { sameAs: uniqueSameAs } : {}),
      },
    ],
  };
}

export interface BuildHubSeoParams {
  locale: Locale;
  kind: "topic" | "source";
  slug: string;
  seoTitle: string;
  h1: string;
  description: string;
  breadcrumbLabel: string;
  latestDateKey: string;
  items: SignalItem[];
}

function formatLocalizedHubDescription(
  locale: Locale,
  description: string,
  count: number,
  topHeadline?: string
): string {
  if (count <= 0 || !topHeadline) return description;
  switch (locale) {
    case "zh":
      return `${description}（累计收录 ${count} 条商业信号 · 最新：${topHeadline}）`;
    case "zh-TW":
      return `${description}（累計收錄 ${count} 則商業信號 · 最新：${topHeadline}）`;
    case "ja":
      return `${description}（厳選 ${count} 件 · 最新：${topHeadline}）`;
    default:
      return `${description} (${count} curated signals — Latest: ${topHeadline})`;
  }
}

export function buildHubMetadata({
  locale,
  kind,
  slug,
  seoTitle,
  description,
  items,
}: BuildHubSeoParams): Metadata {
  const siteUrl = getSiteUrl();
  const canonicalPath = `/${locale}/${kind}/${slug}`;
  const ogImagePath = `/og/${locale}/${kind}/${slug}`;

  const richDescription = formatLocalizedHubDescription(
    locale,
    description,
    items.length,
    items[0]?.title
  );

  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    languages[HREFLANG_MAP[loc]] = `${siteUrl}/${loc}/${kind}/${slug}`;
  }
  languages["x-default"] = `${siteUrl}/en/${kind}/${slug}`;

  return {
    metadataBase: new URL(siteUrl),
    title: seoTitle,
    description: richDescription,
    alternates: {
      canonical: `${siteUrl}${canonicalPath}`,
      languages,
      types: {
        "application/rss+xml": `${siteUrl}/${locale}/feed.xml`,
      },
    },
    openGraph: {
      title: seoTitle,
      description: richDescription,
      url: `${siteUrl}${canonicalPath}`,
      siteName: "AI Founder Radar",
      locale: HREFLANG_MAP[locale].replace("-", "_"),
      type: "website",
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: seoTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: richDescription,
      images: [ogImagePath],
    },
    robots: {
      index: items.length > 0,
      follow: true,
    },
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()
      ? {
          verification: {
            google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.trim(),
          },
        }
      : {}),
  };
}

export function buildHubJsonLd({
  locale,
  kind,
  slug,
  seoTitle,
  h1,
  description,
  breadcrumbLabel,
  latestDateKey,
  items,
}: BuildHubSeoParams) {
  const dict = getDictionary(locale);
  const siteUrl = getSiteUrl();
  const homeUrl = `${siteUrl}/${locale}`;
  const pageUrl = `${siteUrl}/${locale}/${kind}/${slug}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "AI Founder Radar",
        description: dict.meta.siteDescription,
        inLanguage: HREFLANG_MAP[locale],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: dict.hub.breadcrumbHome,
            item: homeUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: breadcrumbLabel,
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: h1 || seoTitle,
        description,
        dateModified: latestDateKey,
        inLanguage: HREFLANG_MAP[locale],
        isPartOf: { "@id": `${siteUrl}/#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        about: {
          "@type": "Thing",
          name: breadcrumbLabel,
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.map((item, idx) => {
            const safeUrl = toSafeHttpUrl(item.sourceUrl);
            return {
              "@type": "ListItem",
              position: idx + 1,
              name: item.title,
              description: `${item.whatItIs} ${item.businessSignal}`,
              url: safeUrl === "#" ? pageUrl : safeUrl,
            };
          }),
        },
      },
    ],
  };
}
