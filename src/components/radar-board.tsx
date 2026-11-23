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
import type { RadarPagePayload } from "@/lib/signals-repo";
import { cn } from "@/lib/utils";
import type { SignalCategory, SignalItem, SourcePlatform } from "@/types/signal";

type TabFilter = "top" | "all" | SignalCategory | "saved";

const TABS: Array<{ id: TabFilter; label: string; icon: React.ReactNode }> = [
  {
    id: "top",
    label: "今日必读精选",
    icon: <Flame className="h-3.5 w-3.5 text-orange-500" />,
  },
  { id: "all", label: "全部信号", icon: <Layers className="h-3.5 w-3.5" /> },
  {
    id: "revenue",
    label: "搞钱实战 & MRR",
    icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />,
  },
  {
    id: "launch",
    label: "新品首发",
    icon: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
  },
  {
    id: "pain_point",
    label: "海外痛点池",
    icon: <Target className="h-3.5 w-3.5 text-blue-500" />,
  },
];

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

export function RadarBoard({ payload }: { payload: RadarPagePayload }) {
  const { availableDates, activeDate, overview, items, tools, storageMode } =
    payload;

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

  // 信源平台计数：展示当日所有有数据的平台，同时呈现当前 Tab 内命中数与全局数
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
      (platform) => ({
        platform,
        tabCount: tabByPlat.get(platform) ?? 0,
        totalCount: totalByPlat.get(platform) ?? 0,
      })
    );
  }, [items, tabScopedItems]);

  // 第二级过滤：当前 Tab + 当前信源平台下的集合，用于实时动态计算「热门搞钱切口」
  const platformScopedItems = useMemo(() => {
    if (!activePlatform) return tabScopedItems;
    return tabScopedItems.filter((i) => i.sourcePlatform === activePlatform);
  }, [tabScopedItems, activePlatform]);

  // 实时联动标签计数（随频道与信源动态重算，杜绝点出空列表）
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of platformScopedItems) {
      for (const tag of item.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [platformScopedItems]);

  // 折叠态默认展示 Top 10 标签；若当前选中的长尾标签不在前 10，自动置顶确保可见
  const displayedTags = useMemo(() => {
    if (tagsExpanded || tagCounts.length <= COLLAPSED_TAG_LIMIT) {
      return tagCounts;
    }
    const topSlice = tagCounts.slice(0, COLLAPSED_TAG_LIMIT);
    if (activeTag && !topSlice.some(([t]) => t === activeTag)) {
      const activeEntry = tagCounts.find(([t]) => t === activeTag);
      return [
        activeEntry ?? ([activeTag, 0] as [string, number]),
        ...topSlice.slice(0, COLLAPSED_TAG_LIMIT - 1),
      ];
    }
    return topSlice;
  }, [tagCounts, tagsExpanded, activeTag]);

  // 最终展示列表（频道 × 信源 × 标签 × 搜索词）
  const filteredItems = useMemo(() => {
    return platformScopedItems.filter((item) => {
      if (activeTag && !item.tags.includes(activeTag)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${item.titleZh} ${item.titleOrig} ${item.whatItIs} ${item.businessSignal} ${item.indieTakeaway} ${item.sourcePlatform} ${item.sourceSublabel} ${item.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [platformScopedItems, activeTag, searchQuery]);

  const topThreeItems = useMemo(() => items.slice(0, 3), [items]);

  const handleSelectPlatform = (platform: SourcePlatform) => {
    if (activePlatform === platform) {
      setActivePlatform(null);
      return;
    }
    setActivePlatform(platform);
    setActiveTag(null);
    // 若在「今日必读精选」下该平台暂无 >=8.5 分卡片，自动切到「全部信号」避免出现空列表
    const hasInCurrentTab = tabScopedItems.some(
      (i) => i.sourcePlatform === platform
    );
    if (!hasInCurrentTab) {
      setActiveTab("all");
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

  // 右侧 Top 3 点击联动：跨 Tab 自动穿透还原视图 + 避开顶栏平滑滚动 + 脉冲边框高亮
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
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
          {/* 品牌标识 */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-blue-600">
              <Radar className="h-4 w-4" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold tracking-tight">
                IndieRadar
              </span>
              <span className="hidden text-xs font-medium text-slate-500 sm:inline dark:text-slate-400">
                出海搞钱与产品灵感雷达
              </span>
            </div>
          </div>

          {/* 中间：日期快速切换器 */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs font-medium tabular-nums dark:border-slate-800 dark:bg-slate-900">
            {olderDate ? (
              <Link
                href={`/?date=${olderDate}`}
                title={`查看 ${olderDate}`}
                className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="p-1 text-slate-300 dark:text-slate-700">
                <ChevronLeft className="h-3.5 w-3.5" />
              </span>
            )}

            <span className="px-2 font-mono font-semibold text-slate-800 dark:text-slate-200">
              {activeDate}
              {activeDate === availableDates[0] && (
                <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  最新
                </span>
              )}
            </span>

            {newerDate ? (
              <Link
                href={`/?date=${newerDate}`}
                title={`查看 ${newerDate}`}
                className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="p-1 text-slate-300 dark:text-slate-700">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            )}
          </div>

          {/* 右侧：搜索框 + 收藏夹 + 主题切换 */}
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜赛道、MRR、痛点... (⌘K)"
                className="h-8 w-52 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none lg:w-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
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

            <button
              type="button"
              onClick={() =>
                setActiveTab((prev) => (prev === "saved" ? "top" : "saved"))
              }
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors cursor-pointer",
                activeTab === "saved"
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              )}
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">收藏</span>
              <span className="font-mono">{bookmarks.length}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="切换深浅色主题"
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
              已扫描 {overview.scannedCount} 条海外一手信号 · 精选{" "}
              {items.length} 条商业卡片
            </span>
            <span className="hidden text-slate-300 sm:inline dark:text-slate-700">
              |
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              预计 {overview.estimatedReadMinutes} 分钟刷完
            </span>
          </div>

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
                ? "● 云端 PostgreSQL 实时库"
                : "● 本地精选样本模式（配好 .env.local 自动切云端）"}
            </span>
          </div>
        </div>
      </div>

      {/* 主体双栏容器 */}
      <main className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
        {/* 当日主编一句话风向总结 */}
        {overview.summaryNote && (
          <div className="mb-4 rounded-xl border border-blue-200/80 bg-blue-50/60 px-4 py-2.5 text-[13.5px] text-slate-700 dark:border-blue-500/20 dark:bg-blue-950/25 dark:text-slate-300">
            <span className="font-semibold text-blue-700 dark:text-blue-400">
              今日风向速览：
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
              placeholder="搜赛道、MRR、痛点关键词..."
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
              {TABS.map((tab) => {
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

            {/* 二级紧凑联动筛选台：信源平台胶囊 + Top 10 热门搞钱切口（支持折叠抽屉） */}
            <div className="mb-4 rounded-xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
              {/* 第 1 排：信源平台直达 + 一键重置 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
                    信源
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
                    全部
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
                              ? `当前频道无该源，点击自动切至全部信号查看 ${totalCount} 条`
                              : `筛选 ${meta.label}`
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
                    清空筛选
                  </button>
                )}
              </div>

              {/* 第 2 排：热门搞钱切口（默认仅展示高频 Top 10 + 展开全部折叠抽屉） */}
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
                      切口
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
                            收起切口
                            <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            +{tagCounts.length - COLLAPSED_TAG_LIMIT} 更多切口
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
                    ? "你还没有收藏任何商机卡片，看到有启发的点子可点右下角「收藏」沉淀灵感。"
                    : "没有找到匹配当前交叉筛选条件的信号卡片。"}
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
                  重置全部筛选条件
                </button>
              </div>
            )}
          </div>

          {/* 右侧粘性辅助边栏 (4 cols)：首屏一屏尽览三件套 + 小屏独立内滚兜底 */}
          <aside className="lg:col-span-4">
            <div className="thin-scrollbar space-y-3.5 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:pr-0.5">
              {/* 模块 1：当日商业价值 Top 3 速览（点击跨 Tab 穿透定位并脉冲高亮） */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <h2 className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>🏆 当日高分商机 Top 3</span>
                  <span className="font-mono text-[11px] font-normal">
                    点击定位
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
                              {item.titleZh}
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

              {/* 模块 2：出海建站免费工具箱（Affiliate 变现预留位） */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Wrench className="h-3.5 w-3.5" />
                    出海建站零成本工具箱
                  </h2>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    精选免费层
                  </span>
                </div>
                <div className="space-y-1.5">
                  {tools.map((tool) => (
                    <a
                      key={tool.name}
                      href={tool.url}
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
                  订阅每日 5 分钟出海搞钱早报
                </h2>
                <p className="mb-2.5 text-xs text-slate-500 dark:text-slate-400">
                  每天早 8 点推送当日 Top 5 验证过的海外新产品与 MRR 案例。
                </p>
                {subscribed ? (
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    ✓ 已记录邮箱预览（阶段 3 接入 Resend 后自动发信）
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
                      免费订阅
                    </button>
                  </form>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* 页脚 */}
        <footer className="mt-14 border-t border-slate-200/80 pt-6 pb-10 text-center text-xs text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          IndieRadar · 专注全球出海、AI、Micro-SaaS 与独立开发真实变现信号 ·
          Powered by Next.js + Drizzle + Supabase
        </footer>
      </main>
    </div>
  );
}
