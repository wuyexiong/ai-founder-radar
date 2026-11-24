import type { Metadata } from "next";
import { notFound } from "next/navigation";
import React from "react";
import { SignalDetailView } from "@/components/signal-detail-view";
import { isValidLocale, LOCALES } from "@/i18n/config";
import {
  buildSignalDetailJsonLd,
  buildSignalDetailMetadata,
} from "@/lib/seo";
import {
  getIndexableSignalEntries,
  getSignalDetailPayload,
  isValidSignalId,
} from "@/lib/signals-repo";

export const revalidate = 86400; // 单条信号详情页 24 小时静态 ISR 缓存，支持按需刷新与动态长尾兜底
export const dynamicParams = true;

export async function generateStaticParams() {
  const entries = await getIndexableSignalEntries(40);
  const params: Array<{ locale: string; id: string }> = [];
  for (const locale of LOCALES) {
    for (const entry of entries) {
      params.push({ locale, id: entry.id });
    }
  }
  return params;
}

interface SignalDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({
  params,
}: SignalDetailPageProps): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isValidLocale(locale) || !isValidSignalId(id)) return {};

  const payload = await getSignalDetailPayload(locale, id);
  if (!payload) return {};

  return buildSignalDetailMetadata({
    locale,
    item: payload.item,
  });
}

export default async function SignalDetailPage({
  params,
}: SignalDetailPageProps) {
  const { locale, id } = await params;
  if (!isValidLocale(locale) || !isValidSignalId(id)) {
    notFound();
  }

  const payload = await getSignalDetailPayload(locale, id);
  if (!payload) {
    notFound();
  }

  const jsonLd = buildSignalDetailJsonLd({
    locale,
    item: payload.item,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <SignalDetailView payload={payload} />
    </>
  );
}
