import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadarBoard } from "@/components/radar-board";
import { isValidLocale } from "@/i18n/config";
import { buildRadarJsonLd, buildRadarMetadata } from "@/lib/seo";
import { getRadarPayload } from "@/lib/signals-repo";

export const revalidate = 600; // 纯静态 ISR（每 10 分钟增量刷新，配合 07:35 同步确保 07:45 前必见新数据）

interface LocaleHomeProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: LocaleHomeProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};

  const payload = await getRadarPayload(locale);
  return buildRadarMetadata({
    locale,
    dateKey: payload.activeDate,
    latestDate: payload.availableDates[0] ?? payload.activeDate,
    isArchiveRoute: false,
    overview: payload.overview,
    items: payload.items,
  });
}

export default async function LocaleHomePage({ params }: LocaleHomeProps) {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    notFound();
  }

  const payload = await getRadarPayload(locale);
  const jsonLd = buildRadarJsonLd({
    locale,
    dateKey: payload.activeDate,
    isArchiveRoute: false,
    overview: payload.overview,
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
