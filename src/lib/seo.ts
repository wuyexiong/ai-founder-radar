import type { Metadata } from "next";
import {
  buildLocalePath,
  getSiteUrl,
  HREFLANG_MAP,
  LOCALES,
  type Locale,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import type { DailyOverview, SignalItem } from "@/types/signal";

interface BuildSeoParams {
  locale: Locale;
  dateKey: string;
  latestDate: string;
  isArchiveRoute: boolean;
  overview: DailyOverview;
  items: SignalItem[];
}

export function buildRadarMetadata({
  locale,
  dateKey,
  latestDate,
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

  // 若访问 /en/daily/<最新日期>，canonical 指向各自路径，同时保持多语种对称互指
  void latestDate;
  void buildLocalePath;

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: {
      canonical: `${siteUrl}${canonicalPath}`,
      languages,
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
  };
}

export function buildRadarJsonLd({
  locale,
  dateKey,
  isArchiveRoute,
  overview,
  items,
}: Omit<BuildSeoParams, "latestDate">) {
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
          itemListElement: items.map((item, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            name: item.title,
            description: `${item.whatItIs} ${item.businessSignal}`,
            url: item.sourceUrl,
          })),
        },
      },
    ],
  };
}
