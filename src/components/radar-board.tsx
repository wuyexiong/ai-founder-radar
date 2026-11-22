"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Flame,
  Layers,
  Mail,
  Moon,
  Radar,
  Search,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { SignalCard } from "@/components/signal-card";
import type { RadarPagePayload } from "@/lib/signals-repo";
import { cn } from "@/lib/utils";
import type { SignalCategory } from "@/types/signal";

type TabFilter = "top" | "all" | SignalCategory | "saved";

const TABS: Array<{ id: TabFilter; label: string; icon: React.ReactNode }> = [
  { id: "top", label: "今日必读精选", icon: <Flame className="h-3.5 w-3.5 text-orange-500" /> },
  { id: "all", label: "全部信号", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "revenue", label: "搞钱实战 & MRR", icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> },
  { id: "launch", label: "新品首发", icon: <Sparkles className="h-3.5 w-3.5 text-amber-500" /> },
  { id: "pain_point", label: "海外痛点池", icon: <Target className="h-3.5 w-3.5 text-blue-500" /> },
];

export function RadarBoard({ payload }: { payload: RadarPagePayload }) {
  const { availableDates, activeDate, overview, items, tools, storageMode } = payload;

  const [activeTab, setActiveTab] = useState<TabFilter>("top");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 初始化主题与本地收藏夹
  useEffect(() => {
    const savedTheme = localStorage.getItem("indieradar-theme");
    const prefersDark =
      savedTheme === "dark" ||
      (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
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

  // 统计热门标签
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  // 过滤列表
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeTab === "top" && !item.isTopPick) return false;
      if (activeTab === "saved" && !bookmarks.includes(item.id)) return false;
      if (
        activeTab !== "top" &&
        activeTab !== "all" &&
        activeTab !== "saved" &&
        item.category !== activeTab
      ) {
        return false;
      }
      if (activeTag && !item.tags.includes(activeTag)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${item.titleZh} ${item.titleOrig} ${item.whatItIs} ${item.businessSignal} ${item.indieTakeaway} ${item.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, activeTab, activeTag, searchQuery, bookmarks]);

  const topThreeItems = useMemo(() => items.slice(0, 3), [items]);

  const handleSelectTag = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
    if (activeTab === "top") {
      setActiveTab("all");
    }
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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

      {/* 紧凑单行情报概览条（零废话首屏，不占大横幅） */}
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
                ? "● Supabase 实时库"
                : "● 本地精选样本模式（配好 .env.local 自动切云端）"}
            </span>
          </div>
        </div>
      </div>

      {/* 主体双栏容器 */}
      <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
        {/* 当日主编一句话风向总结 */}
        {overview.summaryNote && (
          <div className="mb-5 rounded-xl border border-blue-200/80 bg-blue-50/60 px-4 py-3 text-[13.5px] text-slate-700 dark:border-blue-500/20 dark:bg-blue-950/25 dark:text-slate-300">
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* 左侧主信号流 (~72% = 8.5 cols -> 8 cols on 12-grid) */}
          <div className="lg:col-span-8">
            {/* 频道切换胶囊栏 */}
            <div className="no-scrollbar sticky top-14 z-30 -mx-4 mb-4 flex items-center gap-1.5 overflow-x-auto bg-[#F8FAFC]/95 px-4 py-2 backdrop-blur-sm sm:mx-0 sm:px-0 dark:bg-[#090D16]/95">
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
                    onClick={() => setActiveTab(tab.id)}
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

            {/* 当前激活的标签过滤提示 */}
            {activeTag && (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs dark:border-blue-500/30 dark:bg-blue-950/30">
                <span>
                  正在按细分标签筛选：
                  <strong className="ml-1 text-blue-700 dark:text-blue-300">
                    {activeTag}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTag(null)}
                  className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                >
                  清除筛选 <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* 信号卡片列表 */}
            {filteredItems.length > 0 ? (
              <div className="space-y-3.5">
                {filteredItems.map((item) => (
                  <SignalCard
                    key={item.id}
                    item={item}
                    isBookmarked={bookmarks.includes(item.id)}
                    activeTag={activeTag}
                    onToggleBookmark={toggleBookmark}
                    onSelectTag={handleSelectTag}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-[#111827]">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {activeTab === "saved"
                    ? "你还没有收藏任何商机卡片，看到有启发的点子可点右下角「收藏」沉淀灵感。"
                    : "没有找到匹配当前筛选条件的信号卡片。"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("all");
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

          {/* 右侧粘性辅助边栏 (~28% = 4 cols on 12-grid) */}
          <aside className="space-y-4 lg:col-span-4">
            <div className="sticky top-20 space-y-4">
              {/* 模块 1：当日商业价值 Top 3 速览 */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <h2 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>🏆 当日高分商机 Top 3</span>
                  <span className="font-mono text-[11px] font-normal">
                    商业分
                  </span>
                </h2>
                <div className="space-y-2.5">
                  {topThreeItems.map((item, idx) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="group flex items-start justify-between gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          0{idx + 1}
                        </span>
                        <span className="line-clamp-2 text-xs font-medium leading-relaxed text-slate-800 group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400">
                          {item.titleZh}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                        {item.score.toFixed(1)}
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              {/* 模块 2：细分赛道标签云 */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  🏷️ 热门搞钱切口（点击即筛）
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {tagCounts.map(([tag, count]) => {
                    const selected = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleSelectTag(tag)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer tabular-nums",
                          selected
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        )}
                      >
                        <span>{tag}</span>
                        <span className="font-mono text-[10px] opacity-70">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 模块 3：出海建站免费工具箱（Affiliate 变现预留位） */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Wrench className="h-3.5 w-3.5" />
                    出海建站零成本工具箱
                  </h2>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    精选免费层
                  </span>
                </div>
                <div className="space-y-2">
                  {tools.map((tool) => (
                    <a
                      key={tool.name}
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-2 rounded-lg border border-transparent p-2 transition-all hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-800/50"
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
                        <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                          {tool.tagline}
                        </p>
                      </div>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-blue-500 dark:text-slate-600" />
                    </a>
                  ))}
                </div>
              </div>

              {/* 模块 4：每日早报邮件订阅预留位 */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  订阅每日 5 分钟出海搞钱早报
                </h2>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
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
