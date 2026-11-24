import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  HTML_LANG_MAP,
  LOCALE_TIMEZONE_MAP,
  type Locale,
} from "@/i18n/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isSafeHttpUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function toSafeHttpUrl(raw: string | undefined | null): string {
  if (!raw) return "#";
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return "#";
  } catch {
    return "#";
  }
}

export function formatDeterministicClock(
  iso: string,
  locale: Locale
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const timeZone = LOCALE_TIMEZONE_MAP[locale] ?? "UTC";
  const clock = new Intl.DateTimeFormat(HTML_LANG_MAP[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);

  return locale === "en" ? `${clock} UTC` : clock;
}

export function buildSignalPermalink(params: {
  siteUrl: string;
  locale: Locale;
  dateKey: string;
  signalId: string;
}): string {
  const base = params.siteUrl.trim().replace(/\/$/, "");
  return `${base}/${params.locale}/daily/${params.dateKey}#${encodeURIComponent(params.signalId)}`;
}

export function formatSignalShareBrief(params: {
  title: string;
  metricsBadge: string;
  whatItIsLabel: string;
  whatItIs: string;
  monetizationLabel: string;
  businessSignal: string;
  playbookLabel: string;
  indieTakeaway: string;
  shareLinkLabel: string;
  permalink: string;
}): string {
  const badgePrefix = params.metricsBadge.trim()
    ? `[${params.metricsBadge.trim()}] `
    : "";
  return [
    `${badgePrefix}${params.title.trim()}`,
    `${params.whatItIsLabel.trim()} ${params.whatItIs.trim()}`,
    `${params.monetizationLabel.trim()} ${params.businessSignal.trim()}`,
    `${params.playbookLabel.trim()} ${params.indieTakeaway.trim()}`,
    `${params.shareLinkLabel.trim()} ${params.permalink.trim()}`,
  ].join("\n");
}
