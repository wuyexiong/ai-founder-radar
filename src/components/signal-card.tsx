"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Calendar,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";
import { type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizeSourceSublabel } from "@/lib/localize-sublabel";
import { trackRadarEvent } from "@/lib/analytics";
import {
  getTopicCopy,
  isValidTopicSlug,
  type TopicSlug,
} from "@/lib/seo-taxonomy";
import {
  buildSignalPermalink,
  cn,
  formatDeterministicClock,
  formatSignalShareBrief,
  toSafeHttpUrl,
} from "@/lib/utils";
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
  ai_trend: "border-l-cyan-600 dark:border-l-cyan-400",
};

interface SignalCardProps {
  item: SignalItem;
  locale: Locale;
  dict: Dictionary["card"];
  isBookmarked: boolean;
  isHighlighted?: boolean;
  activeTopicSlug?: string | null;
  archivedDateHref?: string;
  hubDateHref?: string;
  onToggleBookmark: (item: SignalItem) => void;
}

export function SignalCard({
  item,
  locale,
  dict,
  isBookmarked,
  isHighlighted = false,
  activeTopicSlug,
  archivedDateHref,
  hubDateHref,
  onToggleBookmark,
}: SignalCardProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);
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

  const publishedClock = formatDeterministicClock(item.publishedAt, locale);
  const displaySublabel = localizeSourceSublabel(item.sourceSublabel, locale);

  const showOrigSubtitle =
    Boolean(item.titleOrig) &&
    item.titleOrig.trim().toLowerCase() !== item.title.trim().toLowerCase();
  const safeSourceUrl = toSafeHttpUrl(item.sourceUrl);

  const topicPills = (item.topics ?? [])
    .filter((slug): slug is TopicSlug => isValidTopicSlug(slug))
    .slice(0, 2);

  const handleCopyBrief = async () => {
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const origin =
      configuredOrigin ||
      (typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://radar.aibuildon.com");

    const permalink = buildSignalPermalink({
      siteUrl: origin,
      locale,
      dateKey: item.dateKey,
      signalId: item.id,
      utmSource: "share_brief",
    });

    const briefText = formatSignalShareBrief({
      title: item.title,
      metricsBadge: item.metricsBadge,
      whatItIsLabel: dict.whatItIs,
      whatItIs: item.whatItIs,
      monetizationLabel: dict.monetization,
      businessSignal: item.businessSignal,
      playbookLabel: dict.playbook,
      indieTakeaway: item.indieTakeaway,
      shareLinkLabel: dict.shareLinkLabel,
      permalink,
    });

    let success = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(briefText);
        success = true;
      }
    } catch {
      success = false;
    }

    if (!success && typeof document !== "undefined") {
      try {
        const ta = document.createElement("textarea");
        ta.value = briefText;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        success = false;
      }
    }

    if (success) {
      trackRadarEvent("signal_copy_brief", {
        signal_id: item.id,
        platform: item.sourcePlatform,
        category: item.category,
        locale,
      });
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1800);
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/source/${item.sourcePlatform}`}
            className="inline-flex items-center gap-1.5 font-medium text-slate-700 transition-colors hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
          >
            <span className={cn("h-2 w-2 rounded-full", platform.dotClass)} />
            {platform.label}
          </Link>
          {displaySublabel && (
            <span className="text-slate-400 dark:text-slate-500">
              · {displaySublabel}
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {categoryLabel}
          </span>
          {hubDateHref && !archivedDateHref && (
            <Link
              href={hubDateHref}
              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
            >
              <Calendar className="h-3 w-3" />
              {item.dateKey}
            </Link>
          )}
          {archivedDateHref && (
            <Link
              href={archivedDateHref}
              className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
            >
              <Calendar className="h-3 w-3" />
              {dict.archivedFrom(item.dateKey)}
            </Link>
          )}
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
          {publishedClock && (
            <time
              dateTime={item.publishedAt}
              title={item.publishedAt}
              className="text-slate-400 dark:text-slate-500"
            >
              {publishedClock}
            </time>
          )}
        </div>
      </div>

      {/* 第 2 层：当前语种主标题 + 英文原标题对照 */}
      <div className="mb-3.5">
        <h3 className="text-[16.5px] font-semibold leading-snug">
          <a
            href={safeSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackRadarEvent("signal_outbound_click", {
                signal_id: item.id,
                platform: item.sourcePlatform,
                category: item.category,
                score: item.score,
                locale,
                placement: "title",
              })
            }
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

      {/* 第 4 层：底栏切口标签、常青专题 SEO 内链与微裂变操作行 */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}

          {topicPills.map((slug) => {
            const isCurrent = activeTopicSlug === slug;
            const topicShort = getTopicCopy(slug, locale).shortLabel;
            return (
              <Link
                key={slug}
                href={`/${locale}/topic/${slug}`}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11.5px] font-medium transition-colors",
                  isCurrent
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-blue-500/50 dark:hover:text-blue-300"
                )}
              >
                <span>{topicShort}</span>
                <ArrowUpRight className="h-3 w-3 opacity-60" />
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleCopyBrief}
            title={dict.copyBriefTooltip}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? dict.copiedBrief : dict.copyBrief}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleBookmark(item)}
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
            onClick={() =>
              trackRadarEvent("signal_outbound_click", {
                signal_id: item.id,
                platform: item.sourcePlatform,
                category: item.category,
                score: item.score,
                locale,
                placement: "button",
              })
            }
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
