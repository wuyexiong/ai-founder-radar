"use client";

import { Bookmark, ExternalLink } from "lucide-react";
import { HTML_LANG_MAP, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { cn, toSafeHttpUrl } from "@/lib/utils";
import type {
  SignalCategory,
  SignalItem,
  SourcePlatform,
} from "@/types/signal";

export const PLATFORM_META: Record<
  SourcePlatform,
  { label: string; dotClass: string }
> = {
  producthunt: { label: "Product Hunt", dotClass: "bg-orange-500" },
  hackernews: { label: "Hacker News", dotClass: "bg-amber-500" },
  indiehackers: {
    label: "Indie Hackers",
    dotClass: "bg-sky-600 dark:bg-sky-400",
  },
  acquire: {
    label: "Acquire.com",
    dotClass: "bg-teal-600 dark:bg-teal-400",
  },
  reddit: { label: "Reddit", dotClass: "bg-rose-500" },
  github: { label: "GitHub", dotClass: "bg-slate-700 dark:bg-slate-300" },
  trustmrr: { label: "TrustMRR", dotClass: "bg-emerald-500" },
  appstore: { label: "App Store", dotClass: "bg-blue-500" },
};

const CATEGORY_BORDER_CLASS: Record<SignalCategory, string> = {
  revenue: "border-l-emerald-500 dark:border-l-emerald-400",
  launch: "border-l-orange-500 dark:border-l-orange-400",
  pain_point: "border-l-blue-600 dark:border-l-blue-400",
  ai_trend: "border-l-slate-500 dark:border-l-slate-400",
};

interface SignalCardProps {
  item: SignalItem;
  locale: Locale;
  dict: Dictionary["card"];
  isBookmarked: boolean;
  isHighlighted?: boolean;
  activeTag: string | null;
  onToggleBookmark: (id: string) => void;
}

export function SignalCard({
  item,
  locale,
  dict,
  isBookmarked,
  isHighlighted = false,
  activeTag,
  onToggleBookmark,
}: SignalCardProps) {
  const platform = PLATFORM_META[item.sourcePlatform] ?? {
    label: item.sourcePlatform,
    dotClass: "bg-slate-400",
  };
  const categoryLabel =
    dict.categories[item.category] ?? dict.categories.launch;
  const borderLeftClass =
    CATEGORY_BORDER_CLASS[item.category] ?? CATEGORY_BORDER_CLASS.launch;

  const metricBadgeClass =
    item.metricType === "revenue"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
      : item.metricType === "pain"
        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30"
        : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30";

  const publishedClock = new Date(item.publishedAt).toLocaleTimeString(
    HTML_LANG_MAP[locale],
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );

  const showOrigSubtitle =
    Boolean(item.titleOrig) &&
    item.titleOrig.trim().toLowerCase() !== item.title.trim().toLowerCase();
  const safeSourceUrl = toSafeHttpUrl(item.sourceUrl);

  return (
    <article
      id={item.id}
      className={cn(
        "group scroll-mt-28 rounded-xl border bg-white p-5 transition-all duration-300 dark:bg-[#111827]",
        isHighlighted
          ? "border-blue-500 ring-2 ring-blue-500/30 shadow-md dark:border-blue-400 dark:ring-blue-400/30"
          : "border-slate-200/90 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-700"
      )}
    >
      {/* 第 1 层：顶栏元数据 */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
            <span className={cn("h-2 w-2 rounded-full", platform.dotClass)} />
            {platform.label}
          </span>
          {item.sourceSublabel && (
            <span className="text-slate-400 dark:text-slate-500">
              · {item.sourceSublabel}
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {categoryLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 tabular-nums">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] font-semibold",
              metricBadgeClass
            )}
          >
            {item.metricsBadge}
          </span>
          <span
            title={dict.scoreTooltip}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
          >
            {item.score.toFixed(1)}
          </span>
          <span className="text-slate-400 dark:text-slate-500">
            {publishedClock}
          </span>
        </div>
      </div>

      {/* 第 2 层：当前语种主标题 + 英文原标题对照 */}
      <div className="mb-3.5">
        <h3 className="text-[16.5px] font-semibold leading-snug">
          <a
            href={safeSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-50 dark:group-hover:text-blue-400"
          >
            {item.title}
          </a>
        </h3>
        {showOrigSubtitle && (
          <p className="mt-1 line-clamp-1 text-[12.5px] text-slate-400 dark:text-slate-500">
            {item.titleOrig}
          </p>
        )}
      </div>

      {/* 第 3 层：AI 商业透镜三要素内嵌块 */}
      <div
        className={cn(
          "mb-3.5 space-y-2 rounded-lg border border-slate-200/70 border-l-[3px] bg-slate-50/85 p-3.5 text-[13.5px] leading-relaxed dark:border-slate-800/90 dark:bg-slate-900/60",
          borderLeftClass
        )}
      >
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-300">
            {dict.whatItIs}
          </span>
          <span className="text-slate-600 dark:text-slate-300">
            {item.whatItIs}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-300">
            {dict.monetization}
          </span>
          <span className="text-slate-600 dark:text-slate-300 tabular-nums">
            {item.businessSignal}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-semibold text-slate-900 dark:text-slate-100">
            {dict.playbook}
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-100">
            {item.indieTakeaway}
          </span>
        </div>
      </div>

      {/* 第 4 层：底栏静态语义标签与操作行 */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.tags.map((tag) => {
            const selected = activeTag === tag;
            return (
              <span
                key={tag}
                className={cn(
                  "select-none rounded-md px-2 py-0.5 text-xs font-medium",
                  selected
                    ? "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {tag}
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleBookmark(item.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              isBookmarked
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <Bookmark
              className={cn("h-3.5 w-3.5", isBookmarked && "fill-current")}
            />
            {isBookmarked ? dict.saved : dict.save}
          </button>

          <a
            href={safeSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-blue-500/50 dark:hover:text-blue-400"
          >
            {dict.viewSource}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}
