import "./helpers/env-guard";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import nextConfig from "../next.config";
import { POST as subscribePost } from "../src/app/api/newsletter/subscribe/route";
import { GET as unsubscribeGet } from "../src/app/api/newsletter/unsubscribe/route";
import { POST as revalidatePost } from "../src/app/api/revalidate/route";
import {
  buildIndexNowUrlList,
  collectRevalidatePaths,
  isAuthorizedRevalidateToken,
  SIGNALS_CORPUS_CACHE_TAG,
} from "../src/lib/revalidate";
import {
  buildIncrementalSyncPlan,
  computeMergedScannedCount,
  evaluateScheduleGate,
  getUsPacificUtcOffsetHours,
  MORNING_BACKUP_CRON,
  MORNING_PRIMARY_CRON,
  US_NIGHT_PDT_CRON,
  US_NIGHT_PST_CRON,
} from "../src/lib/sync-schedule";
import { middleware } from "../src/middleware";
import {
  detectPreferredLocale,
  getSiteUrl,
  isPlausibleArchiveDate,
  LOCALE_LABELS,
  LOCALES,
} from "../src/i18n/config";
import { getDictionary } from "../src/i18n/dictionaries";
import {
  getNextThemeMode,
  LEGACY_THEME_STORAGE_KEY,
  normalizeThemeMode,
  resolveEffectiveDark,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "../src/lib/theme";
import {
  distillRawItem,
  extractJsonGeneric,
  formatGitHubDualBadges,
  setDistillerTimingScaleForTests,
  translateExistingSignalRow,
} from "../src/lib/ai-distiller";
import { installFetchMock, jsonResponse } from "./helpers/env-guard";
import { fetchViaJinaMarkdown } from "../src/lib/collectors/jina";
import { isSafePublicHttpUrl } from "../src/lib/collectors/sources";
import { localizeSourceSublabel } from "../src/lib/localize-sublabel";
import { normalizeAndValidateEmail } from "../src/lib/newsletter";
import {
  clearSignalsRepoMemoryCache,
  getAllAvailableDates,
  getRadarPayload,
  getSeoHubIndex,
} from "../src/lib/signals-repo";
import {
  buildSignalPermalink,
  formatDeterministicClock,
  formatHeaderArchiveDate,
  formatSignalShareBrief,
  toSafeHttpUrl,
} from "../src/lib/utils";
import { toTraditionalTw } from "../src/lib/zh-convert";

const HAS_SIMPLIFIED_CHINESE_RE = /[\u4e00-\u9fff]/;

test("localizeSourceSublabel localizes all known collector sublabels cleanly", () => {
  assert.equal(
    localizeSourceSublabel("美区效率畅销 #12", "en"),
    "US Productivity #12"
  );
  assert.equal(
    localizeSourceSublabel("日区工具畅销 #4", "ja"),
    "JP ユーティリティ #4"
  );
  assert.equal(
    localizeSourceSublabel("美区工具畅销 #2", "zh-TW"),
    "美區工具暢銷 #2"
  );
  assert.equal(
    localizeSourceSublabel("TrustMRR 实名榜", "en"),
    "Verified Leaderboard"
  );
  assert.equal(
    localizeSourceSublabel("GitHub 7日新锐", "en"),
    "7d Breakout"
  );
  assert.equal(
    localizeSourceSublabel("IH 实战热帖", "ja"),
    "実践レポート"
  );
  assert.equal(
    localizeSourceSublabel("Acquire 待售挂牌", "en"),
    "For-Sale Listing"
  );
  assert.equal(
    localizeSourceSublabel("TrustMRR 飙升榜", "en"),
    "Trending MRR"
  );
  assert.equal(
    localizeSourceSublabel("US Productivity 异动", "en"),
    "US Productivity Movers"
  );

  // Unknown Chinese sublabel gets converted to Traditional Chinese when server converter is passed
  assert.equal(
    localizeSourceSublabel("软件信息", "zh-TW", toTraditionalTw),
    "軟體資訊"
  );
});

test("formatDeterministicClock produces timezone-stable hydration-safe strings", () => {
  const iso = "2026-11-23T01:30:00.000Z";
  assert.equal(formatDeterministicClock(iso, "en"), "01:30 UTC");
  assert.equal(formatDeterministicClock(iso, "zh"), "09:30");
  assert.equal(formatDeterministicClock(iso, "zh-TW"), "09:30");
  assert.equal(formatDeterministicClock(iso, "ja"), "10:30");
  assert.equal(formatDeterministicClock("invalid-date", "en"), "");
});

test("formatHeaderArchiveDate omits year within reference year and preserves year across years, and header archive popover stays SSR-crawlable", () => {
  // Same year as latest archive -> MM-DD
  assert.equal(formatHeaderArchiveDate("2026-11-24", "2026-11-24"), "11-24");
  assert.equal(formatHeaderArchiveDate("2026-01-05", "2026-11-24"), "01-05");

  // Cross-year archive (e.g., browsing Dec 2026 from Jan 2027, or older SEO archive) -> YYYY-MM-DD
  assert.equal(
    formatHeaderArchiveDate("2026-12-30", "2027-01-02"),
    "2026-12-30"
  );
  assert.equal(
    formatHeaderArchiveDate("2025-11-24", "2026-11-24"),
    "2025-11-24"
  );

  // Missing or malformed inputs fall back safely without throwing
  assert.equal(formatHeaderArchiveDate("2026-11-24", undefined), "2026-11-24");
  assert.equal(formatHeaderArchiveDate("2026-11-24", ""), "2026-11-24");
  assert.equal(formatHeaderArchiveDate("invalid", "2026-11-24"), "invalid");

  // Guardrail: top bar removes ChevronLeft/ChevronRight arrows while keeping archive links in SSR HTML via CSS hidden
  const boardSource = readFileSync("src/components/radar-board.tsx", "utf8");
  assert.equal(boardSource.includes("ChevronLeft"), false);
  assert.equal(boardSource.includes("ChevronRight"), false);
  assert.equal(boardSource.includes("{datePickerOpen &&"), false);
  assert.ok(boardSource.includes('id="daily-archive-popover"'));
  assert.ok(boardSource.includes('!datePickerOpen && "hidden"'));
});

test("SSRF guard rejects private, loopback, metadata, and non-HTTP URLs", () => {
  assert.equal(isSafePublicHttpUrl("https://trustmrr.com/startup/acme"), true);
  assert.equal(isSafePublicHttpUrl("http://127.0.0.1:8080/v1/models"), false);
  assert.equal(isSafePublicHttpUrl("http://localhost/admin"), false);
  assert.equal(isSafePublicHttpUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafePublicHttpUrl("http://10.0.0.1/internal"), false);
  assert.equal(isSafePublicHttpUrl("http://192.168.1.1/"), false);
  assert.equal(isSafePublicHttpUrl("http://[::1]/"), false);
  assert.equal(isSafePublicHttpUrl("http://[::ffff:127.0.0.1]/"), false);
  assert.equal(isSafePublicHttpUrl("http://metadata.google.internal/"), false);
  assert.equal(isSafePublicHttpUrl("https://user:pass@example.com/"), false);
  assert.equal(isSafePublicHttpUrl("javascript:alert(1)"), false);
  assert.equal(toSafeHttpUrl("javascript:alert(1)"), "#");
});

test("fetchViaJinaMarkdown rejects unsafe private URLs immediately", async () => {
  const res = await fetchViaJinaMarkdown("http://127.0.0.1:8080/secret", 500);
  assert.equal(res, null);
});

test("distillRawItem caps fallback score and marks usedLlm=false when no LLM is reachable", async () => {
  const prevEnv = {
    CI: process.env.CI,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    LLM_API_KEY: process.env.LLM_API_KEY,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    RAPID_MLX_URL: process.env.RAPID_MLX_URL,
  };
  process.env.CI = "true";
  delete process.env.GEMINI_API_KEY;
  delete process.env.LLM_API_KEY;
  delete process.env.OLLAMA_MODEL;
  delete process.env.RAPID_MLX_URL;

  try {
    const result = await distillRawItem(
      {
        title: "Profitable B2B SaaS doing $25k MRR",
        summary: "Verified Stripe revenue $25k MRR, asking $600k.",
        url: "https://app.acquire.com/public/test-saas-listing",
        sourcePlatform: "acquire",
        sourceSublabel: "Acquire 待售挂牌",
        rawMetric: "ARR $300k",
        publishedAt: "2026-11-23T00:00:00.000Z",
      },
      "2026-11-23",
      0
    );

    assert.equal(result.usedLlm, false);
    assert.equal(result.item.score, 5.0);
    assert.ok(result.item.score < 6.3);
    assert.equal(result.item.isTopPick, false);
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("translateExistingSignalRow never pollutes en/ja with Chinese text on LLM failure", async () => {
  const prevEnv = {
    CI: process.env.CI,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    LLM_API_KEY: process.env.LLM_API_KEY,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    RAPID_MLX_URL: process.env.RAPID_MLX_URL,
  };
  process.env.CI = "true";
  delete process.env.GEMINI_API_KEY;
  delete process.env.LLM_API_KEY;
  delete process.env.OLLAMA_MODEL;
  delete process.env.RAPID_MLX_URL;

  try {
    const res = await translateExistingSignalRow(
      {
        titleZh: "单人开发软件达到 $10k MRR",
        titleOrig: "Solo SaaS hits $10k MRR",
        whatItIs: "帮助独立开发者自动监控链接。",
        businessSignal: "$19/月订阅。",
        indieTakeaway: "切垂直场景更容易付费。",
        metricsBadge: "$10k MRR",
        tags: ["#独立开发"],
        sourcePlatform: "reddit",
        existingTranslations: {},
      },
      0
    );

    assert.equal(res.translatedByLlm, false);
    assert.equal(res.changed, true); // zh-TW derived locally via OpenCC
    assert.equal(res.translations["zh-TW"]?.title, "單人開發軟體達到 $10k MRR");
    assert.equal(res.translations.en, undefined);
    assert.equal(res.translations.ja, undefined);
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("extractJsonGeneric strips think tags and markdown fences", () => {
  const raw = `<think>reasoning here</think>\n\`\`\`json\n{"score": 8.9, "ok": true}\n\`\`\``;
  assert.deepEqual(extractJsonGeneric<{ score: number; ok: boolean }>(raw), {
    score: 8.9,
    ok: true,
  });
  assert.equal(extractJsonGeneric("not json at all"), null);
});

test("i18n config, email validation, and siteUrl fallback behave cleanly", () => {
  const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const prevVercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    assert.equal(getSiteUrl(), "https://radar.aibuildon.com");
  } finally {
    if (prevSiteUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl;
    if (prevVercelUrl !== undefined)
      process.env.VERCEL_PROJECT_PRODUCTION_URL = prevVercelUrl;
  }

  assert.equal(detectPreferredLocale("zh-TW,zh;q=0.9,en;q=0.8"), "zh-TW");
  assert.equal(detectPreferredLocale("zh-CN,zh;q=0.9"), "zh");
  assert.equal(detectPreferredLocale("ja,en-US;q=0.8"), "ja");
  assert.equal(detectPreferredLocale("fr-FR,de;q=0.7"), "en");
  assert.equal(detectPreferredLocale("en-US", "ja"), "ja");

  assert.equal(isPlausibleArchiveDate("2026-11-23"), true);
  assert.equal(isPlausibleArchiveDate("2025-12-31"), false);
  assert.equal(isPlausibleArchiveDate("2026-02-30"), false);
  assert.equal(isPlausibleArchiveDate("2099-01-01"), false);

  assert.equal(normalizeAndValidateEmail("  Founder@Example.COM "), "founder@example.com");
  assert.equal(normalizeAndValidateEmail("bad-email"), null);
  assert.equal(normalizeAndValidateEmail("a@b\r\ncc:evil@x.com"), null);
});

test("3-way theme mode defaults to system and resolves light/dark without FOUC", () => {
  assert.equal(LOCALE_LABELS.en.short, "EN");
  assert.equal(LOCALE_LABELS.zh.short, "简");
  assert.equal(LOCALE_LABELS["zh-TW"].short, "繁");
  assert.equal(LOCALE_LABELS.ja.short, "JP");

  assert.equal(normalizeThemeMode(null), "system");
  assert.equal(normalizeThemeMode(undefined), "system");
  assert.equal(normalizeThemeMode("invalid"), "system");
  assert.equal(normalizeThemeMode("system"), "system");
  assert.equal(normalizeThemeMode("light"), "light");
  assert.equal(normalizeThemeMode("dark"), "dark");

  assert.equal(resolveEffectiveDark("system", true), true);
  assert.equal(resolveEffectiveDark("system", false), false);
  assert.equal(resolveEffectiveDark("light", true), false);
  assert.equal(resolveEffectiveDark("light", false), false);
  assert.equal(resolveEffectiveDark("dark", true), true);
  assert.equal(resolveEffectiveDark("dark", false), true);

  assert.equal(getNextThemeMode("system"), "light");
  assert.equal(getNextThemeMode("light"), "dark");
  assert.equal(getNextThemeMode("dark"), "system");

  // Verify inline <head> THEME_INIT_SCRIPT across unset, "system", "light", "dark", and legacy keys
  const runInitScript = (
    storage: Record<string, string>,
    osDark: boolean
  ): boolean => {
    let darkApplied = false;
    const fn = new Function(
      "localStorage",
      "window",
      "document",
      THEME_INIT_SCRIPT
    );
    fn(
      { getItem: (k: string) => storage[k] ?? null },
      { matchMedia: () => ({ matches: osDark }) },
      {
        documentElement: {
          classList: {
            toggle: (_cls: string, force: boolean) => {
              darkApplied = Boolean(force);
            },
          },
        },
      }
    );
    return darkApplied;
  };

  assert.equal(runInitScript({}, true), true);
  assert.equal(runInitScript({}, false), false);
  assert.equal(runInitScript({ [THEME_STORAGE_KEY]: "system" }, true), true);
  assert.equal(runInitScript({ [THEME_STORAGE_KEY]: "system" }, false), false);
  assert.equal(runInitScript({ [THEME_STORAGE_KEY]: "light" }, true), false);
  assert.equal(runInitScript({ [THEME_STORAGE_KEY]: "dark" }, false), true);
  assert.equal(
    runInitScript({ [LEGACY_THEME_STORAGE_KEY]: "dark" }, false),
    true
  );
});

test("local-fallback dataset & all 4 locale dictionaries are internally consistent", async () => {
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const dates = await getAllAvailableDates();
    assert.ok(dates.length >= 2);

    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      assert.ok(LOCALE_LABELS[locale].short.length > 0);
      assert.ok(LOCALE_LABELS[locale].native.length > 0);
      assert.ok(dict.tabs.ai_trend.length > 0);
      assert.ok(dict.header.jumpToDate.length > 0);
      assert.ok(dict.header.backToLatestDate.length > 0);
      assert.ok(dict.header.languageMenuTitle.length > 0);
      assert.ok(dict.header.themeSystem.length > 0);
      assert.ok(dict.header.themeLight.length > 0);
      assert.ok(dict.header.themeDark.length > 0);
      if (locale === "en") {
        assert.equal(dict.header.languageMenuTitle, "Language");
        assert.equal(
          HAS_SIMPLIFIED_CHINESE_RE.test(
            `${dict.header.themeSystem} ${dict.header.themeLight} ${dict.header.themeDark}`
          ),
          false
        );
      }
      assert.ok(dict.header.archiveCount(12).includes("12"));
      assert.ok(dict.card.copyBrief.length > 0);
      assert.ok(dict.card.copiedBrief.length > 0);
      assert.ok(dict.card.copyBriefTooltip.length > 0);
      assert.ok(dict.card.shareLinkLabel.length > 0);
      assert.ok(dict.card.filterByTag("#SaaS").includes("#SaaS"));
      assert.ok(dict.sidebar.newsletterLocalDemo.length > 0);
      assert.ok(dict.notFound.title.length > 0);
      assert.ok(dict.errorPage.title.length > 0);
      assert.ok(dict.card.archivedFrom("2026-11-22").includes("2026-11-22"));

      for (const date of dates) {
        const payload = await getRadarPayload(locale, date);
        assert.equal(payload.storageMode, "local-fallback");
        assert.equal(payload.activeDate, date);
        assert.equal(
          payload.overview.selectedCount,
          payload.items.length,
          `selectedCount mismatch for ${locale}/${date}`
        );

        if (locale === "en") {
          for (const item of payload.items) {
            assert.equal(
              HAS_SIMPLIFIED_CHINESE_RE.test(item.sourceSublabel),
              false,
              `Chinese sublabel leaked to EN: ${item.sourceSublabel}`
            );
            assert.equal(
              HAS_SIMPLIFIED_CHINESE_RE.test(item.title),
              false,
              `Chinese title leaked to EN: ${item.title}`
            );
          }
        }
      }
    }
  } finally {
    if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
  }
});

test("middleware bypasses static icons/manifest and redirects root by Accept-Language", () => {
  for (const bypassPath of [
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
  ]) {
    const res = middleware(new NextRequest(`https://radar.aibuildon.com${bypassPath}`));
    assert.equal(res.status, 200, `Expected pass-through for ${bypassPath}`);
    assert.equal(res.headers.get("location"), null);
  }

  const rootJa = middleware(
    new NextRequest("https://radar.aibuildon.com/", {
      headers: { "accept-language": "ja,en;q=0.8" },
    })
  );
  assert.equal(rootJa.status, 307);
  assert.equal(rootJa.headers.get("location"), "https://radar.aibuildon.com/ja");
});

test("newsletter API routes handle DB_NOT_CONFIGURED and unsubscribe errors honestly", async () => {
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const subRes = await subscribePost(
      new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.42",
        },
        body: JSON.stringify({ email: "founder@example.com", locale: "en" }),
      })
    );
    assert.equal(subRes.status, 503);
    const subJson = (await subRes.json()) as { ok: boolean; code: string };
    assert.equal(subJson.ok, false);
    assert.equal(subJson.code, "DB_NOT_CONFIGURED");

    const unsubNoDb = await unsubscribeGet(
      new NextRequest(
        "https://radar.aibuildon.com/api/newsletter/unsubscribe?token=0123456789abcdef0123456789abcdef"
      )
    );
    assert.equal(unsubNoDb.status, 503);

    const unsubInvalid = await unsubscribeGet(
      new NextRequest(
        "https://radar.aibuildon.com/api/newsletter/unsubscribe?token=invalid"
      )
    );
    assert.equal(unsubInvalid.status, 200);
  } finally {
    if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
  }
});

test("security CSP header allows *.clarity.ms scripts", async () => {
  const rules = await nextConfig.headers?.();
  assert.ok(rules && rules.length > 0);
  const cspHeader = rules[0].headers.find(
    (h) => h.key === "Content-Security-Policy"
  );
  assert.ok(cspHeader, "CSP header configured");
  assert.ok(
    cspHeader.value.includes("https://*.clarity.ms"),
    "CSP script-src includes https://*.clarity.ms"
  );
});

test("daily-radar GitHub Actions workflow uses odd-minute morning + DST-aware US late-night crons", () => {
  const yml = readFileSync(".github/workflows/daily-radar.yml", "utf8");
  assert.ok(yml.includes(`cron: "${MORNING_PRIMARY_CRON}"`), "primary morning cron present");
  assert.ok(yml.includes(`cron: "${MORNING_BACKUP_CRON}"`), "backup morning cron present");
  assert.ok(yml.includes(`cron: "${US_NIGHT_PDT_CRON}"`), "US late-night PDT cron present");
  assert.ok(yml.includes(`cron: "${US_NIGHT_PST_CRON}"`), "US late-night PST cron present");
  assert.ok(yml.includes("workflow_dispatch:"), "manual trigger enabled");
  assert.ok(yml.includes("group: daily-radar-sync"), "concurrency group configured");
  assert.ok(
    yml.includes("id: schedule_gate") && yml.includes('TZ="America/Los_Angeles" date +%z'),
    "DST pre-checkout schedule gate configured"
  );
  assert.ok(
    yml.includes("SKIP_IF_TODAY_SYNCED:") &&
      yml.includes("github.event.schedule == '17 0 * * *'"),
    "idempotent skip applies strictly to morning fallback cron, not US late-night supplement"
  );
  assert.ok(
    yml.includes("REVALIDATE_SECRET:"),
    "on-demand revalidation secret passed in workflow"
  );
});

test("sync-schedule DST gate and incremental deduplication planner cover winter/summer & App Store cap", () => {
  // 1. Summer PDT (July: UTC-7): 33 6 * * * runs (even if delayed past 07:00 UTC), 33 7 * * * skips
  const summerQueuedLate = new Date("2026-07-15T07:08:00Z"); // 00:08 PDT after 35m runner delay
  assert.equal(getUsPacificUtcOffsetHours(summerQueuedLate), -7);

  const pdtInSummer = evaluateScheduleGate({
    eventName: "schedule",
    scheduleCron: US_NIGHT_PDT_CRON,
    now: summerQueuedLate,
  });
  assert.equal(pdtInSummer.shouldRun, true);
  assert.equal(pdtInSummer.isUsNightSupplement, true);

  const pstInSummer = evaluateScheduleGate({
    eventName: "schedule",
    scheduleCron: US_NIGHT_PST_CRON,
    now: summerQueuedLate,
  });
  assert.equal(pstInSummer.shouldRun, false);
  assert.equal(pstInSummer.isUsNightSupplement, true);

  // 2. Winter PST (November: UTC-8): 33 6 * * * skips, 33 7 * * * runs (even if delayed past 08:00 UTC)
  const winterQueuedLate = new Date("2026-11-24T08:08:00Z"); // 00:08 PST after 35m runner delay
  assert.equal(getUsPacificUtcOffsetHours(winterQueuedLate), -8);

  const pdtInWinter = evaluateScheduleGate({
    eventName: "schedule",
    scheduleCron: US_NIGHT_PDT_CRON,
    now: winterQueuedLate,
  });
  assert.equal(pdtInWinter.shouldRun, false);

  const pstInWinter = evaluateScheduleGate({
    eventName: "schedule",
    scheduleCron: US_NIGHT_PST_CRON,
    now: winterQueuedLate,
  });
  assert.equal(pstInWinter.shouldRun, true);
  assert.equal(pstInWinter.isUsNightSupplement, true);

  // 3. Morning primary, morning backup, and manual dispatch always pass gate
  const backupGate = evaluateScheduleGate({
    eventName: "schedule",
    scheduleCron: MORNING_BACKUP_CRON,
    now: winterQueuedLate,
  });
  assert.equal(backupGate.shouldRun, true);
  assert.equal(backupGate.isMorningBackup, true);

  const primaryGate = evaluateScheduleGate({
    eventName: "schedule",
    scheduleCron: MORNING_PRIMARY_CRON,
    now: winterQueuedLate,
  });
  assert.equal(primaryGate.shouldRun, true);
  assert.equal(primaryGate.isMorningBackup, false);

  const manualGate = evaluateScheduleGate({
    eventName: "workflow_dispatch",
    now: winterQueuedLate,
  });
  assert.equal(manualGate.shouldRun, true);

  // 4. Incremental sync plan: Morning empty state vs Afternoon supplement state
  const morningPlan = buildIncrementalSyncPlan({
    historicalUrls: ["https://example.com/old-1"],
    todayRows: [],
    defaultAppStoreLimit: 10,
  });
  assert.equal(morningPlan.isSupplementRun, false);
  assert.equal(morningPlan.appStoreLimit, 10);
  assert.equal(morningPlan.collectorExcludeUrls.size, 1);

  const partialWithoutAppStore = buildIncrementalSyncPlan({
    historicalUrls: ["https://example.com/old-1"],
    todayRows: [
      { sourceUrl: "https://www.producthunt.com/posts/foo", sourcePlatform: "producthunt" },
    ],
    defaultAppStoreLimit: 10,
  });
  assert.equal(partialWithoutAppStore.isSupplementRun, true);
  assert.equal(partialWithoutAppStore.appStoreLimit, 10);
  assert.equal(
    partialWithoutAppStore.collectorExcludeUrls.has("https://www.producthunt.com/posts/foo"),
    true
  );

  const afternoonSupplementPlan = buildIncrementalSyncPlan({
    historicalUrls: ["https://example.com/old-1"],
    todayRows: [
      { sourceUrl: "https://www.producthunt.com/posts/foo", sourcePlatform: "producthunt" },
      { sourceUrl: "https://apps.apple.com/us/app/bar/id123", sourcePlatform: "appstore" },
    ],
    defaultAppStoreLimit: 10,
  });
  assert.equal(afternoonSupplementPlan.isSupplementRun, true);
  assert.equal(afternoonSupplementPlan.todayAppStoreCount, 1);
  assert.equal(afternoonSupplementPlan.appStoreLimit, 0);
  assert.equal(afternoonSupplementPlan.collectorExcludeUrls.size, 3);

  // 5. Merged scannedCount accumulation without zero-addition inflation
  assert.equal(
    computeMergedScannedCount({
      previousScannedCount: undefined,
      currentScannedCount: 310,
      newlyDistilledCount: 22,
    }),
    310
  );
  assert.equal(
    computeMergedScannedCount({
      previousScannedCount: 310,
      currentScannedCount: 145,
      newlyDistilledCount: 9,
    }),
    455
  );
  assert.equal(
    computeMergedScannedCount({
      previousScannedCount: 455,
      currentScannedCount: 140,
      newlyDistilledCount: 0,
    }),
    455
  );
});

test("on-demand revalidate API enforces secret auth and collects localized paths", async () => {
  assert.equal(isAuthorizedRevalidateToken("Bearer my-secret", "my-secret"), true);
  assert.equal(isAuthorizedRevalidateToken("Bearer wrong", "my-secret"), false);
  assert.equal(isAuthorizedRevalidateToken("Basic my-secret", "my-secret"), false);
  assert.equal(isAuthorizedRevalidateToken(null, "my-secret"), false);
  assert.equal(isAuthorizedRevalidateToken("Bearer my-secret", ""), false);

  const paths = collectRevalidatePaths("2026-11-24", "2026-11-23");
  assert.ok(paths.includes("/en"));
  assert.ok(paths.includes("/zh"));
  assert.ok(paths.includes("/en/daily/2026-11-24"));
  assert.ok(paths.includes("/zh/daily/2026-11-23"));
  assert.ok(paths.includes("/sitemap.xml"));
  assert.equal(SIGNALS_CORPUS_CACHE_TAG, "signals-corpus");

  // IndexNow URL list expands touched canonical topic & source hubs across all 4 locales
  const indexNowUrls = buildIndexNowUrlList({
    siteUrl: "https://radar.aibuildon.com/",
    dateKey: "2026-11-24",
    items: [
      {
        titleZh: "Shopify 卖家 Chrome 插件达到 $12k MRR",
        titleOrig: "Shopify seller Chrome extension hits $12k MRR",
        whatItIs: "自动化商品背景图生成插件",
        businessSignal: "$19/mo Stripe 订阅",
        indieTakeaway: "切入 Shopify 垂直小插件",
        tags: ["#Chrome插件", "#Shopify"],
        sourcePlatform: "trustmrr",
        sourceSublabel: "TrustMRR 实名榜",
      },
    ],
  });
  assert.ok(indexNowUrls.includes("https://radar.aibuildon.com/zh"));
  assert.ok(
    indexNowUrls.includes("https://radar.aibuildon.com/en/daily/2026-11-24")
  );
  assert.ok(
    indexNowUrls.includes(
      "https://radar.aibuildon.com/zh/topic/chrome-extension"
    )
  );
  assert.ok(
    indexNowUrls.includes("https://radar.aibuildon.com/ja/topic/shopify")
  );
  assert.ok(
    indexNowUrls.includes("https://radar.aibuildon.com/zh-TW/topic/stripe")
  );
  assert.ok(
    indexNowUrls.includes("https://radar.aibuildon.com/en/source/trustmrr")
  );
  assert.equal(
    indexNowUrls.some((u) => u.endsWith("/source/reddit")),
    false
  );

  const prevSecret = process.env.REVALIDATE_SECRET;
  delete process.env.REVALIDATE_SECRET;
  try {
    const res503 = await revalidatePost(
      new NextRequest("https://radar.aibuildon.com/api/revalidate", {
        method: "POST",
      })
    );
    assert.equal(res503.status, 503);

    process.env.REVALIDATE_SECRET = "test-revalidate-secret-123";
    const res401 = await revalidatePost(
      new NextRequest("https://radar.aibuildon.com/api/revalidate", {
        method: "POST",
        headers: { Authorization: "Bearer invalid" },
      })
    );
    assert.equal(res401.status, 401);
  } finally {
    if (prevSecret === undefined) delete process.env.REVALIDATE_SECRET;
    else process.env.REVALIDATE_SECRET = prevSecret;
  }
});

test("GitHub dual-metric badges across all 4 locales are locked and never overwritten by LLM", async () => {
  // 1. Pure formatting assertions for both deltaKind modes
  assert.deepEqual(
    formatGitHubDualBadges({
      totalStars: 14_100,
      starsDelta: 908,
      deltaKind: "today",
    }),
    {
      zh: "★ 14.1k (+908 今日)",
      "zh-TW": "★ 14.1k (+908 今日)",
      en: "★ 14.1k (+908 today)",
      ja: "★ 14.1k (+908 本日)",
    }
  );

  assert.deepEqual(
    formatGitHubDualBadges({
      totalStars: 2_800,
      starsDelta: 460,
      deltaKind: "per_day",
    }),
    {
      zh: "★ 2.8k (+460/日)",
      "zh-TW": "★ 2.8k (+460/日)",
      en: "★ 2.8k (+460/d)",
      ja: "★ 2.8k (+460/日)",
    }
  );

  // 2. End-to-end distillRawItem test: LLM tries to drop half of the metric in every locale
  const prevEnv = {
    CI: process.env.CI,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    LLM_API_KEY: process.env.LLM_API_KEY,
  };
  process.env.CI = "true";
  process.env.GEMINI_API_KEY = "fake_gemini_key_for_github_badge_lock";
  delete process.env.LLM_API_KEY;
  setDistillerTimingScaleForTests(0);

  const mock = installFetchMock(() =>
    jsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  category: "ai_trend",
                  metricType: "heat",
                  score: 8.8,
                  metricsBadge: "▲ 今日 2,037 星",
                  zh: {
                    title: "开源浏览器自动化工作流引擎",
                    whatItIs: "面向 AI Agent 的无头浏览器自动化与回放工具。",
                    businessSignal: "MIT 开源，官方提供云端托管沙箱订阅变现。",
                    indieTakeaway: "可基于此封装垂直电商与外贸采集 SaaS。",
                    metricsBadge: "▲ 今日 908 星",
                    tags: ["#开源AI", "#Agent"],
                  },
                  en: {
                    title: "Open-Source Headless Browser Workflow SDK for AI Agents",
                    whatItIs: "Browser automation and replay studio built for LLM agents.",
                    businessSignal: "MIT core with paid cloud browser sandbox.",
                    indieTakeaway: "Wrap into vertical scraping micro-SaaS.",
                    metricsBadge: "★ 14.1k Stars",
                    tags: ["#OpenSource", "#AIAgents"],
                  },
                  ja: {
                    title: "AIエージェント向けOSSヘッドレスブラウザ自動化SDK",
                    whatItIs: "LLMエージェント専用のブラウザ操作・リプレイ基盤。",
                    businessSignal: "MITライセンス＋クラウド版で収益化。",
                    indieTakeaway: "特化型自動操作SaaSへの応用が可能。",
                    metricsBadge: "★ 14.1k",
                    tags: ["#OSS", "#AIエージェント"],
                  },
                }),
              },
            ],
          },
        },
      ],
    })
  );

  try {
    // Case A: deltaKind = "today" via structured githubStats
    const todayRes = await distillRawItem(
      {
        title: "acme/agent-browser — Headless browser workflow SDK",
        summary: "GitHub Trending Daily (TypeScript, ★ 14,100, +908 stars today)",
        url: "https://github.com/acme/agent-browser",
        sourcePlatform: "github",
        sourceSublabel: "GitHub Trending",
        rawMetric: "★ 14.1k (+908 今日)",
        publishedAt: "2026-11-24T01:00:00.000Z",
        githubStats: {
          totalStars: 14_100,
          starsDelta: 908,
          deltaKind: "today",
        },
      },
      "2026-11-24",
      0
    );

    assert.equal(todayRes.usedLlm, true);
    assert.equal(todayRes.item.metricsBadge, "★ 14.1k (+908 今日)");
    assert.equal(
      todayRes.item.translations?.["zh-TW"]?.metricsBadge,
      "★ 14.1k (+908 今日)"
    );
    assert.equal(
      todayRes.item.translations?.en?.metricsBadge,
      "★ 14.1k (+908 today)"
    );
    assert.equal(
      todayRes.item.translations?.ja?.metricsBadge,
      "★ 14.1k (+908 本日)"
    );

    // Case B: deltaKind = "per_day" via structured githubStats
    const perDayRes = await distillRawItem(
      {
        title: "indie/mcp-billing — Stripe metering gateway for MCP",
        summary: "7-Day Breakout Open-Source Repo (TypeScript, ★ 2800)",
        url: "https://github.com/indie/mcp-billing",
        sourcePlatform: "github",
        sourceSublabel: "GitHub 7日新锐",
        rawMetric: "★ 2.8k (+460/日)",
        publishedAt: "2026-11-18T01:00:00.000Z",
        githubStats: {
          totalStars: 2_800,
          starsDelta: 460,
          deltaKind: "per_day",
        },
      },
      "2026-11-24",
      0
    );

    assert.equal(perDayRes.usedLlm, true);
    assert.equal(perDayRes.item.metricsBadge, "★ 2.8k (+460/日)");
    assert.equal(
      perDayRes.item.translations?.["zh-TW"]?.metricsBadge,
      "★ 2.8k (+460/日)"
    );
    assert.equal(
      perDayRes.item.translations?.en?.metricsBadge,
      "★ 2.8k (+460/d)"
    );
    assert.equal(
      perDayRes.item.translations?.ja?.metricsBadge,
      "★ 2.8k (+460/日)"
    );

    // Case C: Fallback parsing from rawMetric when githubStats is omitted
    const parsedFromMetricRes = await distillRawItem(
      {
        title: "rust-ai/fast-rag — Rust RAG engine",
        summary: "GitHub Trending Rust",
        url: "https://github.com/rust-ai/fast-rag",
        sourcePlatform: "github",
        sourceSublabel: "GitHub Trending",
        rawMetric: "★ 6.2k (+512 今日)",
        publishedAt: "2026-11-24T01:00:00.000Z",
      },
      "2026-11-24",
      0
    );

    assert.equal(parsedFromMetricRes.item.metricsBadge, "★ 6.2k (+512 今日)");
    assert.equal(
      parsedFromMetricRes.item.translations?.en?.metricsBadge,
      "★ 6.2k (+512 today)"
    );
    assert.equal(
      parsedFromMetricRes.item.translations?.ja?.metricsBadge,
      "★ 6.2k (+512 本日)"
    );
  } finally {
    mock.restore();
    setDistillerTimingScaleForTests(1);
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("buildSignalPermalink, formatSignalShareBrief, and corpus memory cache behave deterministically", async () => {
  const permalink = buildSignalPermalink({
    siteUrl: "https://radar.aibuildon.com/",
    locale: "zh",
    dateKey: "2026-11-24",
    signalId: "sig-abc123def456",
  });
  assert.equal(
    permalink,
    "https://radar.aibuildon.com/zh/daily/2026-11-24#sig-abc123def456"
  );

  const zhDict = getDictionary("zh").card;
  const brief = formatSignalShareBrief({
    title: "单人 Chrome 插件月入 $18k",
    metricsBadge: "$18k MRR",
    whatItIsLabel: zhDict.whatItIs,
    whatItIs: "帮助独立站卖家一键批量去背景。",
    monetizationLabel: zhDict.monetization,
    businessSignal: "$15/月订阅，纯靠商店自然搜索获客。",
    playbookLabel: zhDict.playbook,
    indieTakeaway: "高频刚需微工具 + 应用商店 SEO 依然稳健。",
    shareLinkLabel: zhDict.shareLinkLabel,
    permalink,
  });

  const lines = brief.split("\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[0], "[$18k MRR] 单人 Chrome 插件月入 $18k");
  assert.ok(lines[1].startsWith("📌 是什么："));
  assert.ok(lines[2].startsWith("💵 怎么赚："));
  assert.ok(lines[3].startsWith("💡 抄作业："));
  assert.ok(lines[4].includes(permalink));

  // Verify corpus memory cache reuse & explicit invalidation
  clearSignalsRepoMemoryCache();
  const hubA = await getSeoHubIndex();
  const hubB = await getSeoHubIndex();
  assert.equal(hubA, hubB, "Repeated getSeoHubIndex calls should hit memory cache");

  clearSignalsRepoMemoryCache();
  const hubC = await getSeoHubIndex();
  assert.deepEqual(hubA, hubC);
  assert.notEqual(
    hubA,
    hubC,
    "After clearSignalsRepoMemoryCache, fresh HubDirectory object is computed"
  );

  // Verify globalThis shared cache & Next.js client router staleTimes config for fast date switching
  const globalCache = (
    globalThis as unknown as { __afrRepoMemoryCache?: Map<string, unknown> }
  ).__afrRepoMemoryCache;
  assert.ok(globalCache && globalCache.size > 0);
  assert.equal(nextConfig.experimental?.staleTimes?.dynamic, 60);
  assert.equal(nextConfig.experimental?.staleTimes?.static, 300);

  const dates = await getAllAvailableDates();
  const t0 = performance.now();
  const day0 = await getRadarPayload("zh", dates[0]);
  const day1 = await getRadarPayload("zh", dates[1]);
  const elapsedMs = performance.now() - t0;
  assert.notEqual(day0.activeDate, day1.activeDate);
  assert.ok(day0.items.every((i) => i.dateKey === dates[0]));
  assert.ok(day1.items.every((i) => i.dateKey === dates[1]));
  assert.ok(elapsedMs < 50, `Expected <50ms warm date switch, got ${elapsedMs}ms`);
});
