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
