"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  Mail,
  Moon,
  Radar,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { PLATFORM_META, SignalCard } from "@/components/signal-card";
import {
  buildLocalePath,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import type { RadarPagePayload } from "@/lib/signals-repo";
import { cn, toSafeHttpUrl } from "@/lib/utils";
import type {
  SignalCategory,
  SignalItem,
  SourcePlatform,
} from "@/types/signal";

type TabFilter = "top" | "all" | SignalCategory | "saved";

const PLATFORM_ORDER: SourcePlatform[] = [
  "producthunt",
  "hackernews",
  "indiehackers",
  "acquire",
  "reddit",
  "github",
  "trustmrr",
  "appstore",
];

const COLLAPSED_TAG_LIMIT = 10;

function persistLocaleCookie(nextLocale: Locale) {
  const secureAttr =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax${secureAttr}`;
}

export function RadarBoard({ payload }: { payload: RadarPagePayload }) {
  const {
    locale,
    availableDates,
    activeDate,
    overview,
    items,
    tools,
    storageMode,
  } = payload;

  const dict = useMemo(() => getDictionary(locale), [locale]);
  const latestDate = availableDates[0];

  const tabs: Array<{ id: TabFilter; label: string; icon: React.ReactNode }> =
    useMemo(
      () => [
        {
          id: "top",
          label: dict.tabs.top,
          icon: <Flame className="h-3.5 w-3.5 text-orange-500" />,
        },
        {
          id: "all",
          label: dict.tabs.all,
          icon: <Layers className="h-3.5 w-3.5" />,
        },
        {
          id: "revenue",
          label: dict.tabs.revenue,
          icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />,
        },
        {
          id: "launch",
          label: dict.tabs.launch,
          icon: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
        },
        {
          id: "pain_point",
          label: dict.tabs.pain_point,
          icon: <Target className="h-3.5 w-3.5 text-blue-500" />,
        },
      ],
      [dict]
    );

  const [activeTab, setActiveTab] = useState<TabFilter>("top");
  const [activePlatform, setActivePlatform] = useState<SourcePlatform | null>(
    null
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化主题与本地收藏夹
  useEffect(() => {
    const savedTheme = localStorage.getItem("indieradar-theme");
    const prefersDark =
      savedTheme === "dark" ||
      (!savedTheme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);

    try {
      const savedIds = JSON.parse(
        localStorage.getItem("indieradar-bookmarks") || "[]"
      );
      if (Array.isArray(savedIds)) setBookmarks(savedIds);
    } catch {
      // ignore invalid json
    }

    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // ⌘K 快捷键聚焦搜索框
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("indieradar-theme", next ? "dark" : "light");
  };

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
      localStorage.setItem("indieradar-bookmarks", JSON.stringify(next));
      return next;
    });
  };

  // 日期前后切换计算（availableDates 按最新在前排列）
  const currentDateIdx = availableDates.indexOf(activeDate);
  const olderDate =
    currentDateIdx >= 0 && currentDateIdx < availableDates.length - 1
      ? availableDates[currentDateIdx + 1]
      : null;
  const newerDate =
    currentDateIdx > 0 ? availableDates[currentDateIdx - 1] : null;

  // 第一级过滤：按当前频道 Tab 过滤的基础集合
  const tabScopedItems = useMemo(() => {
    return items.filter((item) => {
      if (activeTab === "top") return item.isTopPick;
      if (activeTab === "saved") return bookmarks.includes(item.id);
      if (activeTab === "all") return true;
      return item.category === activeTab;
    });
  }, [items, activeTab, bookmarks]);

  // 信源平台计数
  const platformOptions = useMemo(() => {
    const totalByPlat = new Map<SourcePlatform, number>();
    const tabByPlat = new Map<SourcePlatform, number>();

    for (const item of items) {
      totalByPlat.set(
        item.sourcePlatform,
        (totalByPlat.get(item.sourcePlatform) ?? 0) + 1
      );
    }
    for (const item of tabScopedItems) {
      tabByPlat.set(
        item.sourcePlatform,
        (tabByPlat.get(item.sourcePlatform) ?? 0) + 1
      );
    }

    return PLATFORM_ORDER.filter((p) => (totalByPlat.get(p) ?? 0) > 0).map(
      (p) => ({
        platform: p,
        tabCount: tabByPlat.get(p) ?? 0,
        totalCount: totalByPlat.get(p) ?? 0,
      })
    );
  }, [items, tabScopedItems]);

  // 第二级过滤：叠加信源平台后的集合
  const platformScopedItems = useMemo(() => {
    if (!activePlatform) return tabScopedItems;
    return tabScopedItems.filter(
      (item) => item.sourcePlatform === activePlatform
    );
  }, [tabScopedItems, activePlatform]);

  // 动态切口标签统计
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of platformScopedItems) {
      for (const tag of item.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [platformScopedItems]);

  const displayedTags = useMemo(() => {
    if (tagsExpanded || tagCounts.length <= COLLAPSED_TAG_LIMIT) {
      return tagCounts;
    }
    const topSlice = tagCounts.slice(0, COLLAPSED_TAG_LIMIT);
    if (activeTag && !topSlice.some(([t]) => t === activeTag)) {
      const activeEntry = tagCounts.find(([t]) => t === activeTag);
      if (activeEntry) {
        return [...topSlice.slice(0, COLLAPSED_TAG_LIMIT - 1), activeEntry];
      }
    }
    return topSlice;
  }, [tagCounts, tagsExpanded, activeTag]);

  // 最终列表过滤
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return platformScopedItems.filter((item) => {
      if (activeTag && !item.tags.includes(activeTag)) return false;
      if (!q) return true;

      const haystack = [
        item.title,
        item.titleZh,
        item.titleOrig,
        item.whatItIs,
        item.businessSignal,
        item.indieTakeaway,
        item.metricsBadge,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [platformScopedItems, activeTag, searchQuery]);

  const topThreeItems = useMemo(() => {
    return [...items].sort((a, b) => b.score - a.score).slice(0, 3);
  }, [items]);

  const handleSelectPlatform = (p: SourcePlatform) => {
    if (activePlatform === p) {
      setActivePlatform(null);
      return;
    }
    const hasInCurrentTab = tabScopedItems.some((i) => i.sourcePlatform === p);
    if (!hasInCurrentTab) {
      setActiveTab("all");
    }
    setActivePlatform(p);
    if (
      activeTag &&
      !items.some((i) => i.sourcePlatform === p && i.tags.includes(activeTag))
    ) {
      setActiveTag(null);
    }
  };

  const handleSelectTag = (tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null);
      return;
    }
    setActiveTag(tag);
    const hasInScoped = platformScopedItems.some((i) => i.tags.includes(tag));
    if (!hasInScoped) {
      setActiveTab("all");
      setActivePlatform(null);
    }
  };

  // 右侧 Top 3 点击联动
  const handleFocusTopItem = (targetItem: SignalItem) => {
    const isCurrentlyVisible = filteredItems.some(
      (i) => i.id === targetItem.id
    );
    if (!isCurrentlyVisible) {
      setActiveTab(targetItem.isTopPick ? "top" : "all");
      setActivePlatform(null);
      setActiveTag(null);
      setSearchQuery("");
    }

    setHighlightedId(targetItem.id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedId(null);
    }, 2200);

    setTimeout(() => {
      const el = document.getElementById(targetItem.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const hasSubFilters = Boolean(
    activePlatform || activeTag || searchQuery.trim()
  );

  const resetSubFilters = () => {
    setActivePlatform(null);
    setActiveTag(null);
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 transition-colors dark:bg-[#090D16] dark:text-slate-100">
      {/* Sticky 顶栏 (56px) */}
      <header className="sticky top-0 z-40 h-14 border-b border-slate-200/90 bg-white/85 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#090D16]/85">
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-2.5 px-4 sm:px-6">
          {/* 品牌标识 */}
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2.5 shrink-0"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-blue-600">
              <Radar className="h-4 w-4" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold tracking-tight">
                AI Founder Radar
              </span>
              <span className="hidden text-xs font-medium text-slate-500 lg:inline dark:text-slate-400">
                {dict.header.tagline}
              </span>
            </div>
          </Link>

          {/* 中间：独立静态归档路由日期切换器 */}
          <nav
            aria-label="Daily archive navigation"
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs font-medium tabular-nums dark:border-slate-800 dark:bg-slate-900"
          >
            {olderDate ? (
              <Link
                href={buildLocalePath(locale, olderDate, latestDate)}
                title={dict.header.viewDate(olderDate)}
                className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="p-1 text-slate-300 dark:text-slate-700">
                <ChevronLeft className="h-3.5 w-3.5" />
              </span>
            )}

            <span className="px-1.5 font-mono font-semibold text-slate-800 sm:px-2 dark:text-slate-200">
              {activeDate}
              {activeDate === latestDate && (
                <span className="ml-1.5 hidden rounded bg-emerald-500/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-emerald-700 sm:inline dark:text-emerald-300">
                  {dict.header.latestBadge}
                </span>
              )}
            </span>

            {newerDate ? (
              <Link
                href={buildLocalePath(locale, newerDate, latestDate)}
                title={dict.header.viewDate(newerDate)}
                className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="p-1 text-slate-300 dark:text-slate-700">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            )}
          </nav>

          {/* 右侧：搜索框 + 四语种切换胶囊 + 收藏夹 + 主题切换 */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={dict.header.searchDesktop}
                className="h-8 w-44 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none xl:w-56 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* 四语种直达胶囊切换器（爬虫友好 <a href> + Cookie 记忆） */}
            <div
              role="navigation"
              aria-label={dict.header.switchLang}
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold dark:border-slate-800 dark:bg-slate-900"
            >
              <Globe className="mx-1 hidden h-3.5 w-3.5 text-slate-400 sm:inline" />
              {LOCALES.map((loc) => {
                const active = loc === locale;
                const info = LOCALE_LABELS[loc];
                return (
                  <Link
                    key={loc}
                    href={buildLocalePath(loc, activeDate, latestDate)}
                    onClick={() => persistLocaleCookie(loc)}
                    title={info.native}
                    className={cn(
                      "rounded-md px-1.5 py-1 leading-none transition-colors sm:px-2",
                      active
                        ? "bg-white text-slate-900 shadow-2xs dark:bg-blue-600 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    )}
                  >
                    {info.short}
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                setActiveTab((prev) => (prev === "saved" ? "top" : "saved"))
              }
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium tabular-nums transition-colors sm:px-2.5 cursor-pointer",
                activeTab === "saved"
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              )}
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{dict.header.saved}</span>
              <span className="font-mono">{bookmarks.length}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dict.header.toggleTheme}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 紧凑单行情报概览条 */}
      <div className="border-b border-slate-200/80 bg-white/60 dark:border-slate-800/70 dark:bg-[#111827]/50">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white tabular-nums">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {dict.overview.scannedSummary(
                overview.scannedCount,
                items.length
              )}
            </span>
            <span className="hidden text-slate-300 sm:inline dark:text-slate-700">
              |
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              {dict.overview.estReadTime(overview.estimatedReadMinutes)}
            </span>
          </div>

          {(storageMode === "supabase" ||
            process.env.NODE_ENV !== "production") && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium",
                  storageMode === "supabase"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {storageMode === "supabase"
                  ? dict.overview.storageCloud
                  : dict.overview.storageLocal}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 主体双栏容器 */}
      <main className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
        <h1 className="sr-only">{dict.overview.headingSrOnly(activeDate)}</h1>

        {/* 当日主编一句话风向总结 */}
        {overview.summaryNote && (
          <div className="mb-4 rounded-xl border border-blue-200/80 bg-blue-50/60 px-4 py-2.5 text-[13.5px] text-slate-700 dark:border-blue-500/20 dark:bg-blue-950/25 dark:text-slate-300">
            <span className="font-semibold text-blue-700 dark:text-blue-400">
              {dict.overview.editorialPrefix}
            </span>
            {overview.summaryNote}
          </div>
        )}

        {/* 移动端搜索框 */}
        <div className="mb-4 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={dict.header.searchMobile}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs dark:border-slate-800 dark:bg-[#111827]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* 左侧主信号流 (8 cols) */}
          <div className="lg:col-span-8">
            {/* 一级粘性栏：五大核心信号频道切换 */}
            <div className="no-scrollbar sticky top-14 z-30 -mx-4 mb-2.5 flex items-center gap-1.5 overflow-x-auto bg-[#F8FAFC]/95 px-4 py-2 backdrop-blur-sm sm:mx-0 sm:px-0 dark:bg-[#090D16]/95">
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                const count =
                  tab.id === "top"
                    ? items.filter((i) => i.isTopPick).length
                    : tab.id === "all"
                      ? items.length
                      : items.filter((i) => i.category === tab.id).length;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (
                        activePlatform &&
                        tab.id !== "all" &&
                        !items.some(
                          (i) =>
                            i.sourcePlatform === activePlatform &&
                            (tab.id === "top"
                              ? i.isTopPick
                              : tab.id === "saved"
                                ? bookmarks.includes(i.id)
                                : i.category === tab.id)
                        )
                      ) {
                        setActivePlatform(null);
                      }
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer tabular-nums",
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-xs dark:border-blue-500 dark:bg-blue-600 dark:text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-300 dark:hover:border-slate-700"
                    )}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.2 font-mono text-[11px]",
                        active
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 二级紧凑联动筛选台 */}
            <div className="mb-4 rounded-xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
                    {dict.filters.sourcesLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePlatform(null)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer tabular-nums",
                      activePlatform === null
                        ? "bg-slate-900 text-white dark:bg-blue-600 dark:text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    )}
                  >
                    {dict.filters.allSources}
                    <span className="font-mono text-[10px] opacity-75">
                      {tabScopedItems.length}
                    </span>
                  </button>

                  {platformOptions.map(
                    ({ platform, tabCount, totalCount }) => {
                      const meta = PLATFORM_META[platform] ?? {
                        label: platform,
                        dotClass: "bg-slate-400",
                      };
                      const selected = activePlatform === platform;
                      const displayCount =
                        tabCount > 0 ? tabCount : totalCount;
                      const dimmed = tabCount === 0 && !selected;

                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => handleSelectPlatform(platform)}
                          title={
                            tabCount === 0
                              ? dict.filters.crossTabHint(totalCount)
                              : dict.filters.filterPlatform(meta.label)
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer tabular-nums",
                            selected
                              ? "bg-slate-900 text-white dark:bg-blue-600 dark:text-white"
                              : dimmed
                                ? "bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:bg-slate-800/40 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              selected ? "bg-white" : meta.dotClass
                            )}
                          />
                          <span>{meta.label}</span>
                          <span className="font-mono text-[10px] opacity-70">
                            {displayCount}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>

                {hasSubFilters && (
                  <button
                    type="button"
                    onClick={resetSubFilters}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {dict.filters.clearFilters}
                  </button>
                )}
              </div>

              {/* 切口标签行 */}
              {tagCounts.length > 0 && (
                <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800/80">
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-1.5",
                      tagsExpanded &&
                        "thin-scrollbar max-h-44 overflow-y-auto pr-1"
                    )}
                  >
                    <span className="mr-0.5 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
                      {dict.filters.anglesLabel}
                    </span>
                    {displayedTags.map(([tag, count]) => {
                      const selected = activeTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleSelectTag(tag)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer tabular-nums",
                            selected
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100/90 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-700"
                          )}
                        >
                          <span>{tag}</span>
                          <span className="font-mono text-[10px] opacity-70">
                            {count}
                          </span>
                        </button>
                      );
                    })}

                    {tagCounts.length > COLLAPSED_TAG_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setTagsExpanded((prev) => !prev)}
                        className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200 cursor-pointer tabular-nums"
                      >
                        {tagsExpanded ? (
                          <>
                            {dict.filters.collapseAngles}
                            <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            {dict.filters.expandAngles(
                              tagCounts.length - COLLAPSED_TAG_LIMIT
                            )}
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 信号卡片列表 */}
            {filteredItems.length > 0 ? (
              <div className="space-y-3.5">
                {filteredItems.map((item) => (
                  <SignalCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    dict={dict.card}
                    isBookmarked={bookmarks.includes(item.id)}
                    isHighlighted={highlightedId === item.id}
                    activeTag={activeTag}
                    onToggleBookmark={toggleBookmark}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-[#111827]">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {activeTab === "saved"
                    ? dict.filters.emptySaved
                    : dict.filters.emptyFiltered}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("all");
                    setActivePlatform(null);
                    setActiveTag(null);
                    setSearchQuery("");
                  }}
                  className="mt-3 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white dark:bg-blue-600 cursor-pointer"
                >
                  {dict.filters.resetAll}
                </button>
              </div>
            )}
          </div>

          {/* 右侧粘性辅助边栏 (4 cols) */}
          <aside className="lg:col-span-4">
            <div className="thin-scrollbar space-y-3.5 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:pr-0.5">
              {/* 模块 1：当日高分 Top 3 速览 */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <h2 className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>{dict.sidebar.top3Title}</span>
                  <span className="font-mono text-[11px] font-normal">
                    {dict.sidebar.top3Locate}
                  </span>
                </h2>
                <div className="space-y-1.5">
                  {topThreeItems.map((item, idx) => {
                    const pMeta = PLATFORM_META[item.sourcePlatform];
                    const isFocused = highlightedId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleFocusTopItem(item)}
                        className={cn(
                          "group flex w-full items-start justify-between gap-2.5 rounded-lg p-1.5 text-left transition-colors cursor-pointer",
                          isFocused
                            ? "bg-blue-50/90 dark:bg-blue-950/40"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            0{idx + 1}
                          </span>
                          <div>
                            <span className="line-clamp-2 text-xs font-medium leading-snug text-slate-800 group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400">
                              {item.title}
                            </span>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                              {pMeta && (
                                <span className="inline-flex items-center gap-1">
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      pMeta.dotClass
                                    )}
                                  />
                                  {pMeta.label}
                                </span>
                              )}
                              <span>·</span>
                              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                                {item.metricsBadge}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-xs font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                          {item.score.toFixed(1)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 模块 2：出海建站零成本工具箱 */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Wrench className="h-3.5 w-3.5" />
                    {dict.sidebar.toolboxTitle}
                  </h2>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {dict.sidebar.toolboxBadge}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {tools.map((tool) => (
                    <a
                      key={tool.name}
                      href={toSafeHttpUrl(tool.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-all hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                            {tool.name}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {tool.freeTierNote}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
                          {tool.tagline}
                        </p>
                      </div>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-blue-500 dark:text-slate-600" />
                    </a>
                  ))}
                </div>
              </div>

              {/* 模块 3：每日早报邮件订阅预留位 */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  {dict.sidebar.newsletterTitle}
                </h2>
                <p className="mb-2.5 text-xs text-slate-500 dark:text-slate-400">
                  {dict.sidebar.newsletterDesc}
                </p>
                {subscribed ? (
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {dict.sidebar.newsletterSuccess}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (emailInput.trim()) setSubscribed(true);
                    }}
                    className="flex gap-1.5"
                  >
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@example.com"
                      className="h-8 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="submit"
                      className="h-8 shrink-0 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer"
                    >
                      {dict.sidebar.newsletterCta}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* 页脚 */}
        <footer className="mt-14 border-t border-slate-200/80 pt-6 pb-10 text-center text-xs text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          {dict.footer.copyright}
        </footer>
      </main>
    </div>
  );
}
