import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadarBoard } from "@/components/radar-board";
import {
  isPlausibleArchiveDate,
  isValidLocale,
  LOCALES,
} from "@/i18n/config";
import { buildRadarJsonLd, buildRadarMetadata } from "@/lib/seo";
import { getAllAvailableDates, getRadarPayload } from "@/lib/signals-repo";

export const revalidate = 86400; // 历史归档页 24 小时静态缓存（每日同步后由 /api/revalidate 按需秒级刷新）
export const dynamicParams = true;

export async function generateStaticParams() {
  const dates = await getAllAvailableDates();
  const params: Array<{ locale: string; date: string }> = [];
  for (const locale of LOCALES) {
    for (const date of dates.slice(0, 15)) {
      params.push({ locale, date });
    }
  }
  return params;
}

interface DailyArchiveProps {
  params: Promise<{ locale: string; date: string }>;
}

export async function generateMetadata({
  params,
}: DailyArchiveProps): Promise<Metadata> {
  const { locale, date } = await params;
  if (!isValidLocale(locale) || !isPlausibleArchiveDate(date)) return {};

  const payload = await getRadarPayload(locale, date);
  if (payload.activeDate !== date) return {};

  return buildRadarMetadata({
    locale,
    dateKey: date,
    isArchiveRoute: true,
    overview: payload.overview,
    items: payload.items,
  });
}

export default async function DailyArchivePage({ params }: DailyArchiveProps) {
  const { locale, date } = await params;
  if (!isValidLocale(locale) || !isPlausibleArchiveDate(date)) {
    notFound();
  }

  const payload = await getRadarPayload(locale, date);
  if (payload.activeDate !== date) {
    notFound();
  }

  const jsonLd = buildRadarJsonLd({
    locale,
    dateKey: date,
    isArchiveRoute: true,
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
