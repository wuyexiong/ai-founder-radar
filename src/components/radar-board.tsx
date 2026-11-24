"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Bookmark,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Download,
  ExternalLink,
  FileText,
  Flame,
  Globe,
  Layers,
  Loader2,
  MessageSquarePlus,
  Monitor,
  Moon,
  Radar,
  Rss,
  Search,
  Sparkles,
  Sun,
  Target,
  Terminal,
  TrendingUp,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { FeedbackModal } from "@/components/feedback-modal";
import { NewsletterSubscribeCard } from "@/components/newsletter-subscribe-card";
import { PLATFORM_META, SignalCard } from "@/components/signal-card";
import {
  buildLocalePath,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { trackRadarEvent } from "@/lib/analytics";
import {
  formatSavedSignalsMarkdown,
  MAX_SAVED_BACKUP_BYTES,
  parseAndMergeSavedSignalsBackup,
  sanitizeSavedSignalItem,
  serializeSavedSignalsBackup,
} from "@/lib/saved-portability";
import { getTopicCopy } from "@/lib/seo-taxonomy";
import type { RadarPagePayload } from "@/lib/signals-repo";
import {
  getNextThemeMode,
  LEGACY_THEME_STORAGE_KEY,
  normalizeThemeMode,
  resolveEffectiveDark,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/theme";
import {
  buildTrackedOutboundUrl,
  cn,
  formatHeaderArchiveDate,
} from "@/lib/utils";
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
const SAVED_ITEMS_STORAGE_KEY = "afr-saved-items";
const LEGACY_BOOKMARKS_STORAGE_KEY = "indieradar-bookmarks";

function triggerBrowserDownload(
  filename: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
    isArchiveRoute = false,
    availableDates,
    activeDate,
    overview,
    items,
    tools,
    storageMode,
    hub,
    hubDirectory,
  } = payload;

  const dict = useMemo(() => getDictionary(locale), [locale]);
  const latestDate = availableDates[0];
  const isHubPage = Boolean(hub);
  const defaultTab: TabFilter = isHubPage || isArchiveRoute ? "all" : "top";

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
        {
          id: "ai_trend",
          label: dict.tabs.ai_trend,
          icon: (
            <Terminal className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
          ),
        },
      ],
      [dict]
    );

  // 专题聚合页与每日独立归档页默认展开 "all"（确保首屏 SSR HTML 100% 输出全部卡片供搜索引擎抓取）
  const [activeTab, setActiveTab] = useState<TabFilter>(defaultTab);
  const [activePlatform, setActivePlatform] = useState<SourcePlatform | null>(
    null
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const router = useRouter();
  const [isDatePending, startDateTransition] = useTransition();
  const [optimisticDate, setOptimisticDate] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveSearchResults, setArchiveSearchResults] = useState<
    SignalItem[]
  >([]);
  const [completedSearchKey, setCompletedSearchKey] = useState("");
  const [savedSnapshots, setSavedSnapshots] = useState<
    Record<string, SignalItem>
  >({});
  const [savedFeedback, setSavedFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [themeHydrated, setThemeHydrated] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const langPickerRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const routeKey = hub
    ? `${locale}:${hub.kind}:${hub.slug}`
    : `${locale}:${isArchiveRoute ? "archive" : "home"}:${activeDate}`;
  const prevRouteKeyRef = useRef(routeKey);

  // 客户端跨专题/日期/语种软路由切换时重置筛选状态与下拉面板
  useEffect(() => {
    if (prevRouteKeyRef.current !== routeKey) {
      prevRouteKeyRef.current = routeKey;
      setActiveTab(hub || isArchiveRoute ? "all" : "top");
      setActivePlatform(null);
      setActiveTag(null);
      setSearchQuery("");
      setDatePickerOpen(false);
      setLangMenuOpen(false);
      setOptimisticDate(null);
    }
  }, [routeKey, hub, isArchiveRoute]);

  // 点击外部或按 Escape 收起归档日期下拉面板
  useEffect(() => {
    if (!datePickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(e.target as Node)
      ) {
        setDatePickerOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDatePickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [datePickerOpen]);

  // 点击外部或按 Escape 收起语言选择列表
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

  // 初始化主题模式（默认跟随电脑 system，兼容旧版存储键无缝迁移）
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
  }, []);

  // 当主题处于「跟随电脑」模式时实时监听系统浅色/深色切换
  useEffect(() => {
    if (!themeHydrated) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      document.documentElement.classList.toggle(
        "dark",
        resolveEffectiveDark(themeMode, mql.matches)
      );
    };
    syncTheme();

    if (themeMode !== "system") return;

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", syncTheme);
      return () => mql.removeEventListener("change", syncTheme);
    }
    mql.addListener(syncTheme);
    return () => mql.removeListener(syncTheme);
  }, [themeMode, themeHydrated]);

  // 初始化跨天本地收藏夹（兼容旧版 indieradar-* 存储键无缝迁移）
  useEffect(() => {
    try {
      const nextMap: Record<string, SignalItem> = {};
      const rawSnapshots = JSON.parse(
        localStorage.getItem(SAVED_ITEMS_STORAGE_KEY) || "{}"
      );
      if (rawSnapshots && typeof rawSnapshots === "object") {
        for (const [id, snap] of Object.entries(
          rawSnapshots as Record<string, unknown>
        )) {
          const valid = sanitizeSavedSignalItem(snap);
          if (valid && id === valid.id) {
            nextMap[valid.id] = valid;
          }
        }
      }

      // 迁移旧版仅存 ID 列表中的当日卡片
      const legacyIds = JSON.parse(
        localStorage.getItem(LEGACY_BOOKMARKS_STORAGE_KEY) || "[]"
      );
      let migrated = false;
      if (Array.isArray(legacyIds)) {
        for (const id of legacyIds) {
          if (typeof id === "string" && !nextMap[id]) {
            const matched = items.find((it) => it.id === id);
            if (matched) {
              nextMap[id] = matched;
              migrated = true;
            }
          }
        }
      }

      // 同步当前页已收藏卡片的最新语种快照
      for (const it of items) {
        if (nextMap[it.id]) {
          nextMap[it.id] = it;
        }
      }

      if (migrated) {
        localStorage.setItem(SAVED_ITEMS_STORAGE_KEY, JSON.stringify(nextMap));
      }
      setSavedSnapshots(nextMap);
    } catch {
      // ignore invalid json
    }

    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (savedFeedbackTimerRef.current) {
        clearTimeout(savedFeedbackTimerRef.current);
      }
    };
  }, [items]);

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

  // 跨天收藏夹列表：当日卡片始终使用实时语种数据，历史收藏按日期倒序 + 评分倒序排列
  const savedItems = useMemo(() => {
    const liveById = new Map(items.map((it) => [it.id, it]));
    return Object.values(savedSnapshots)
      .map((snap) => liveById.get(snap.id) ?? snap)
      .sort((a, b) => {
        if (a.dateKey !== b.dateKey) {
          return b.dateKey.localeCompare(a.dateKey);
        }
        return b.score - a.score;
      });
  }, [items, savedSnapshots]);

  const showSavedNotice = (tone: "success" | "error", message: string) => {
    setSavedFeedback({ tone, message });
    if (savedFeedbackTimerRef.current) {
      clearTimeout(savedFeedbackTimerRef.current);
    }
    savedFeedbackTimerRef.current = setTimeout(() => {
      setSavedFeedback(null);
    }, 5000);
  };

  const handleExportSavedMarkdown = () => {
    if (savedItems.length === 0) return;
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const origin =
      configuredOrigin ||
      (typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://radar.aibuildon.com");
    const markdown = formatSavedSignalsMarkdown(savedItems, locale, origin);
    triggerBrowserDownload(
      `ai-founder-radar-saved-${activeDate}.md`,
      markdown,
      "text/markdown;charset=utf-8"
    );
    trackRadarEvent("saved_export", {
      format: "markdown",
      count: savedItems.length,
      locale,
    });
  };

  const handleExportSavedJson = () => {
    if (savedItems.length === 0) return;
    const exportMap: Record<string, SignalItem> = {};
    for (const item of savedItems) {
      exportMap[item.id] = item;
    }
    const jsonText = serializeSavedSignalsBackup(exportMap);
    triggerBrowserDownload(
      `ai-founder-radar-backup-${activeDate}.json`,
      jsonText,
      "application/json;charset=utf-8"
    );
    trackRadarEvent("saved_export", {
      format: "json",
      count: savedItems.length,
      locale,
    });
  };

  const handleImportBackupChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.size > MAX_SAVED_BACKUP_BYTES) {
        throw new Error("BACKUP_TOO_LARGE");
      }
      const rawText = await file.text();
      const { merged, addedCount, validCount } =
        parseAndMergeSavedSignalsBackup(rawText, savedSnapshots);
      setSavedSnapshots(merged);
      try {
        localStorage.setItem(SAVED_ITEMS_STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem(
          LEGACY_BOOKMARKS_STORAGE_KEY,
          JSON.stringify(Object.keys(merged))
        );
      } catch {
        // ignore storage quota errors
      }
      showSavedNotice(
        "success",
        dict.savedToolbar.importSuccess(addedCount, validCount)
      );
      trackRadarEvent("saved_import", {
        result: "success",
        added_count: addedCount,
        valid_count: validCount,
        locale,
      });
    } catch {
      showSavedNotice("error", dict.savedToolbar.importError);
      trackRadarEvent("saved_import", {
        result: "error",
        locale,
      });
    } finally {
      e.target.value = "";
    }
  };

  // 日期前后切换与按月分组归档计算（availableDates 按最新在前排列）
  const currentDateIdx = availableDates.indexOf(activeDate);
  const olderDate =
    currentDateIdx >= 0 && currentDateIdx < availableDates.length - 1
      ? availableDates[currentDateIdx + 1]
      : null;
  const newerDate =
    currentDateIdx > 0 ? availableDates[currentDateIdx - 1] : null;
  const displayedDate = optimisticDate ?? activeDate;
  const formattedHeaderDate = formatHeaderArchiveDate(
    displayedDate,
    latestDate
  );
  const isSwitchingDate =
    isDatePending && Boolean(optimisticDate && optimisticDate !== activeDate);

  // 挂载后立即静默预取相邻归档日期的完整 RSC 数据，确保展开下拉面板点选时 0ms 秒切
  useEffect(() => {
    if (isHubPage) return;
    if (olderDate) {
      router.prefetch(buildLocalePath(locale, olderDate, latestDate));
    }
    if (newerDate) {
      router.prefetch(buildLocalePath(locale, newerDate, latestDate));
    }
  }, [isHubPage, olderDate, newerDate, locale, latestDate, router]);

  const handleDateLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetDate: string,
    href: string
  ) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    setDatePickerOpen(false);
    if (targetDate === activeDate) {
      setOptimisticDate(null);
      return;
    }
    setOptimisticDate(targetDate);
    startDateTransition(() => {
      router.push(href);
    });
  };

  const archiveMonths = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const d of availableDates) {
      const month = d.slice(0, 7);
      const list = groups.get(month);
      if (list) list.push(d);
      else groups.set(month, [d]);
    }
    return Array.from(groups.entries());
  }, [availableDates]);

  // 第一级过滤：按当前频道 Tab 过滤的基础集合
  const tabScopedItems = useMemo(() => {
    if (activeTab === "saved") return savedItems;
    return items.filter((item) => {
      if (activeTab === "top") return item.isTopPick;
      if (activeTab === "all") return true;
      return item.category === activeTab;
    });
  }, [items, savedItems, activeTab]);

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

  // 双层搜索第二层：当关键词 >= 2 字符时，260ms 防抖 + AbortController 跨期检索全库历史记录
  const trimmedSearch = searchQuery.trim().slice(0, 64);
  const activeSearchCategory: SignalCategory | undefined =
    activeTab === "revenue" ||
    activeTab === "launch" ||
    activeTab === "pain_point" ||
    activeTab === "ai_trend"
      ? activeTab
      : undefined;
  const activeSearchPlatform: SourcePlatform | undefined =
    activePlatform ??
    (hub?.kind === "source" ? (hub.slug as SourcePlatform) : undefined);

  const searchRequestKey =
    trimmedSearch.length >= 2
      ? `${locale}|${activeSearchCategory ?? ""}|${activeSearchPlatform ?? ""}|${trimmedSearch.toLowerCase()}`
      : "";
  const isCrossSearchPending =
    Boolean(searchRequestKey) && completedSearchKey !== searchRequestKey;

  useEffect(() => {
    if (!searchRequestKey) {
      setArchiveSearchResults([]);
      setCompletedSearchKey("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: trimmedSearch,
          locale,
          limit: "24",
        });
        if (activeSearchCategory) {
          params.set("category", activeSearchCategory);
        }
        if (activeSearchPlatform) {
          params.set("platform", activeSearchPlatform);
        }

        const res = await fetch(`/api/signals/search?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          items?: SignalItem[];
        } | null;
        if (controller.signal.aborted) return;

        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setArchiveSearchResults(nextItems);
        setCompletedSearchKey(searchRequestKey);
        trackRadarEvent("search_query", {
          query_length: trimmedSearch.length,
          archive_hits: nextItems.length,
          category: activeSearchCategory ?? "all",
          platform: activeSearchPlatform ?? "all",
          locale,
        });
      } catch {
        if (controller.signal.aborted) return;
        setArchiveSearchResults([]);
        setCompletedSearchKey(searchRequestKey);
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    searchRequestKey,
    trimmedSearch,
    locale,
    activeSearchCategory,
    activeSearchPlatform,
  ]);

  const crossArchiveMatches = useMemo(() => {
    if (!searchRequestKey || completedSearchKey !== searchRequestKey) {
      return [];
    }
    const visibleIds = new Set(filteredItems.map((it) => it.id));
    return archiveSearchResults.filter((it) => {
      if (visibleIds.has(it.id)) return false;
      if (activeTag && !it.tags.includes(activeTag)) return false;
      return true;
    });
  }, [
    searchRequestKey,
    completedSearchKey,
    archiveSearchResults,
    filteredItems,
    activeTag,
  ]);

  const topThreeItems = useMemo(() => {
    return [...items].sort((a, b) => b.score - a.score).slice(0, 3);
  }, [items]);

  const handleSelectPlatform = (p: SourcePlatform) => {
    if (activePlatform === p) {
      setActivePlatform(null);
      return;
    }
    const totalCount = items.filter((i) => i.sourcePlatform === p).length;
    const tabCount = tabScopedItems.filter(
      (i) => i.sourcePlatform === p
    ).length;
    const shouldSwitchToAll =
      (activeTab === "top" && totalCount > tabCount) || tabCount === 0;

    if (shouldSwitchToAll) {
      setActiveTab("all");
    }
    setActivePlatform(p);

    const targetPool = shouldSwitchToAll ? items : tabScopedItems;
    if (
      activeTag &&
      !targetPool.some(
        (i) => i.sourcePlatform === p && i.tags.includes(activeTag)
      )
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
      const hasInSaved =
        activeTab === "saved" && savedItems.some((i) => i.tags.includes(tag));
      if (!hasInSaved) {
        setActiveTab("all");
      }
      setActivePlatform(null);
    }
  };

  // 右侧 Top 3 点击与 #sig-xxx 锚点深链统一定位逻辑
  const handleFocusTopItem = (targetItem: SignalItem) => {
    const isCurrentlyVisible = filteredItems.some(
      (i) => i.id === targetItem.id
    );
    if (!isCurrentlyVisible) {
      setActiveTab(
        isHubPage || isArchiveRoute
          ? "all"
          : targetItem.isTopPick
            ? "top"
            : "all"
      );
      setActivePlatform(null);
      setActiveTag(null);
      setSearchQuery("");
    }

    setHighlightedId(targetItem.id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedId(null);
    }, 2400);

    setTimeout(() => {
      const el = document.getElementById(targetItem.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);
  };

  // 支持访问 /zh/daily/2026-11-24#sig-xxx 时自动展开非 Top Pick 卡片并平滑高亮定位
  useEffect(() => {
    const locateFromHash = () => {
      if (typeof window === "undefined" || !window.location.hash) return;
      let targetId = "";
      try {
        targetId = decodeURIComponent(window.location.hash.slice(1)).trim();
      } catch {
        targetId = window.location.hash.slice(1).trim();
      }
      if (!targetId) return;

      const matched = items.find((it) => it.id === targetId);
      if (!matched) return;

      if (!isHubPage && !isArchiveRoute && !matched.isTopPick) {
        setActiveTab("all");
        setActivePlatform(null);
        setActiveTag(null);
        setSearchQuery("");
      }

      setHighlightedId(matched.id);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedId(null);
      }, 2600);

      setTimeout(() => {
        const el = document.getElementById(matched.id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 80);
    };

    locateFromHash();
    window.addEventListener("hashchange", locateFromHash);
    return () => window.removeEventListener("hashchange", locateFromHash);
  }, [items, isHubPage, routeKey]);

  const buildSwitcherHref = (targetLocale: Locale) => {
    if (hub) {
      return `/${targetLocale}/${hub.kind}/${hub.slug}`;
    }
    return buildLocalePath(targetLocale, activeDate, latestDate);
  };

  const activeTopics = hubDirectory?.topics ?? [];
  const activeSources = hubDirectory?.sources ?? [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 transition-colors dark:bg-[#090D16] dark:text-slate-100">
      {/* Sticky 顶栏 (56px) */}
      <header className="sticky top-0 z-40 h-14 border-b border-slate-200/90 bg-white/85 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#090D16]/85">
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-2.5 px-4 sm:px-6">
          {/* 品牌标识 */}
          <Link
            href={`/${locale}`}
            prefetch={true}
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

          {/* 中间：日报归档日期切换器 或 专题页返回最新日报入口 */}
          {isHubPage ? (
            <Link
              href={`/${locale}`}
              prefetch={true}
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-blue-600 sm:inline-flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-400"
            >
              {dict.hub.backToLatest}
            </Link>
          ) : (
            <div ref={datePickerRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setDatePickerOpen((prev) => !prev);
                  setLangMenuOpen(false);
                }}
                aria-expanded={datePickerOpen}
                aria-controls="daily-archive-popover"
                aria-label={`${displayedDate} · ${dict.header.jumpToDate}`}
                title={`${displayedDate} · ${dict.header.jumpToDate}`}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-xs font-semibold tabular-nums transition-colors sm:px-3 cursor-pointer",
                  datePickerOpen
                    ? "border-slate-300 bg-slate-100/90 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                )}
              >
                {isSwitchingDate ? (
                  <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  </span>
                ) : (
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                )}
                <span>{formattedHeaderDate}</span>
                {displayedDate === latestDate && (
                  <span className="hidden rounded bg-emerald-500/15 px-1.5 py-0.5 font-sans text-[10px] leading-none font-semibold text-emerald-700 sm:inline dark:text-emerald-300">
                    {dict.header.latestBadge}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
                    datePickerOpen && "rotate-180"
                  )}
                />
              </button>

              {/* SSR 常驻渲染归档导航面板（收起时 CSS hidden）：保留全量 /daily/YYYY-MM-DD 爬虫内链，展开后按需预取 */}
              <nav
                id="daily-archive-popover"
                aria-label={dict.header.jumpToDate}
                className={cn(
                  "absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:w-80 dark:border-slate-800 dark:bg-[#111827]",
                  !datePickerOpen && "hidden"
                )}
              >
                <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs dark:border-slate-800">
                  <span className="font-semibold text-slate-600 tabular-nums dark:text-slate-300">
                    {dict.header.archiveCount(availableDates.length)}
                  </span>
                  {latestDate && displayedDate !== latestDate && (
                    <Link
                      href={`/${locale}`}
                      prefetch={datePickerOpen ? true : false}
                      onClick={(e) =>
                        handleDateLinkClick(e, latestDate, `/${locale}`)
                      }
                      className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25"
                    >
                      {dict.header.backToLatestDate}
                    </Link>
                  )}
                </div>

                <div className="thin-scrollbar max-h-64 space-y-3 overflow-y-auto pr-1">
                  {archiveMonths.map(([month, monthDates], monthIdx) => (
                    <div key={month}>
                      <div className="mb-1.5 font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">
                        {month}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {monthDates.map((d, idx) => {
                          const isCurrent = d === displayedDate;
                          const isLatest = d === latestDate;
                          const targetHref = buildLocalePath(
                            locale,
                            d,
                            latestDate
                          );
                          return (
                            <Link
                              key={d}
                              href={targetHref}
                              title={d}
                              prefetch={
                                datePickerOpen && monthIdx === 0 && idx < 12
                                  ? true
                                  : false
                              }
                              onClick={(e) =>
                                handleDateLinkClick(e, d, targetHref)
                              }
                              className={cn(
                                "flex items-center justify-center gap-1 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums transition-colors",
                                isCurrent
                                  ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-600 dark:text-white"
                                  : "border-slate-200/80 bg-slate-50/80 text-slate-700 hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                              )}
                            >
                              <span>{d.slice(5)}</span>
                              {isLatest && (
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    isCurrent ? "bg-emerald-300" : "bg-emerald-500"
                                  )}
                                />
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </nav>
            </div>
          )}

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

            {/* 多语种切换下拉菜单（Icon + 语言缩写胶囊，点击展开选择列表） */}
            <div ref={langPickerRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setLangMenuOpen((prev) => !prev);
                  setDatePickerOpen(false);
                }}
                aria-expanded={langMenuOpen}
                aria-haspopup="listbox"
                aria-label={dict.header.switchLang}
                title={dict.header.switchLang}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold leading-none transition-colors sm:px-3 cursor-pointer",
                  langMenuOpen
                    ? "border-slate-300 bg-slate-100/90 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                )}
              >
                <Globe className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                <span>{LOCALE_LABELS[locale].short}</span>
              </button>

              {langMenuOpen && (
                <div
                  role="listbox"
                  aria-label={dict.header.languageMenuTitle}
                  className="absolute right-0 top-full z-50 mt-2 w-44 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-[#111827] dark:shadow-black/40"
                >
                  <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {dict.header.languageMenuTitle}
                  </div>
                  <div className="space-y-0.5">
                    {LOCALES.map((loc) => {
                      const active = loc === locale;
                      const info = LOCALE_LABELS[loc];
                      return (
                        <Link
                          key={loc}
                          href={buildSwitcherHref(loc)}
                          prefetch={true}
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
                              : "font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
                          )}
                        >
                          <span>{info.native}</span>
                          {active && (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setActiveTab((prev) =>
                  prev === "saved" ? defaultTab : "saved"
                )
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
              <span className="font-mono">{savedItems.length}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLangMenuOpen(false);
                setDatePickerOpen(false);
                setFeedbackOpen(true);
                trackRadarEvent("feedback_open", {
                  locale,
                  placement: "header",
                });
              }}
              aria-label={dict.feedback.triggerTooltip}
              title={dict.feedback.triggerTooltip}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700 sm:px-2.5 cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">
                {dict.feedback.triggerLabel}
              </span>
            </button>

            {/* 单按钮主题切换：仅展示当前选中模式图标，点击按「跟随电脑 → 浅色 → 深色」循环切换 */}
            {(() => {
              const displayedThemeMode: ThemeMode = themeHydrated
                ? themeMode
                : "system";
              const themeLabel =
                displayedThemeMode === "light"
                  ? dict.header.themeLight
                  : displayedThemeMode === "dark"
                    ? dict.header.themeDark
                    : dict.header.themeSystem;
              const fullTitle = `${dict.header.toggleTheme}: ${themeLabel}`;

              return (
                <button
                  type="button"
                  onClick={() =>
                    selectThemeMode(getNextThemeMode(displayedThemeMode))
                  }
                  aria-label={fullTitle}
                  title={fullTitle}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {displayedThemeMode === "light" ? (
                    <Sun className="h-4 w-4 text-amber-500" />
                  ) : displayedThemeMode === "dark" ? (
                    <Moon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                </button>
              );
            })()}
          </div>
        </div>
      </header>

      {/* 紧凑单行情报概览条 / 专题面包屑导航条 */}
      <div className="border-b border-slate-200/80 bg-white/60 dark:border-slate-800/70 dark:bg-[#111827]/50">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs sm:px-6">
          {hub ? (
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
              <span>
                {hub.kind === "topic"
                  ? dict.hub.breadcrumbTopics
                  : dict.hub.breadcrumbSources}
              </span>
              <span>/</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {hub.label}
              </span>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-700">
                |
              </span>
              <span className="hidden font-mono text-[11px] sm:inline">
                {dict.hub.updatedAt(hub.latestDateKey)}
              </span>
            </nav>
          ) : (
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
          )}

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
        {hub ? (
          <section className="mb-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#111827]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                  {hub.h1}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {hub.description}
                </p>
              </div>
              <Link
                href={`/${locale}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {dict.hub.backToLatest}
              </Link>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs font-medium tabular-nums">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                {dict.hub.statsSignals(hub.totalSignals)}
              </span>
              {hub.revenueCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {dict.hub.statsRevenue(hub.revenueCount)}
                </span>
              )}
              {hub.painPointCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {dict.hub.statsPainPoints(hub.painPointCount)}
                </span>
              )}
              {hub.avgScore > 0 && (
                <span className="inline-flex items-center rounded-lg border border-slate-200 px-2.5 py-1 font-mono text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {dict.hub.statsAvgScore(hub.avgScore.toFixed(1))}
                </span>
              )}
            </div>
          </section>
        ) : (
          <>
            <h1 className="sr-only">
              {dict.overview.headingSrOnly(activeDate)}
            </h1>

            {/* 当日主编一句话风向总结 */}
            {overview.summaryNote && (
              <div className="mb-4 rounded-xl border border-blue-200/80 bg-blue-50/60 px-4 py-2.5 text-[13.5px] text-slate-700 dark:border-blue-500/20 dark:bg-blue-950/25 dark:text-slate-300">
                <span className="font-semibold text-blue-700 dark:text-blue-400">
                  {dict.overview.editorialPrefix}
                </span>
                {overview.summaryNote}
              </div>
            )}
          </>
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
                                ? Boolean(savedSnapshots[i.id])
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

            {/* 二级紧凑联动筛选台（在空专题页或单一信源页自动适配） */}
            {(platformOptions.length > 1 || tagCounts.length > 0) && (
              <div className="mb-4 rounded-xl border border-slate-200/90 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
                {platformOptions.length > 1 && (
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
                        const isUnscopedCategory =
                          activeTab === "top" || activeTab === "all";
                        const displayCount = isUnscopedCategory
                          ? totalCount
                          : tabCount > 0
                            ? tabCount
                            : totalCount;
                        const dimmed =
                          !isUnscopedCategory && tabCount === 0 && !selected;

                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() => handleSelectPlatform(platform)}
                            title={
                              !isUnscopedCategory && tabCount === 0
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
                )}

                {/* 切口标签行 */}
                {tagCounts.length > 0 && (
                  <div
                    className={cn(
                      platformOptions.length > 1 &&
                        "mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800/80"
                    )}
                  >
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
                            {selected && (
                              <X className="h-3 w-3 opacity-85" />
                            )}
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
            )}

            {/* 收藏夹便携导出与备份恢复工具栏（activeTab === "saved" 时常驻展示，支持 0 收藏空状态一键恢复备份） */}
            {activeTab === "saved" && (
              <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-500/25 dark:bg-amber-950/15">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                    <Bookmark className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    {dict.savedToolbar.title(savedItems.length)}
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      ref={backupFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportBackupChange}
                      className="hidden"
                    />

                    <button
                      type="button"
                      disabled={savedItems.length === 0}
                      onClick={handleExportSavedMarkdown}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>{dict.savedToolbar.exportMarkdown}</span>
                    </button>

                    <button
                      type="button"
                      disabled={savedItems.length === 0}
                      onClick={handleExportSavedJson}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{dict.savedToolbar.exportJson}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => backupFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-800 cursor-pointer dark:border-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{dict.savedToolbar.importJson}</span>
                    </button>
                  </div>
                </div>

                {savedFeedback && (
                  <p
                    role="status"
                    className={cn(
                      "mt-2 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                      savedFeedback.tone === "success"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                    )}
                  >
                    {savedFeedback.message}
                  </p>
                )}
              </div>
            )}

            {/* 信号卡片列表（移动端在第 4 张卡片后内嵌早报订阅卡，消除长滚到底部断层） */}
            {filteredItems.length > 0 ? (
              <div
                className={cn(
                  "space-y-3.5 transition-opacity duration-150",
                  isSwitchingDate && "opacity-60 pointer-events-none"
                )}
              >
                {filteredItems.map((item, idx) => {
                  const inlineSubscribeIdx =
                    activeTab !== "saved"
                      ? Math.min(3, filteredItems.length - 1)
                      : -1;
                  return (
                    <div key={item.id} className="space-y-3.5">
                      <SignalCard
                        item={item}
                        locale={locale}
                        dict={dict.card}
                        isBookmarked={Boolean(savedSnapshots[item.id])}
                        isHighlighted={highlightedId === item.id}
                        activeTopicSlug={hub?.kind === "topic" ? hub.slug : null}
                        hubDateHref={
                          isHubPage
                            ? buildLocalePath(locale, item.dateKey, latestDate)
                            : undefined
                        }
                        archivedDateHref={
                          activeTab === "saved" && item.dateKey !== activeDate
                            ? buildLocalePath(locale, item.dateKey, latestDate)
                            : undefined
                        }
                        onToggleBookmark={toggleBookmark}
                      />
                      {idx === inlineSubscribeIdx && (
                        <div className="lg:hidden">
                          <NewsletterSubscribeCard
                            dict={dict.sidebar}
                            locale={locale}
                            placement="inline"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : isCrossSearchPending ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span>{dict.filters.searchingArchive}</span>
              </div>
            ) : crossArchiveMatches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-[#111827]">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {activeTab === "saved"
                    ? dict.filters.emptySaved
                    : isHubPage && items.length === 0
                      ? dict.hub.emptyHub
                      : dict.filters.emptyFiltered}
                </p>
                {isHubPage && items.length === 0 ? (
                  <Link
                    href={`/${locale}`}
                    className="mt-3 inline-block rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white dark:bg-blue-600"
                  >
                    {dict.hub.backToLatest}
                  </Link>
                ) : (
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
                )}
              </div>
            ) : null}

            {/* 跨期历史归档匹配分区（自动剔除当前页已展示的同 ID 卡片，点击日期胶囊直达对应期） */}
            {filteredItems.length > 0 && isCrossSearchPending && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/80 py-3.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111827]/70 dark:text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                <span>{dict.filters.searchingArchive}</span>
              </div>
            )}

            {crossArchiveMatches.length > 0 && (
              <section
                aria-label={dict.filters.archiveMatchesHeading(
                  crossArchiveMatches.length
                )}
                className={cn(
                  "space-y-3.5",
                  filteredItems.length > 0 &&
                    "mt-6 border-t border-slate-200/90 pt-5 dark:border-slate-800/90"
                )}
              >
                <div className="rounded-xl border border-blue-200/80 bg-blue-50/55 px-4 py-2.5 dark:border-blue-500/25 dark:bg-blue-950/25">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {dict.filters.archiveMatchesHeading(
                      crossArchiveMatches.length
                    )}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                    {dict.filters.archiveMatchesSubnote}
                  </p>
                </div>

                <div className="space-y-3.5">
                  {crossArchiveMatches.map((item) => (
                    <SignalCard
                      key={`archive-${item.id}`}
                      item={item}
                      locale={locale}
                      dict={dict.card}
                      isBookmarked={Boolean(savedSnapshots[item.id])}
                      isHighlighted={highlightedId === item.id}
                      activeTopicSlug={hub?.kind === "topic" ? hub.slug : null}
                      hubDateHref={`${buildLocalePath(locale, item.dateKey, latestDate)}#${encodeURIComponent(item.id)}`}
                      onToggleBookmark={toggleBookmark}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* 右侧粘性辅助边栏 (4 cols) */}
          <aside className="lg:col-span-4">
            <div className="thin-scrollbar space-y-3.5 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:pr-0.5">
              {/* 模块 1：高分 Top 3 速览 */}
              {topThreeItems.length > 0 && (
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]">
                  <h2 className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>
                      {isHubPage ? dict.hub.top3HubTitle : dict.sidebar.top3Title}
                    </span>
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
              )}

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
                      href={buildTrackedOutboundUrl(tool.url, {
                        source: "radar.aibuildon.com",
                        medium: "sidebar",
                        campaign: "indie_stack",
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackRadarEvent("toolbox_click", {
                          tool_name: tool.name,
                          category: tool.category,
                          locale,
                        })
                      }
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

              {/* 模块 3：每日早报邮件订阅（真实存库 + 自动推送） */}
              <NewsletterSubscribeCard
                dict={dict.sidebar}
                locale={locale}
                placement="sidebar"
              />
            </div>
          </aside>
        </div>

        {/* 程序化 SEO 全站内链导航矩阵（常青赛道专题 + 一手信源专题） */}
        {(activeTopics.length > 0 || activeSources.length > 0) && (
          <section
            aria-label="Programmatic SEO Topic and Source Hubs"
            className="mt-12 rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-[#111827]"
          >
            {activeTopics.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Compass className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  {dict.hub.directoryTopicsTitle}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {activeTopics.map(({ slug, count }) => {
                    const topicCopy = getTopicCopy(slug, locale);
                    const isCurrent =
                      hub?.kind === "topic" && hub.slug === slug;
                    return (
                      <Link
                        key={slug}
                        href={`/${locale}/topic/${slug}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors tabular-nums",
                          isCurrent
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                        )}
                      >
                        <span>{topicCopy.label}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.2 font-mono text-[10.5px]",
                            isCurrent
                              ? "bg-white/20 text-white"
                              : "bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          )}
                        >
                          {count}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {activeSources.length > 0 && (
              <div
                className={cn(
                  activeTopics.length > 0 &&
                    "mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/80"
                )}
              >
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {dict.hub.directorySourcesTitle}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {activeSources.map(({ platform, count }) => {
                    const meta = PLATFORM_META[platform] ?? {
                      label: platform,
                      dotClass: "bg-slate-400",
                    };
                    const isCurrent =
                      hub?.kind === "source" && hub.slug === platform;
                    return (
                      <Link
                        key={platform}
                        href={`/${locale}/source/${platform}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors tabular-nums",
                          isCurrent
                            ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-600"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-slate-700"
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            isCurrent ? "bg-white" : meta.dotClass
                          )}
                        />
                        <span>{meta.label}</span>
                        <span
                          className={cn(
                            "font-mono text-[10.5px]",
                            isCurrent ? "text-white/80" : "text-slate-400"
                          )}
                        >
                          {count}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 页脚与开放订阅/索引入口 */}
        <footer className="mt-10 border-t border-slate-200/80 pt-6 pb-10 text-center text-xs text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          <div className="mb-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 font-medium text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => {
                setFeedbackOpen(true);
                trackRadarEvent("feedback_open", {
                  locale,
                  placement: "footer",
                });
              }}
              className="inline-flex items-center gap-1 transition-colors hover:text-blue-600 cursor-pointer dark:hover:text-blue-400"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>{dict.feedback.footerLabel}</span>
            </button>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <a
              href={`/${locale}/feed.xml`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-orange-600 dark:hover:text-orange-400"
            >
              <Rss className="h-3.5 w-3.5" />
              <span>{dict.footer.rssLabel}</span>
            </a>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono transition-colors hover:text-blue-600 dark:hover:text-blue-400"
            >
              {dict.footer.llmsLabel}
            </a>
            <span className="text-slate-300 dark:text-slate-700">·</span>
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

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        locale={locale}
        dict={dict.feedback}
      />
    </div>
  );
}
