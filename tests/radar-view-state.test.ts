import "./helpers/env-guard";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignalDetailView } from "../src/components/signal-detail-view";
import { LOCALES } from "../src/i18n/config";
import {
  buildRadarFilterUrl,
  clearDetailReturnContext,
  DETAIL_RETURN_STORAGE_KEY,
  HISTORY_VIEW_ID_KEY,
  incrementDetailReturnDepth,
  isSafeInternalPath,
  isValidTabFilter,
  markDetailForwardRestore,
  parseRadarFilterQuery,
  RADAR_VIEW_STORAGE_KEY,
  readDetailReturnContext,
  readRadarViewSnapshot,
  resolveRadarViewRestoration,
  saveDetailReturnContext,
  saveRadarViewSnapshot,
  type StorageLike,
  updateRadarViewScroll,
  VIEW_SNAPSHOT_TTL_MS,
} from "../src/lib/radar-view-state";
import { getSignalDetailPayload } from "../src/lib/signals-repo";
import { resetOfflineTestGuard } from "./helpers/env-guard";

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;

function createMemoryStorage(): StorageLike & { dump: () => Record<string, string> } {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}

describe("Radar List Filter, Scroll Position & Back Navigation Restoration", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
  });

  afterEach(() => {
    resetOfflineTestGuard();
  });

  describe("1. URL Filter Query Serialization & Parsing (radar-view-state.ts)", () => {
    it("round-trips tab, source platform, angle tag, and search query while preserving UTM & hash", () => {
      const built = buildRadarFilterUrl("/zh?utm_source=newsletter#top", {
        activeTab: "all",
        defaultTab: "top",
        activePlatform: "github",
        activeTag: "#开源商业化",
        searchQuery: "  agent  ",
      });

      assert.equal(
        built,
        "/zh?utm_source=newsletter&tab=all&source=github&tag=%23%E5%BC%80%E6%BA%90%E5%95%86%E4%B8%9A%E5%8C%96&q=agent#top"
      );

      const url = new URL(built, "https://radar.aibuildon.com");
      const parsed = parseRadarFilterQuery(url.search, { defaultTab: "top" });
      assert.equal(parsed.hasExplicitFilterParams, true);
      assert.equal(parsed.activeTab, "all");
      assert.equal(parsed.activePlatform, "github");
      assert.equal(parsed.activeTag, "#开源商业化");
      assert.equal(parsed.searchQuery, "agent");

      // Returning to default filters strips tab/source/tag/q cleanly while keeping utm_source
      const resetUrl = buildRadarFilterUrl(built, {
        activeTab: "top",
        defaultTab: "top",
        activePlatform: null,
        activeTag: null,
        searchQuery: "",
      });
      assert.equal(resetUrl, "/zh?utm_source=newsletter#top");
    });

    it("auto-expands default top tab to all when URL specifies a source or tag with non-top items, and rejects invalid tokens", () => {
      const sampleItems = [
        {
          sourcePlatform: "github" as const,
          isTopPick: true,
          tags: ["#AIAgent"],
        },
        {
          sourcePlatform: "github" as const,
          isTopPick: false,
          tags: ["#开源商业化"],
        },
      ];

      const sourceOnly = parseRadarFilterQuery("?source=github", {
        defaultTab: "top",
        items: sampleItems,
      });
      assert.equal(sourceOnly.activeTab, "all");
      assert.equal(sourceOnly.activePlatform, "github");

      const tagOnly = parseRadarFilterQuery(
        `?tag=${encodeURIComponent("#开源商业化")}`,
        {
          defaultTab: "top",
          items: sampleItems,
        }
      );
      assert.equal(tagOnly.activeTab, "all");
      assert.equal(tagOnly.activeTag, "#开源商业化");

      const invalid = parseRadarFilterQuery(
        "?tab=hacked&source=myspace&tag=%00%07&q=",
        { defaultTab: "top" }
      );
      assert.equal(invalid.hasExplicitFilterParams, false);
      assert.equal(invalid.activeTab, "top");
      assert.equal(invalid.activePlatform, null);
      assert.equal(invalid.activeTag, null);
      assert.equal(invalid.searchQuery, "");
      assert.equal(isValidTabFilter("all"), true);
      assert.equal(isValidTabFilter("saved"), true);
      assert.equal(isValidTabFilter("unknown"), false);
    });
  });

  describe("2. End-to-End List -> /signal/[id] -> Back Filter & Scroll Restoration", () => {
    it("restores selected tab (全部信号), source (GitHub), angle tag, scrollY, and focused card on Browser Back", () => {
      const storage = createMemoryStorage();
      const now = 1_760_000_000_000;
      const viewId = "rv_test_github_01";
      const routeKey = "zh:home:2026-11-24";

      // Step 1: User selects 全部信号 + GitHub + #开源商业化, expands tags, scrolls to 1580px, clicks card sig-20261124-05
      saveRadarViewSnapshot(
        {
          viewId,
          routeKey,
          pathname: "/zh",
          search: "?tab=all&source=github&tag=%23%E5%BC%80%E6%BA%90%E5%95%86%E4%B8%9A%E5%8C%96",
          activeTab: "all",
          activePlatform: "github",
          activeTag: "#开源商业化",
          tagsExpanded: true,
          searchQuery: "",
          scrollY: 1200,
          clickedSignalId: "sig-20261124-05",
        },
        storage,
        now
      );

      // Passive scroll updates scrollY to 1580px before click
      updateRadarViewScroll(viewId, routeKey, 1580.4, storage, now + 100);

      saveDetailReturnContext(
        {
          viewId,
          routeKey,
          returnHref:
            "/zh?tab=all&source=github&tag=%23%E5%BC%80%E6%BA%90%E5%95%86%E4%B8%9A%E5%8C%96",
          pathname: "/zh",
          signalId: "sig-20261124-05",
          scrollY: 1580,
          activeTab: "all",
          activePlatform: "github",
          activeTag: "#开源商业化",
          tagsExpanded: true,
          searchQuery: "",
          detailDepth: 1,
        },
        storage,
        now + 120
      );

      assert.equal(readDetailReturnContext(storage, now + 200)?.detailDepth, 1);

      // Step 2: User clicks Browser Back (history.state carries __afrViewId)
      const restored = resolveRadarViewRestoration({
        routeKey,
        pathname: "/zh",
        search:
          "?tab=all&source=github&tag=%23%E5%BC%80%E6%BA%90%E5%95%86%E4%B8%9A%E5%8C%96",
        hash: "",
        historyState: { [HISTORY_VIEW_ID_KEY]: viewId },
        defaultTab: "top",
        storage,
        now: now + 5_000,
      });

      assert.equal(restored.restored, true);
      assert.equal(restored.viewId, viewId);
      assert.equal(restored.activeTab, "all");
      assert.equal(restored.activePlatform, "github");
      assert.equal(restored.activeTag, "#开源商业化");
      assert.equal(restored.tagsExpanded, true);
      assert.equal(restored.restoreScrollY, 1580);
      assert.equal(restored.focusSignalId, "sig-20261124-05");
      // DetailReturnContext is cleaned up once back on the list
      assert.equal(readDetailReturnContext(storage, now + 5_000), null);

      // Hash deep-link (#sig-20261124-09) yields scroll/focus control to hash locator
      const withHash = resolveRadarViewRestoration({
        routeKey,
        pathname: "/zh",
        search: "?tab=all&source=github",
        hash: "#sig-20261124-09",
        historyState: { [HISTORY_VIEW_ID_KEY]: viewId },
        defaultTab: "top",
        storage,
        now: now + 6_000,
      });
      assert.equal(withHash.activeTab, "all");
      assert.equal(withHash.activePlatform, "github");
      assert.equal(withHash.restoreScrollY, null);
      assert.equal(withHash.focusSignalId, null);
    });

    it("supports multi-hop related signal browsing (detailDepth > 1) + in-page Back button & WebView stripped history.state", () => {
      const storage = createMemoryStorage();
      const now = 1_760_000_000_000;
      const routeKey = "zh:home:2026-11-24";

      saveDetailReturnContext(
        {
          viewId: "rv_chain_01",
          routeKey,
          returnHref: "/zh?tab=all&source=github",
          pathname: "/zh",
          signalId: "sig-20261123-01",
          scrollY: 940,
          activeTab: "all",
          activePlatform: "github",
          activeTag: null,
          tagsExpanded: false,
          searchQuery: "mcp",
          detailDepth: 1,
        },
        storage,
        now
      );

      // User clicks a related case on /signal/sig-20261123-01 -> /signal/sig-20261123-02
      incrementDetailReturnDepth("sig-20261123-02", storage, now + 1_000);
      const afterHop = readDetailReturnContext(storage, now + 1_000);
      assert.equal(afterHop?.detailDepth, 2);
      assert.equal(afterHop?.signalId, "sig-20261123-02");

      // User clicks in-page "← 返回当期日报" button -> marks pendingForwardRestore
      const marked = markDetailForwardRestore(storage, now + 2_000);
      assert.equal(marked?.pendingForwardRestore, true);

      // RadarBoard mounts on new history entry (no __afrViewId in historyState) -> still restores full state & scroll!
      const restored = resolveRadarViewRestoration({
        routeKey,
        pathname: "/zh",
        search: "?tab=all&source=github&q=mcp",
        hash: "",
        historyState: {},
        defaultTab: "top",
        storage,
        now: now + 2_100,
      });

      assert.equal(restored.restored, true);
      assert.equal(restored.activeTab, "all");
      assert.equal(restored.activePlatform, "github");
      assert.equal(restored.searchQuery, "mcp");
      assert.equal(restored.restoreScrollY, 940);
      assert.equal(restored.focusSignalId, "sig-20261123-02");
      assert.equal(readDetailReturnContext(storage, now + 2_100), null);

      // Clicking Brand Logo clears DetailReturnContext so fresh home visit starts clean at top
      saveDetailReturnContext(
        {
          viewId: "rv_logo_clear",
          routeKey,
          returnHref: "/zh?tab=all&source=github",
          pathname: "/zh",
          signalId: "sig-20261123-01",
          scrollY: 800,
          activeTab: "all",
          activePlatform: "github",
          activeTag: null,
          tagsExpanded: false,
          searchQuery: "",
          detailDepth: 1,
        },
        storage,
        now + 3_000
      );
      clearDetailReturnContext(storage);

      const freshHome = resolveRadarViewRestoration({
        routeKey,
        pathname: "/zh",
        search: "",
        hash: "",
        historyState: {},
        defaultTab: "top",
        storage,
        now: now + 3_100,
      });
      assert.equal(freshHome.restored, false);
      assert.equal(freshHome.activeTab, "top");
      assert.equal(freshHome.activePlatform, null);
      assert.equal(freshHome.restoreScrollY, null);
    });
  });

  describe("3. Security Sanitization, TTL Expiration & Snapshot Cap Guardrails", () => {
    it("blocks open-redirect paths, prototype pollution, invalid IDs, expired snapshots, and caps stored entries at 16", () => {
      assert.equal(isSafeInternalPath("/zh?tab=all"), true);
      assert.equal(isSafeInternalPath("//evil.example.com"), false);
      assert.equal(isSafeInternalPath("https://evil.example.com"), false);
      assert.equal(isSafeInternalPath("/\\evil.com"), false);
      assert.equal(isSafeInternalPath("javascript:alert(1)"), false);

      const storage = createMemoryStorage();
      const now = 1_760_000_000_000;

      // Hostile JSON in sessionStorage must never pollute Object.prototype or return unsafe URLs
      storage.setItem(
        RADAR_VIEW_STORAGE_KEY,
        `{"__proto__":{"pollutedView":true},"rv_evil":{"viewId":"rv_evil","routeKey":"zh:home:2026-11-24","pathname":"//evil.com","activeTab":"all","updatedAt":${now}}}`
      );
      storage.setItem(
        DETAIL_RETURN_STORAGE_KEY,
        JSON.stringify({
          viewId: "rv_evil",
          routeKey: "zh:home:2026-11-24",
          returnHref: "//evil.com/phish",
          pathname: "/zh",
          signalId: "sig-20261123-01",
          scrollY: 500,
          activeTab: "all",
          updatedAt: now,
        })
      );

      assert.equal(
        readRadarViewSnapshot("rv_evil", "zh:home:2026-11-24", storage, now),
        null
      );
      assert.equal(readDetailReturnContext(storage, now), null);
      assert.equal(
        ({} as Record<string, unknown>).pollutedView,
        undefined,
        "Object.prototype must never be polluted"
      );

      // TTL expiration (> 6h)
      saveRadarViewSnapshot(
        {
          viewId: "rv_expired_1",
          routeKey: "zh:home:2026-11-24",
          pathname: "/zh",
          search: "",
          activeTab: "all",
          activePlatform: "github",
          activeTag: null,
          tagsExpanded: false,
          searchQuery: "",
          scrollY: 400,
          clickedSignalId: null,
        },
        storage,
        now
      );
      assert.equal(
        readRadarViewSnapshot(
          "rv_expired_1",
          "zh:home:2026-11-24",
          storage,
          now + VIEW_SNAPSHOT_TTL_MS + 1_000
        ),
        null
      );

      // LRU bound cap at 16 snapshots
      for (let i = 0; i < 22; i += 1) {
        saveRadarViewSnapshot(
          {
            viewId: `rv_cap_${i}`,
            routeKey: "zh:home:2026-11-24",
            pathname: "/zh",
            search: "",
            activeTab: "all",
            activePlatform: null,
            activeTag: null,
            tagsExpanded: false,
            searchQuery: "",
            scrollY: i * 100,
            clickedSignalId: null,
          },
          storage,
          now + i * 1000
        );
      }
      assert.equal(
        readRadarViewSnapshot(
          "rv_cap_0",
          "zh:home:2026-11-24",
          storage,
          now + 25_000
        ),
        null
      );
      assert.equal(
        readRadarViewSnapshot(
          "rv_cap_21",
          "zh:home:2026-11-24",
          storage,
          now + 25_000
        )?.scrollY,
        2100
      );
    });

    it("renders SignalDetailView cleanly across all 4 locales with mobile & desktop back links and zero EN CJK leaks", async () => {
      for (const locale of LOCALES) {
        const payload = await getSignalDetailPayload(locale, "sig-20261123-02");
        assert.ok(payload);
        const html = renderToStaticMarkup(
          React.createElement(SignalDetailView, { payload })
        );
        assert.ok(html.includes("sm:hidden"));
        assert.ok(html.includes("sm:inline-flex"));
        if (locale === "en") {
          assert.equal(CJK_RE.test(html), false);
        }
      }
    });
  });
});
