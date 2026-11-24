"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Calendar,
  Check,
  Compass,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  Monitor,
  Moon,
  Radar,
  Rss,
  Sun,
} from "lucide-react";
import { NewsletterSubscribeCard } from "@/components/newsletter-subscribe-card";
import { PLATFORM_META, SignalCard } from "@/components/signal-card";
import {
  buildLocalePath,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
} from "@/i18n/config";
import { getCardLensLabels, getDictionary } from "@/i18n/dictionaries";
import { localizeSourceSublabel } from "@/lib/localize-sublabel";
import { trackRadarEvent } from "@/lib/analytics";
import {
  getTopicCopy,
  isValidTopicSlug,
  type TopicSlug,
} from "@/lib/seo-taxonomy";
import { resolveSignalLinks } from "@/lib/signal-meta";
import type { SignalDetailPayload } from "@/lib/signals-repo";
import {
  getNextThemeMode,
  LEGACY_THEME_STORAGE_KEY,
  normalizeThemeMode,
  resolveEffectiveDark,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/theme";
import {
  buildSignalDetailUrl,
  cn,
  formatSignalShareBrief,
  resolveOriginalSubtitle,
  toSafeHttpUrl,
} from "@/lib/utils";
import type { SignalCategory, SignalItem } from "@/types/signal";

const SAVED_ITEMS_STORAGE_KEY = "afr-saved-items";
const LEGACY_BOOKMARKS_STORAGE_KEY = "indieradar-bookmarks";

const CATEGORY_BORDER_CLASS: Record<SignalCategory, string> = {
  revenue: "border-l-emerald-500 dark:border-l-emerald-400",
  launch: "border-l-amber-500 dark:border-l-amber-400",
  pain_point: "border-l-blue-600 dark:border-l-blue-400",
  ai_trend: "border-l-slate-500 dark:border-l-slate-400",
};

function persistLocaleCookie(nextLocale: Locale) {
  const secureAttr =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax${secureAttr}`;
}

export function SignalDetailView({
  payload,
}: {
  payload: SignalDetailPayload;
}) {
  const { locale, item, relatedItems, hubDirectory, latestDateKey } = payload;
  const dict = useMemo(() => getDictionary(locale), [locale]);
  const lens = getCardLensLabels(dict.card, item.category);

  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [themeHydrated, setThemeHydrated] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [savedSnapshots, setSavedSnapshots] = useState<
    Record<string, SignalItem>
  >({});
  const [copied, setCopied] = useState(false);
  const langPickerRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const savedTheme =
        localStorage.getItem(THEME_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      const initialMode = normalizeThemeMode(savedTheme);
      setThemeMode(initialMode);
      setThemeHydrated(true);
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      document.documentElement.classList.toggle(
        "dark",
        resolveEffectiveDark(initialMode, prefersDark)
      );
    } catch {
      setThemeHydrated(true);
    }

    try {
      const rawSnapshots = JSON.parse(
        localStorage.getItem(SAVED_ITEMS_STORAGE_KEY) || "{}"
      );
      if (rawSnapshots && typeof rawSnapshots === "object") {
        setSavedSnapshots(rawSnapshots as Record<string, SignalItem>);
      }
    } catch {
      // ignore invalid json
    }

    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!langMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        langPickerRef.current &&
        !langPickerRef.current.contains(e.target as Node)
      ) {
        setLangMenuOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLangMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [langMenuOpen]);

  const selectThemeMode = (nextMode: ThemeMode) => {
    setThemeMode(nextMode);
    setThemeHydrated(true);
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    document.documentElement.classList.toggle(
      "dark",
      resolveEffectiveDark(nextMode, prefersDark)
    );
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextMode);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const toggleBookmark = (targetItem: SignalItem) => {
    const willSave = !Boolean(savedSnapshots[targetItem.id]);
    trackRadarEvent("signal_bookmark", {
      signal_id: targetItem.id,
      platform: targetItem.sourcePlatform,
      category: targetItem.category,
      action: willSave ? "save" : "remove",
      locale,
    });
    setSavedSnapshots((prev) => {
      const next = { ...prev };
      if (next[targetItem.id]) {
        delete next[targetItem.id];
      } else {
        next[targetItem.id] = targetItem;
      }
      try {
        localStorage.setItem(SAVED_ITEMS_STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem(
          LEGACY_BOOKMARKS_STORAGE_KEY,
          JSON.stringify(Object.keys(next))
        );
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const handleCopyShareBrief = async () => {
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const origin =
      configuredOrigin ||
      (typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://radar.aibuildon.com");

    const detailUrl = buildSignalDetailUrl({
      siteUrl: origin,
      locale,
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
      shareLinkLabel: dict.card.shareLinkLabel,
      permalink: detailUrl,
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

  const platform = PLATFORM_META[item.sourcePlatform] ?? {
    label: item.sourcePlatform,
    dotClass: "bg-slate-400",
  };
  const categoryLabel =
    dict.card.categories[item.category] ?? dict.card.categories.launch;
  const borderLeftClass =
    CATEGORY_BORDER_CLASS[item.category] ?? CATEGORY_BORDER_CLASS.launch;
  const metricBadgeClass =
    item.metricType === "revenue"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
      : item.metricType === "pain"
        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30"
        : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30";

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

  const issueHref = buildLocalePath(locale, item.dateKey, latestDateKey);
  const isBookmarked = Boolean(savedSnapshots[item.id]);
  const scoreText = item.score.toFixed(1);
  const topicPills = (item.topics ?? []).filter((slug): slug is TopicSlug =>
    isValidTopicSlug(slug)
  );
  const displayedThemeMode: ThemeMode = themeHydrated ? themeMode : "system";
  const themeLabel =
    displayedThemeMode === "light"
      ? dict.header.themeLight
      : displayedThemeMode === "dark"
        ? dict.header.themeDark
        : dict.header.themeSystem;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 transition-colors dark:bg-[#090D16] dark:text-slate-100">
      {/* 顶栏 */}
      <header className="sticky top-0 z-40 h-14 border-b border-slate-200/90 bg-white/85 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#090D16]/85">
        <div className="mx-auto flex h-full max-w-[1040px] items-center justify-between gap-2.5 px-4 sm:px-6">
          <Link
            href={`/${locale}`}
            prefetch={true}
            className="flex shrink-0 items-center gap-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-blue-600">
              <Radar className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight">
              AI Founder Radar
            </span>
          </Link>

          <Link
            href={issueHref}
            prefetch={true}
            className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-blue-600 sm:inline-flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-400"
          >
            {dict.signalDetail.backToIssue(item.dateKey)}
          </Link>

          <div className="flex items-center gap-2">
            <div ref={langPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen((prev) => !prev)}
                aria-expanded={langMenuOpen}
                aria-haspopup="listbox"
                aria-label={dict.header.switchLang}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 sm:px-3 cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <Globe className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                <span>{LOCALE_LABELS[locale].short}</span>
              </button>

              {langMenuOpen && (
                <div
                  role="listbox"
                  aria-label={dict.header.languageMenuTitle}
                  className="absolute right-0 top-full z-50 mt-2 w-44 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-[#111827]"
                >
                  {LOCALES.map((loc) => {
                    const active = loc === locale;
                    return (
                      <Link
                        key={loc}
                        href={`/${loc}/signal/${encodeURIComponent(item.id)}`}
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          persistLocaleCookie(loc);
                          setLangMenuOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-xl px-3 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
                            : "font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                        )}
                      >
                        <span>{LOCALE_LABELS[loc].native}</span>
                        {active && (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                selectThemeMode(getNextThemeMode(displayedThemeMode))
              }
              aria-label={`${dict.header.toggleTheme}: ${themeLabel}`}
              title={`${dict.header.toggleTheme}: ${themeLabel}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {displayedThemeMode === "light" ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : displayedThemeMode === "dark" ? (
                <Moon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 面包屑导航 */}
      <div className="border-b border-slate-200/80 bg-white/60 dark:border-slate-800/70 dark:bg-[#111827]/50">
        <div className="mx-auto flex max-w-[1040px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs sm:px-6">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400"
          >
            <Link
              href={`/${locale}`}
              className="font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
            >
              {dict.hub.breadcrumbHome}
            </Link>
            <span>/</span>
            <Link
              href={issueHref}
              className="font-mono font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
            >
              {dict.signalDetail.breadcrumbDaily(item.dateKey)}
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {dict.signalDetail.breadcrumbSignal}
            </span>
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6">
        {/* 主体单条商业信号深度拆解卡 */}
        <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs sm:p-7 dark:border-slate-800 dark:bg-[#111827]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${locale}/source/${item.sourcePlatform}`}
                className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400"
              >
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", platform.dotClass)}
                />
                {platform.label}
              </Link>
              {displaySublabel && (
                <span className="text-slate-400 dark:text-slate-500">
                  · {displaySublabel}
                </span>
              )}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {categoryLabel}
              </span>
              {item.ageBadge && (
                <span className="rounded border border-slate-200/80 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 tabular-nums dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  {item.ageBadge}
                </span>
              )}
              <Link
                href={issueHref}
                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-400"
              >
                <Calendar className="h-3 w-3" />
                {item.dateKey}
              </Link>
            </div>

            <div className="flex items-center gap-2 tabular-nums">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-0.5 font-mono text-xs font-semibold",
                  metricBadgeClass
                )}
              >
                {item.metricsBadge}
              </span>
              <span
                title={
                  item.isTopPick
                    ? dict.card.topPickTooltip(scoreText)
                    : dict.card.scoreTooltip
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs",
                  item.isTopPick
                    ? "border-orange-200/90 bg-orange-50/85 font-bold text-orange-800 dark:border-orange-500/35 dark:bg-orange-500/15 dark:text-orange-300"
                    : "border-slate-200 bg-slate-50 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                )}
              >
                {item.isTopPick && (
                  <Flame className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
                )}
                <span>{scoreText}</span>
              </span>
            </div>
          </div>

          <h1 className="text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            {item.title}
          </h1>
          {origSubtitle && (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {origSubtitle}
            </p>
          )}

          {/* 深度展开版三要素拆解区 */}
          <div
            className={cn(
              "mt-5 space-y-3.5 rounded-xl border border-slate-200/80 border-l-4 bg-slate-50/90 p-4 text-[14.5px] leading-relaxed sm:p-5 dark:border-slate-800 dark:bg-slate-900/65",
              borderLeftClass
            )}
          >
            <div>
              <div className="mb-1 text-xs font-bold tracking-wide text-slate-500 dark:text-slate-400">
                {lens.whatItIs}
              </div>
              <p className="text-slate-800 dark:text-slate-200">
                {item.whatItIs}
              </p>
            </div>

            <div className="border-t border-slate-200/60 pt-3 dark:border-slate-800/80">
              <div className="mb-1 text-xs font-bold tracking-wide text-slate-500 dark:text-slate-400">
                {lens.monetization}
              </div>
              <p className="text-slate-800 tabular-nums dark:text-slate-200">
                {item.businessSignal}
              </p>
            </div>

            <div className="border-t border-slate-200/60 pt-3 dark:border-slate-800/80">
              <div className="mb-1 text-xs font-bold tracking-wide text-blue-700 dark:text-blue-400">
                {lens.playbook}
              </div>
              <p className="font-medium text-slate-900 dark:text-white">
                {item.indieTakeaway}
              </p>
            </div>
          </div>

          {/* 标签与常青赛道专题胶囊 */}
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="select-none rounded bg-slate-100/90 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              >
                {tag}
              </span>
            ))}

            {item.tags.length > 0 && topicPills.length > 0 && (
              <span
                aria-hidden="true"
                className="mx-1 h-3.5 w-px bg-slate-200 dark:bg-slate-700"
              />
            )}

            {topicPills.map((slug) => {
              const topicCopy = getTopicCopy(slug, locale);
              return (
                <Link
                  key={slug}
                  href={`/${locale}/topic/${slug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200/85 bg-blue-50/60 px-2.5 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100/80 dark:border-blue-500/30 dark:bg-blue-950/35 dark:text-blue-300"
                >
                  <span>{topicCopy.label}</span>
                  <ArrowUpRight className="h-3 w-3 opacity-75" />
                </Link>
              );
            })}
          </div>

          {/* 双轨外链与分享/收藏动作栏 */}
          <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-5 dark:border-slate-800/90">
            {productUrl && (
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
                    placement: "detail_product_cta",
                  })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <span>{dict.signalDetail.visitProductCta}</span>
                <ArrowUpRight className="h-4 w-4" />
              </a>
            )}

            {(discussionUrl || (!productUrl && safeSourceUrl !== "#")) && (
              <a
                href={discussionUrl ?? safeSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackRadarEvent("signal_outbound_click", {
                    signal_id: item.id,
                    platform: item.sourcePlatform,
                    category: item.category,
                    score: item.score,
                    locale,
                    placement: "detail_source_cta",
                  })
                }
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-4 text-xs font-semibold transition-colors",
                  productUrl
                    ? "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
                    : "border-slate-900 bg-slate-900 text-white hover:bg-blue-600 hover:border-blue-600 dark:border-blue-500 dark:bg-blue-600"
                )}
              >
                <span>{dict.signalDetail.viewOriginalCta}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={handleCopyShareBrief}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition-colors cursor-pointer",
                copied
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
              )}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>
                {copied ? dict.card.copiedBrief : dict.signalDetail.copyShareCta}
              </span>
            </button>

            <button
              type="button"
              onClick={() => toggleBookmark(item)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition-colors cursor-pointer",
                isBookmarked
                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
              )}
            >
              <Bookmark
                className={cn("h-3.5 w-3.5", isBookmarked && "fill-current")}
              />
              <span>{isBookmarked ? dict.card.saved : dict.card.save}</span>
            </button>
          </div>
        </article>

        {/* 同赛道延伸商业案例内链推荐 */}
        {relatedItems.length > 0 && (
          <section className="mt-8">
            <div className="mb-3.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {dict.signalDetail.relatedHeading}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {dict.signalDetail.relatedSubnote}
              </p>
            </div>
            <div className="space-y-3.5">
              {relatedItems.map((rel) => (
                <SignalCard
                  key={rel.id}
                  item={rel}
                  locale={locale}
                  dict={dict.card}
                  isBookmarked={Boolean(savedSnapshots[rel.id])}
                  hubDateHref={buildLocalePath(
                    locale,
                    rel.dateKey,
                    latestDateKey
                  )}
                  onToggleBookmark={toggleBookmark}
                />
              ))}
            </div>
          </section>
        )}

        {/* 详情页底部早报订阅承接卡片 */}
        <section className="mt-8">
          <NewsletterSubscribeCard
            dict={dict.sidebar}
            locale={locale}
            placement="detail"
          />
        </section>

        {/* 常青赛道专题内链目录 */}
        {hubDirectory.topics.length > 0 && (
          <section className="mt-10 rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-[#111827]">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Compass className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              {dict.hub.directoryTopicsTitle}
            </h2>
            <div className="flex flex-wrap gap-2">
              {hubDirectory.topics.map(({ slug, count }) => {
                const topicCopy = getTopicCopy(slug, locale);
                return (
                  <Link
                    key={slug}
                    href={`/${locale}/topic/${slug}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 tabular-nums dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                  >
                    <span>{topicCopy.label}</span>
                    <span className="rounded bg-white px-1.5 py-0.2 font-mono text-[10.5px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {count}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <footer className="mt-10 border-t border-slate-200/80 pt-6 pb-10 text-center text-xs text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          <div className="mb-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 font-medium text-slate-500 dark:text-slate-400">
            <a
              href={`/${locale}/feed.xml`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-orange-600 dark:hover:text-orange-400"
            >
              <Rss className="h-3.5 w-3.5" />
              <span>{dict.footer.rssLabel}</span>
            </a>
            <span>·</span>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono transition-colors hover:text-blue-600 dark:hover:text-blue-400"
            >
              {dict.footer.llmsLabel}
            </a>
            <span>·</span>
            <a
              href="https://github.com/wuyexiong/ai-founder-radar"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-slate-900 dark:hover:text-white"
            >
              <span>{dict.footer.githubLabel}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p>{dict.footer.copyright}</p>
        </footer>
      </main>
    </div>
  );
}
