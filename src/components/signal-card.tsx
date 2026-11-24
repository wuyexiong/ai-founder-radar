"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Flame,
} from "lucide-react";
import { type Locale } from "@/i18n/config";
import { getCardLensLabels, type Dictionary } from "@/i18n/dictionaries";
import { localizeSourceSublabel } from "@/lib/localize-sublabel";
import { trackRadarEvent } from "@/lib/analytics";
import {
  getTopicCopy,
  isValidTopicSlug,
  type TopicSlug,
} from "@/lib/seo-taxonomy";
import { resolveSignalLinks } from "@/lib/signal-meta";
import {
  buildSignalPermalink,
  cn,
  formatSignalShareBrief,
  resolveOriginalSubtitle,
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
  launch: "border-l-amber-500 dark:border-l-amber-400",
  pain_point: "border-l-blue-600 dark:border-l-blue-400",
  ai_trend: "border-l-slate-500 dark:border-l-slate-400",
};

const MAX_DISPLAY_TAGS = 3;

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
  const lens = getCardLensLabels(dict, item.category);

  const metricBadgeClass =
    item.metricType === "revenue"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
      : item.metricType === "pain"
        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30"
        : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30";

  const scoreText = item.score.toFixed(1);
  const isTopPick = item.isTopPick;
  const displaySublabel = localizeSourceSublabel(item.sourceSublabel, locale);
  const origSubtitle = resolveOriginalSubtitle({
    locale,
    title: item.title,
    titleOrig: item.titleOrig,
  });
  const safeSourceUrl = toSafeHttpUrl(item.sourceUrl);
  const { productUrl, discussionUrl } = resolveSignalLinks({
    sourcePlatform: item.sourcePlatform,
    sourceUrl: item.sourceUrl,
    meta: {
      productUrl: item.productUrl,
      discussionUrl: item.discussionUrl,
    },
  });
  const detailHref = `/${locale}/signal/${encodeURIComponent(item.id)}`;

  const visibleTags = item.tags.slice(0, MAX_DISPLAY_TAGS);
  const topicPills = (item.topics ?? [])
    .filter((slug): slug is TopicSlug => isValidTopicSlug(slug))
    .slice(0, 2);

  const lensRowLayoutClass =
    locale === "en"
      ? "sm:grid sm:grid-cols-[7.75rem_minmax(0,1fr)] sm:items-baseline sm:gap-2"
      : "sm:grid sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-baseline sm:gap-2";

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
      whatItIsLabel: lens.whatItIs,
      whatItIs: item.whatItIs,
      monetizationLabel: lens.monetization,
      businessSignal: item.businessSignal,
      playbookLabel: lens.playbook,
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
        "group scroll-mt-28 rounded-xl border bg-white p-4 sm:p-5 transition-all duration-300 dark:bg-[#111827]",
        isHighlighted
          ? "border-blue-500 ring-2 ring-blue-500/30 shadow-md dark:border-blue-400 dark:ring-blue-400/30"
          : "border-slate-200/90 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-700"
      )}
    >
      {/* 第 1 层：精简顶栏元数据（信源 + 分类 + 核心指标胶囊 + 分级评分徽章） */}
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
          {item.ageBadge && (
            <span className="rounded border border-slate-200/80 bg-slate-50/90 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-slate-500 tabular-nums dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-400">
              {item.ageBadge}
            </span>
          )}
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

        <div className="flex items-center gap-1.5 tabular-nums">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] font-semibold",
              metricBadgeClass
            )}
          >
            {item.metricsBadge}
          </span>
          <span
            data-top-pick={isTopPick ? "true" : undefined}
            title={
              isTopPick ? dict.topPickTooltip(scoreText) : dict.scoreTooltip
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
              isTopPick
                ? "border-orange-200/90 bg-orange-50/85 font-bold text-orange-800 dark:border-orange-500/35 dark:bg-orange-500/15 dark:text-orange-300"
                : "border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
            )}
          >
            {isTopPick && (
              <Flame
                className="h-3 w-3 shrink-0 text-orange-500 dark:text-orange-400"
                aria-hidden="true"
              />
            )}
            <span>{scoreText}</span>
          </span>
        </div>
      </div>

      {/* 第 2 层：当前语种主标题（进入站内独立详情页）+ 跨语种原名对照（英文站自动隐去重复原题） */}
      <div className="mb-3.5">
        <h3 className="text-[16.5px] font-semibold leading-snug">
          <Link
            href={detailHref}
            title={dict.readDetail}
            onClick={() =>
              trackRadarEvent("signal_detail_click", {
                signal_id: item.id,
                platform: item.sourcePlatform,
                category: item.category,
                score: item.score,
                locale,
              })
            }
            className="block text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-50 dark:group-hover:text-blue-400"
          >
            {item.title}
          </Link>
        </h3>
        {origSubtitle && (
          <p className="mt-1 line-clamp-1 text-[12.5px] text-slate-400 dark:text-slate-500">
            {origSubtitle}
          </p>
        )}
      </div>

      {/* 第 3 层：按分类自适应语义的商业透镜三要素（移动端全宽流式，桌面端严整双栏对齐） */}
      <div
        className={cn(
          "mb-3.5 space-y-2 rounded-lg border border-slate-200/70 border-l-[3px] bg-slate-50/85 p-3.5 text-[13.5px] leading-relaxed dark:border-slate-800/90 dark:bg-slate-900/60",
          borderLeftClass
        )}
      >
        <div className={lensRowLayoutClass}>
          <span className="mr-1.5 font-semibold text-slate-700 sm:mr-0 dark:text-slate-300">
            {lens.whatItIs}
          </span>
          <span className="text-slate-600 dark:text-slate-300">
            {item.whatItIs}
          </span>
        </div>
        <div className={lensRowLayoutClass}>
          <span className="mr-1.5 font-semibold text-slate-700 sm:mr-0 dark:text-slate-300">
            {lens.monetization}
          </span>
          <span className="text-slate-600 tabular-nums dark:text-slate-300">
            {item.businessSignal}
          </span>
        </div>
        <div
          className={cn(
            "border-t border-slate-200/60 pt-2 dark:border-slate-800/80",
            lensRowLayoutClass
          )}
        >
          <span className="mr-1.5 font-semibold text-slate-900 sm:mr-0 dark:text-slate-100">
            {lens.playbook}
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-100">
            {item.indieTakeaway}
          </span>
        </div>
      </div>

      {/* 第 4 层：双层视觉分离标签（静态不可点击 #标签 | 圆角蓝底常青专题胶囊 ↗）+ 双轨外链与操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="select-none rounded bg-slate-100/80 px-1.5 py-0.5 text-[11.5px] font-medium text-slate-500 dark:bg-slate-800/75 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}

          {visibleTags.length > 0 && topicPills.length > 0 && (
            <span
              aria-hidden="true"
              className="mx-0.5 h-3 w-px bg-slate-200 dark:bg-slate-700/80"
            />
          )}

          {topicPills.map((slug) => {
            const isCurrent = activeTopicSlug === slug;
            const topicCopy = getTopicCopy(slug, locale);
            if (isCurrent) {
              return (
                <span
                  key={slug}
                  aria-current="page"
                  title={topicCopy.label}
                  className="inline-flex items-center rounded-full border border-blue-400/70 bg-blue-100/70 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 dark:border-blue-400/50 dark:bg-blue-500/20 dark:text-blue-200"
                >
                  {topicCopy.shortLabel}
                </span>
              );
            }
            return (
              <Link
                key={slug}
                href={`/${locale}/topic/${slug}`}
                target="_blank"
                rel="noopener"
                prefetch={false}
                title={topicCopy.h1}
                onClick={() =>
                  trackRadarEvent("topic_hub_click", {
                    topic_slug: slug,
                    signal_id: item.id,
                    locale,
                    placement: "card",
                  })
                }
                className="inline-flex items-center gap-0.5 rounded-full border border-blue-200/80 bg-blue-50/55 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100/70 hover:text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/35 dark:text-blue-300 dark:hover:border-blue-400/50 dark:hover:bg-blue-950/60 dark:hover:text-blue-200"
              >
                <span>{topicCopy.shortLabel}</span>
                <ArrowUpRight
                  className="h-3 w-3 opacity-75"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyBrief}
            aria-label={copied ? dict.copiedBrief : dict.copyBriefTooltip}
            title={copied ? dict.copiedBrief : dict.copyBriefTooltip}
            className={cn(
              "inline-flex h-7 items-center justify-center rounded-md text-xs font-medium transition-colors cursor-pointer",
              copied
                ? "gap-1 bg-emerald-50 px-2 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            )}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{dict.copiedBrief}</span>
              </>
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            aria-pressed={isBookmarked}
            aria-label={isBookmarked ? dict.saved : dict.save}
            title={isBookmarked ? dict.saved : dict.save}
            onClick={() => onToggleBookmark(item)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer",
              isBookmarked
                ? "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/25"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Bookmark
              className={cn("h-3.5 w-3.5", isBookmarked && "fill-current")}
            />
          </button>

          {discussionUrl && productUrl ? (
            <>
              <a
                href={discussionUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackRadarEvent("signal_outbound_click", {
                    signal_id: item.id,
                    platform: item.sourcePlatform,
                    category: item.category,
                    score: item.score,
                    locale,
                    placement: "discussion_button",
                  })
                }
                className="ml-0.5 inline-flex h-7 items-center gap-1 rounded-md border border-slate-200/90 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <span>{dict.viewSource}</span>
                <ExternalLink className="h-3 w-3 opacity-80" />
              </a>

              <a
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackRadarEvent("signal_outbound_click", {
                    signal_id: item.id,
                    platform: item.sourcePlatform,
                    category: item.category,
                    score: item.score,
                    locale,
                    placement: "product_button",
                  })
                }
                className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200/95 bg-blue-50/75 px-2.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100/80 hover:text-blue-800 dark:border-blue-500/35 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:border-blue-400/50 dark:hover:bg-blue-950/65 dark:hover:text-blue-200"
              >
                <span>{dict.visitProduct}</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </>
          ) : (
            <a
              href={productUrl ?? discussionUrl ?? safeSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackRadarEvent("signal_outbound_click", {
                  signal_id: item.id,
                  platform: item.sourcePlatform,
                  category: item.category,
                  score: item.score,
                  locale,
                  placement: productUrl ? "product_button" : "button",
                })
              }
              className="ml-0.5 inline-flex h-7 items-center gap-1 rounded-md border border-slate-200/95 bg-slate-50/90 px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/80 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800/85 dark:text-slate-200 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/45 dark:hover:text-blue-300"
            >
              <span>{productUrl ? dict.visitProduct : dict.viewSource}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
