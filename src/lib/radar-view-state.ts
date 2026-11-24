import { isValidSourcePlatform } from "@/lib/seo-taxonomy";
import type {
  SignalCategory,
  SignalItem,
  SourcePlatform,
} from "@/types/signal";

export type TabFilter = "top" | "all" | SignalCategory | "saved";

export const TAB_FILTERS: readonly TabFilter[] = [
  "top",
  "all",
  "revenue",
  "launch",
  "pain_point",
  "ai_trend",
  "saved",
] as const;

export const RADAR_VIEW_STORAGE_KEY = "afr-radar-view-v1";
export const DETAIL_RETURN_STORAGE_KEY = "afr-detail-return-v1";
export const HISTORY_VIEW_ID_KEY = "__afrViewId";

const MAX_FILTER_TEXT_LENGTH = 64;
const MAX_VIEW_SNAPSHOTS = 16;
const MAX_SCROLL_Y = 1_000_000;
export const VIEW_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

const VIEW_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const SIGNAL_ID_RE = /^sig-[a-zA-Z0-9_-]{2,80}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isSafeSignalId(id: unknown): id is string {
  return typeof id === "string" && SIGNAL_ID_RE.test(id);
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RadarViewSnapshot {
  viewId: string;
  routeKey: string;
  pathname: string;
  search: string;
  activeTab: TabFilter;
  activePlatform: SourcePlatform | null;
  activeTag: string | null;
  tagsExpanded: boolean;
  searchQuery: string;
  scrollY: number;
  clickedSignalId: string | null;
  updatedAt: number;
}

export interface DetailReturnContext {
  viewId: string;
  routeKey: string;
  returnHref: string;
  pathname: string;
  signalId: string;
  scrollY: number;
  activeTab: TabFilter;
  activePlatform: SourcePlatform | null;
  activeTag: string | null;
  tagsExpanded: boolean;
  searchQuery: string;
  detailDepth: number;
  pendingForwardRestore: boolean;
  updatedAt: number;
}

export interface ParsedRadarFilterQuery {
  activeTab: TabFilter;
  activePlatform: SourcePlatform | null;
  activeTag: string | null;
  searchQuery: string;
  hasExplicitFilterParams: boolean;
}

export interface ResolvedRadarViewState {
  viewId: string;
  activeTab: TabFilter;
  activePlatform: SourcePlatform | null;
  activeTag: string | null;
  tagsExpanded: boolean;
  searchQuery: string;
  restoreScrollY: number | null;
  focusSignalId: string | null;
  restored: boolean;
}

export function isValidTabFilter(value: unknown): value is TabFilter {
  return (
    typeof value === "string" &&
    (TAB_FILTERS as readonly string[]).includes(value)
  );
}

function sanitizeFilterToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_FILTER_TEXT_LENGTH);
}

function sanitizeScrollY(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  return Math.min(MAX_SCROLL_Y, Math.round(raw));
}

export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  if (value.startsWith("//") || value.includes("\\")) return false;
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  return value.length <= 512;
}

function getSafeSessionStorage(
  explicitStorage?: StorageLike | null
): StorageLike | null {
  if (explicitStorage !== undefined) return explicitStorage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createRadarViewId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `rv_${ts}_${rand}`;
}

export function readHistoryViewId(historyState: unknown): string | null {
  if (!historyState || typeof historyState !== "object") return null;
  const raw = (historyState as Record<string, unknown>)[HISTORY_VIEW_ID_KEY];
  if (typeof raw !== "string" || !VIEW_ID_RE.test(raw)) return null;
  return raw;
}

