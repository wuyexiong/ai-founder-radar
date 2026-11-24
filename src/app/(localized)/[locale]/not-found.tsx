"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, isValidLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

function resolveLocaleFromPath(pathname: string | null): Locale {
  const firstSegment = pathname?.split("/").filter(Boolean)[0];
  return isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

export default function LocalizedNotFound() {
  const pathname = usePathname();
  const locale = resolveLocaleFromPath(pathname);
  const dict = getDictionary(locale);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 text-center dark:bg-[#090D16]">
      <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
        404
      </p>
      <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
        {dict.notFound.title}
      </h1>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {dict.notFound.desc}
      </p>
      <Link
        href={`/${locale}`}
        className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
      >
        {dict.notFound.backHome}
      </Link>
    </div>
  );
}
