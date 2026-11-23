export const LOCALES = ["en", "zh", "zh-TW", "ja"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "indieradar-locale";

export const HTML_LANG_MAP: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ja: "ja",
};

export const HREFLANG_MAP: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ja: "ja",
};

export const LOCALE_LABELS: Record<
  Locale,
  { short: string; native: string; flag: string }
> = {
  en: { short: "EN", native: "English", flag: "🇺🇸" },
  zh: { short: "简", native: "简体中文", flag: "🇨🇳" },
  "zh-TW": { short: "繁", native: "繁體中文", flag: "🇹🇼" },
  ja: { short: "JP", native: "日本語", flag: "🇯🇵" },
};

export function isValidLocale(value: string | undefined | null): value is Locale {
  if (!value) return false;
  return (LOCALES as readonly string[]).includes(value);
}

export function detectPreferredLocale(
  acceptLanguage?: string | null,
  cookieLocale?: string | null
): Locale {
  if (isValidLocale(cookieLocale)) {
    return cookieLocale;
  }

  if (acceptLanguage) {
    const parts = acceptLanguage
      .split(",")
      .map((entry) => {
        const [rawTag, rawQ] = entry.trim().split(";q=");
        const q = rawQ ? Number.parseFloat(rawQ) : 1;
        return {
          tag: rawTag.trim().toLowerCase(),
          q: Number.isFinite(q) ? q : 0,
        };
      })
      .sort((a, b) => b.q - a.q);

    for (const { tag } of parts) {
      if (!tag || tag === "*") continue;
      if (tag.startsWith("zh")) {
        if (
          tag.includes("tw") ||
          tag.includes("hk") ||
          tag.includes("mo") ||
          tag.includes("hant")
        ) {
          return "zh-TW";
        }
        return "zh";
      }
      if (tag.startsWith("ja")) {
        return "ja";
      }
      if (tag.startsWith("en")) {
        return "en";
      }
    }
  }

  return DEFAULT_LOCALE;
}

export function buildLocalePath(
  locale: Locale,
  dateKey?: string | null,
  latestDate?: string | null
): string {
  if (!dateKey || (latestDate && dateKey === latestDate)) {
    return `/${locale}`;
  }
  return `/${locale}/daily/${dateKey}`;
}

export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://indieradar.dev");
  return raw.replace(/\/$/, "");
}