export function parseRadarFilterQuery(
  search: string,
  options: {
    defaultTab: TabFilter;
    items?: ReadonlyArray<
      Pick<SignalItem, "sourcePlatform" | "isTopPick" | "tags">
    >;
  }
): ParsedRadarFilterQuery {
  const { defaultTab, items } = options;
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalized);

  const rawTab = params.get("tab");
  const validTab = isValidTabFilter(rawTab) ? rawTab : null;

  const rawSource = params.get("source");
  const validSource =
    rawSource && isValidSourcePlatform(rawSource) ? rawSource : null;

  const validTag = sanitizeFilterToken(params.get("tag"));
  const validQuery = sanitizeFilterToken(params.get("q")) ?? "";

  let resolvedTab: TabFilter = validTab ?? defaultTab;

  // 若 URL 仅指定了信源或切口而未显式指定 tab，在默认 top 频道无匹配或数量被截断时自动展开至 all
  if (!validTab && resolvedTab === "top" && items && items.length > 0) {
    if (validSource) {
      const totalCount = items.filter(
        (i) => i.sourcePlatform === validSource
      ).length;
      const topCount = items.filter(
        (i) => i.isTopPick && i.sourcePlatform === validSource
      ).length;
      if (totalCount > topCount || topCount === 0) {
        resolvedTab = "all";
      }
    } else if (validTag) {
      const hasInTop = items.some(
        (i) => i.isTopPick && i.tags.includes(validTag)
      );
      const hasInAll = items.some((i) => i.tags.includes(validTag));
      if (!hasInTop && hasInAll) {
        resolvedTab = "all";
      }
    }
  }

  const hasExplicitFilterParams = Boolean(
    validTab !== null ||
      validSource !== null ||
      validTag !== null ||
      validQuery.length > 0
  );

  return {
    activeTab: resolvedTab,
    activePlatform: validSource,
    activeTag: validTag,
    searchQuery: validQuery,
    hasExplicitFilterParams,
  };
}

export function buildRadarFilterUrl(
  currentHrefOrPath: string,
  state: {
    activeTab: TabFilter;
    defaultTab: TabFilter;
    activePlatform: SourcePlatform | null;
    activeTag: string | null;
    searchQuery: string;
  }
): string {
  const url = new URL(
    currentHrefOrPath || "/",
    "https://radar.aibuildon.com"
  );

  if (state.activeTab !== state.defaultTab) {
    url.searchParams.set("tab", state.activeTab);
  } else {
    url.searchParams.delete("tab");
  }

  if (state.activePlatform && isValidSourcePlatform(state.activePlatform)) {
    url.searchParams.set("source", state.activePlatform);
  } else {
    url.searchParams.delete("source");
  }

  const cleanTag = sanitizeFilterToken(state.activeTag);
  if (cleanTag) {
    url.searchParams.set("tag", cleanTag);
  } else {
    url.searchParams.delete("tag");
  }

  const cleanQuery = sanitizeFilterToken(state.searchQuery);
  if (cleanQuery) {
    url.searchParams.set("q", cleanQuery);
  } else {
    url.searchParams.delete("q");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function sanitizeViewSnapshot(
  raw: unknown,
  now: number
): RadarViewSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const viewId = obj.viewId;
  const routeKey = obj.routeKey;
  const pathname = obj.pathname;
  const search = typeof obj.search === "string" ? obj.search.slice(0, 512) : "";
  const activeTab = obj.activeTab;
  const updatedAt = obj.updatedAt;

  if (typeof viewId !== "string" || !VIEW_ID_RE.test(viewId)) return null;
  if (FORBIDDEN_KEYS.has(viewId)) return null;
  if (typeof routeKey !== "string" || !routeKey || routeKey.length > 160) {
    return null;
  }
  if (!isSafeInternalPath(pathname)) return null;
  if (!isValidTabFilter(activeTab)) return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  if (now - updatedAt > VIEW_SNAPSHOT_TTL_MS || updatedAt > now + 60_000) {
    return null;
  }

  const rawPlatform = obj.activePlatform;
  const activePlatform =
    typeof rawPlatform === "string" && isValidSourcePlatform(rawPlatform)
      ? rawPlatform
      : null;

  const activeTag = sanitizeFilterToken(obj.activeTag);
  const searchQuery = sanitizeFilterToken(obj.searchQuery) ?? "";
  const tagsExpanded = Boolean(obj.tagsExpanded);
  const scrollY = sanitizeScrollY(obj.scrollY);
  const clickedSignalId = isSafeSignalId(obj.clickedSignalId)
    ? obj.clickedSignalId
    : null;

  return {
    viewId,
    routeKey,
    pathname,
    search,
    activeTab,
    activePlatform,
    activeTag,
    tagsExpanded,
    searchQuery,
    scrollY,
    clickedSignalId,
    updatedAt,
  };
}

function readSnapshotMap(
  storage: StorageLike | null,
  now: number
): Record<string, RadarViewSnapshot> {
  const clean: Record<string, RadarViewSnapshot> = Object.create(null);
  if (!storage) return clean;

  try {
    const rawText = storage.getItem(RADAR_VIEW_STORAGE_KEY);
    if (!rawText || rawText.length > 128_000) return clean;
    const parsed = JSON.parse(rawText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return clean;
    }
    for (const [key, val] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (FORBIDDEN_KEYS.has(key) || !VIEW_ID_RE.test(key)) continue;
      const valid = sanitizeViewSnapshot(val, now);
      if (valid && valid.viewId === key) {
        clean[key] = valid;
      }
    }
  } catch {
    // ignore storage / parse errors
  }

  return clean;
}

function writeSnapshotMap(
  storage: StorageLike | null,
  map: Record<string, RadarViewSnapshot>
): void {
  if (!storage) return;
  try {
    const entries = Object.values(map)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_VIEW_SNAPSHOTS);
    const out: Record<string, RadarViewSnapshot> = Object.create(null);
    for (const item of entries) {
      out[item.viewId] = item;
    }
    storage.setItem(RADAR_VIEW_STORAGE_KEY, JSON.stringify(out));
  } catch {
    // ignore quota errors
  }
}

