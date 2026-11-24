import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadarBoard } from "@/components/radar-board";
import { isValidLocale, LOCALES } from "@/i18n/config";
import { buildHubJsonLd, buildHubMetadata } from "@/lib/seo";
import {
  getTopicCopy,
  isValidTopicSlug,
  TOPIC_SLUGS,
} from "@/lib/seo-taxonomy";
import { getTopicHubPayload } from "@/lib/signals-repo";

export const revalidate = 600;
export const dynamicParams = true;

export function generateStaticParams() {
  const params: Array<{ locale: string; tag: string }> = [];
  for (const locale of LOCALES) {
    for (const tag of TOPIC_SLUGS) {
      params.push({ locale, tag });
    }
  }
  return params;
}

interface TopicHubPageProps {
  params: Promise<{ locale: string; tag: string }>;
}

export async function generateMetadata({
  params,
}: TopicHubPageProps): Promise<Metadata> {
  const { locale, tag } = await params;
  if (!isValidLocale(locale) || !isValidTopicSlug(tag)) return {};

  const payload = await getTopicHubPayload(locale, tag);
  const copy = getTopicCopy(tag, locale);

  return buildHubMetadata({
    locale,
    kind: "topic",
    slug: tag,
    seoTitle: copy.seoTitle,
    h1: copy.h1,
    description: copy.description,
    breadcrumbLabel: copy.label,
    latestDateKey: payload.hub?.latestDateKey ?? payload.activeDate,
    items: payload.items,
  });
}

export default async function TopicHubPage({ params }: TopicHubPageProps) {
  const { locale, tag } = await params;
  if (!isValidLocale(locale) || !isValidTopicSlug(tag)) {
    notFound();
  }

  const payload = await getTopicHubPayload(locale, tag);
  const copy = getTopicCopy(tag, locale);

  const jsonLd = buildHubJsonLd({
    locale,
    kind: "topic",
    slug: tag,
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
