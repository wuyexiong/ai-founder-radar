import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadarBoard } from "@/components/radar-board";
import { isValidLocale } from "@/i18n/config";
import { buildRadarJsonLd, buildRadarMetadata } from "@/lib/seo";
import { getRadarPayload } from "@/lib/signals-repo";

export const revalidate = 300; // 纯静态 ISR（每 5 分钟增量刷新；配合同步完成后的 /api/revalidate 实现秒级刷新）

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