export function saveRadarViewSnapshot(
  input: Omit<RadarViewSnapshot, "updatedAt">,
  storage?: StorageLike | null,
  now: number = Date.now()
): void {
  const store = getSafeSessionStorage(storage);
  if (!store) return;

  const valid = sanitizeViewSnapshot({ ...input, updatedAt: now }, now);
  if (!valid) return;

  const current = readSnapshotMap(store, now);
  current[valid.viewId] = valid;
  writeSnapshotMap(store, current);
}

export function readRadarViewSnapshot(
  viewId: string,
  expectedRouteKey?: string,
  storage?: StorageLike | null,
  now: number = Date.now()
): RadarViewSnapshot | null {
  if (!VIEW_ID_RE.test(viewId) || FORBIDDEN_KEYS.has(viewId)) return null;
  const store = getSafeSessionStorage(storage);
  if (!store) return null;

  const map = readSnapshotMap(store, now);
  const found = map[viewId] ?? null;
  if (!found) return null;
  if (expectedRouteKey && found.routeKey !== expectedRouteKey) return null;
  return found;
}

export function updateRadarViewScroll(
  viewId: string,
  routeKey: string,
  scrollY: number,
  storage?: StorageLike | null,
  now: number = Date.now()
): void {
  if (!VIEW_ID_RE.test(viewId) || FORBIDDEN_KEYS.has(viewId)) return;
  const store = getSafeSessionStorage(storage);
  if (!store) return;

  const map = readSnapshotMap(store, now);
  const existing = map[viewId];
  if (!existing || existing.routeKey !== routeKey) return;

  existing.scrollY = sanitizeScrollY(scrollY);
  existing.updatedAt = now;
  writeSnapshotMap(store, map);
}

