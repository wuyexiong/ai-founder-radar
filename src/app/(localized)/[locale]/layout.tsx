import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import {
  getSiteUrl,
  HTML_LANG_MAP,
  isValidLocale,
  LOCALES,
} from "@/i18n/config";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "../../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocalizedRootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    notFound();
  }

  return (
    <html lang={HTML_LANG_MAP[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <AnalyticsScripts />
      </body>
    </html>
  );
}
