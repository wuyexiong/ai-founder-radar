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
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "AI Founder Radar — Global Micro-SaaS, AI & Indie Hacker Signal Radar",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image"],
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

  const topHeadline = items[0]?.title;
  const richDescription =
    items.length > 0 && topHeadline
      ? `${description} (${items.length} signals — Latest: ${topHeadline})`
      : description;

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
          url: "/opengraph-image",
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
      images: ["/opengraph-image"],
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