function sanitizeDetailReturnContext(
  raw: unknown,
  now: number
): DetailReturnContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const viewId = obj.viewId;
  const routeKey = obj.routeKey;
  const returnHref = obj.returnHref;
  const pathname = obj.pathname;
  const signalId = obj.signalId;
  const activeTab = obj.activeTab;
  const updatedAt = obj.updatedAt;

  if (typeof viewId !== "string" || !VIEW_ID_RE.test(viewId)) return null;
  if (typeof routeKey !== "string" || !routeKey || routeKey.length > 160) {
    return null;
  }
  if (!isSafeInternalPath(returnHref) || !isSafeInternalPath(pathname)) {
    return null;
  }
  if (!isSafeSignalId(signalId)) return null;
  if (!isValidTabFilter(activeTab)) return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  if (now - updatedAt > VIEW_SNAPSHOT_TTL_MS || updatedAt > now + 60_000) {
    return null;
  }

  const rawPlatform = obj.activePlatform;
  const activePlatform =
    typeof rawPlatform === "string" && isValidSourcePlatform(rawPlatform)
      ? rawPlatform
      : null;

  const activeTag = sanitizeFilterToken(obj.activeTag);
  const searchQuery = sanitizeFilterToken(obj.searchQuery) ?? "";
  const tagsExpanded = Boolean(obj.tagsExpanded);
  const scrollY = sanitizeScrollY(obj.scrollY);
  const rawDepth = obj.detailDepth;
  const detailDepth =
    typeof rawDepth === "number" && Number.isFinite(rawDepth) && rawDepth >= 1
      ? Math.min(32, Math.round(rawDepth))
      : 1;

  return {
    viewId,
    routeKey,
    returnHref,
    pathname,
    signalId,
    scrollY,
    activeTab,
    activePlatform,
    activeTag,
    tagsExpanded,
    searchQuery,
    detailDepth,
    pendingForwardRestore: Boolean(obj.pendingForwardRestore),
    updatedAt,
  };
}

export function saveDetailReturnContext(
  input: Omit<DetailReturnContext, "pendingForwardRestore" | "updatedAt"> & {
    pendingForwardRestore?: boolean;
  },
  storage?: StorageLike | null,
  now: number = Date.now()
): void {
  const store = getSafeSessionStorage(storage);
  if (!store) return;

  const valid = sanitizeDetailReturnContext(
    {
      ...input,
      pendingForwardRestore: Boolean(input.pendingForwardRestore),
      updatedAt: now,
    },
    now
  );
  if (!valid) return;

  try {
    store.setItem(DETAIL_RETURN_STORAGE_KEY, JSON.stringify(valid));
  } catch {
    // ignore storage errors
  }
}

export function readDetailReturnContext(
  storage?: StorageLike | null,
  now: number = Date.now()
): DetailReturnContext | null {
  const store = getSafeSessionStorage(storage);
  if (!store) return null;

  try {
    const rawText = store.getItem(DETAIL_RETURN_STORAGE_KEY);
    if (!rawText || rawText.length > 16_000) return null;
    return sanitizeDetailReturnContext(JSON.parse(rawText), now);
  } catch {
    return null;
  }
}

export function incrementDetailReturnDepth(
  nextSignalId: string,
  storage?: StorageLike | null,
  now: number = Date.now()
): void {
  if (!isSafeSignalId(nextSignalId)) return;
  const store = getSafeSessionStorage(storage);
  if (!store) return;

  const existing = readDetailReturnContext(store, now);
  if (!existing) return;

  saveDetailReturnContext(
    {
      ...existing,
      signalId: nextSignalId,
      detailDepth: existing.detailDepth + 1,
      pendingForwardRestore: existing.pendingForwardRestore,
    },
    store,
    now
  );
}

