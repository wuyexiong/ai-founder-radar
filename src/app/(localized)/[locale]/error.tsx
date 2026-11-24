"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { DEFAULT_LOCALE, isValidLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

function resolveLocaleFromPath(pathname: string | null): Locale {
  const firstSegment = pathname?.split("/").filter(Boolean)[0];
  return isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

export default function LocalizedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const locale = resolveLocaleFromPath(pathname);
  const dict = getDictionary(locale);

  useEffect(() => {
    console.error("[AI Founder Radar] Route error:", error.digest || error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 text-center dark:bg-[#090D16]">
      <p className="font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">
        500
      </p>
      <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
        {dict.errorPage.title}
      </h1>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {dict.errorPage.desc}
      </p>
      <div className="mt-5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer"
        >
          {dict.errorPage.retry}
        </button>
        <Link
          href={`/${locale}`}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {dict.errorPage.backHome}
        </Link>
      </div>
    </div>
  );
}
