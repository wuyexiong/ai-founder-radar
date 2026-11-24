import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadarBoard } from "@/components/radar-board";
import { isValidLocale, LOCALES } from "@/i18n/config";
import { buildHubJsonLd, buildHubMetadata } from "@/lib/seo";
import {
  getSourceCopy,
  isValidSourcePlatform,
  SOURCE_PLATFORMS,
} from "@/lib/seo-taxonomy";
import { getSourceHubPayload } from "@/lib/signals-repo";

export const revalidate = 600;
export const dynamicParams = true;

export function generateStaticParams() {
  const params: Array<{ locale: string; platform: string }> = [];
  for (const locale of LOCALES) {
    for (const platform of SOURCE_PLATFORMS) {
      params.push({ locale, platform });
    }
  }
  return params;
}

interface SourceHubPageProps {
  params: Promise<{ locale: string; platform: string }>;
}

export async function generateMetadata({
  params,
}: SourceHubPageProps): Promise<Metadata> {
  const { locale, platform } = await params;
  if (!isValidLocale(locale) || !isValidSourcePlatform(platform)) return {};

  const payload = await getSourceHubPayload(locale, platform);
  const copy = getSourceCopy(platform, locale);

  return buildHubMetadata({
    locale,
    kind: "source",
    slug: platform,
    seoTitle: copy.seoTitle,
    h1: copy.h1,
    description: copy.description,
    breadcrumbLabel: copy.label,
    latestDateKey: payload.hub?.latestDateKey ?? payload.activeDate,
    items: payload.items,
  });
}

export default async function SourceHubPage({ params }: SourceHubPageProps) {
  const { locale, platform } = await params;
  if (!isValidLocale(locale) || !isValidSourcePlatform(platform)) {
    notFound();
  }

  const payload = await getSourceHubPayload(locale, platform);
  if (payload.items.length === 0) {
    notFound();
  }
  const copy = getSourceCopy(platform, locale);

  const jsonLd = buildHubJsonLd({
    locale,
    kind: "source",
    slug: platform,
    seoTitle: copy.seoTitle,
    h1: copy.h1,
    description: copy.description,
    breadcrumbLabel: copy.label,
    latestDateKey: payload.hub?.latestDateKey ?? payload.activeDate,
    items: payload.items,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <RadarBoard payload={payload} />
    </>
  );
}