export function markDetailForwardRestore(
  storage?: StorageLike | null,
  now: number = Date.now()
): DetailReturnContext | null {
  const store = getSafeSessionStorage(storage);
  if (!store) return null;

  const existing = readDetailReturnContext(store, now);
  if (!existing) return null;

  const updated: DetailReturnContext = {
    ...existing,
    pendingForwardRestore: true,
    updatedAt: now,
  };
  try {
    store.setItem(DETAIL_RETURN_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
  return updated;
}

export function clearDetailReturnContext(storage?: StorageLike | null): void {
  const store = getSafeSessionStorage(storage);
  if (!store) return;
  try {
    store.removeItem(DETAIL_RETURN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function resolveRadarViewRestoration(params: {
  routeKey: string;
  pathname: string;
  search: string;
  hash: string;
  historyState: unknown;
  defaultTab: TabFilter;
  items?: ReadonlyArray<
    Pick<SignalItem, "sourcePlatform" | "isTopPick" | "tags">
  >;
  storage?: StorageLike | null;
  now?: number;
}): ResolvedRadarViewState {
  const now = params.now ?? Date.now();
  const store = getSafeSessionStorage(params.storage);
  const hasHashAnchor = Boolean(params.hash && params.hash.length > 1);
  const parsedQuery = parseRadarFilterQuery(params.search, {
    defaultTab: params.defaultTab,
    items: params.items,
  });

  // 1. 优先命中当前浏览器历史记录条目绑定的快照（覆盖浏览器后退/前进、router.back()、手势返回与 F5 刷新）
  const historyViewId = readHistoryViewId(params.historyState);
  if (historyViewId) {
    const snap = readRadarViewSnapshot(
      historyViewId,
      params.routeKey,
      store,
      now
    );
    if (snap) {
      const returnCtx = readDetailReturnContext(store, now);
      if (returnCtx && returnCtx.viewId === snap.viewId) {
        clearDetailReturnContext(store);
      }

      const queryEditedManually =
        snap.search !== params.search && parsedQuery.hasExplicitFilterParams;

      return {
        viewId: snap.viewId,
        activeTab: queryEditedManually ? parsedQuery.activeTab : snap.activeTab,
        activePlatform: queryEditedManually
          ? parsedQuery.activePlatform
          : snap.activePlatform,
        activeTag: queryEditedManually ? parsedQuery.activeTag : snap.activeTag,
        tagsExpanded: snap.tagsExpanded,
        searchQuery: queryEditedManually
          ? parsedQuery.searchQuery
          : snap.searchQuery,
        restoreScrollY: hasHashAnchor ? null : snap.scrollY,
        focusSignalId: hasHashAnchor ? null : snap.clickedSignalId,
        restored: true,
      };
    }
  }

  // 2. 兼容详情页多跳后点击「返回当期日报」或部分内置 WebView 剥离 history.state 的回退场景
  const returnCtx = readDetailReturnContext(store, now);
  const currentHref = `${params.pathname}${params.search}`;
  if (
    returnCtx &&
    returnCtx.routeKey === params.routeKey &&
    (returnCtx.pendingForwardRestore || returnCtx.returnHref === currentHref)
  ) {
    clearDetailReturnContext(store);
    return {
      viewId: historyViewId ?? createRadarViewId(),
      activeTab: returnCtx.activeTab,
      activePlatform: returnCtx.activePlatform,
      activeTag: returnCtx.activeTag,
      tagsExpanded: returnCtx.tagsExpanded,
      searchQuery: returnCtx.searchQuery,
      restoreScrollY: hasHashAnchor ? null : returnCtx.scrollY,
      focusSignalId: hasHashAnchor ? null : returnCtx.signalId,
      restored: true,
    };
  }

  // 3. 支持直接打开带筛选查询参数的分享链接（如 /zh?tab=all&source=github）
  if (parsedQuery.hasExplicitFilterParams) {
    return {
      viewId: historyViewId ?? createRadarViewId(),
      activeTab: parsedQuery.activeTab,
      activePlatform: parsedQuery.activePlatform,
      activeTag: parsedQuery.activeTag,
      tagsExpanded: false,
      searchQuery: parsedQuery.searchQuery,
      restoreScrollY: null,
      focusSignalId: null,
      restored: true,
    };
  }

  // 4. 全新访问默认初始状态
  return {
    viewId: createRadarViewId(),
    activeTab: params.defaultTab,
    activePlatform: null,
    activeTag: null,
    tagsExpanded: false,
    searchQuery: "",
    restoreScrollY: null,
    focusSignalId: null,
    restored: false,
  };
}
