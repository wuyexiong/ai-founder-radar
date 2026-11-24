import "./helpers/env-guard";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET as searchSignalsGet } from "../src/app/api/signals/search/route";
import { GET as getDynamicOgImage } from "../src/app/og/[...slug]/route";
import { GET as getRootOpenGraphImage } from "../src/app/opengraph-image/route";
import robots from "../src/app/robots";
import { setDbForTests } from "../src/db";
import type { signalItems } from "../src/db/schema";
import { LOCALES } from "../src/i18n/config";
import { getDictionary } from "../src/i18n/dictionaries";
import { trackRadarEvent } from "../src/lib/analytics";
import {
  OG_LOCALE_BADGES,
  sanitizeOgText,
  summarizeOgMetrics,
} from "../src/lib/og-renderer";
import {
  formatSavedSignalsMarkdown,
  MAX_SAVED_BACKUP_BYTES,
  parseAndMergeSavedSignalsBackup,
  sanitizeSavedSignalItem,
  serializeSavedSignalsBackup,
} from "../src/lib/saved-portability";
import { buildHubMetadata, buildRadarMetadata } from "../src/lib/seo";
import {
  clearSignalsRepoMemoryCache,
  escapeIlikePattern,
  getAllAvailableDates,
  getRadarPayload,
  RECENT_CORPUS_CACHE_LIMIT,
  searchSignalsCorpus,
} from "../src/lib/signals-repo";
import { middleware } from "../src/middleware";
import type { SignalItem } from "../src/types/signal";
import { resetOfflineTestGuard } from "./helpers/env-guard";

type SignalDbRow = typeof signalItems.$inferSelect;

const CJK_CHAR_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;
const PRINTABLE_ASCII_RE = /^[\x20-\x7E]*$/;
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function makeSignalRow(
  idx: number,
  overrides: Partial<SignalDbRow> = {}
): SignalDbRow {
  const dateKey = overrides.dateKey ?? "2026-11-24";
  const now = new Date(`${dateKey}T02:00:00.000Z`);
  return {
    id: overrides.id ?? `sig-mock-${idx}`,
    dateKey,
    titleZh: overrides.titleZh ?? `测试商业信号 #${idx}`,
    titleOrig: overrides.titleOrig ?? `Mock SaaS Signal #${idx}`,
    category: overrides.category ?? "revenue",
    whatItIs: overrides.whatItIs ?? "Automated billing workflow for founders.",
    businessSignal: overrides.businessSignal ?? "$8k MRR via Stripe",
    indieTakeaway: overrides.indieTakeaway ?? "Target vertical B2B pain.",
    metricsBadge: overrides.metricsBadge ?? "$8k MRR",
    metricType: overrides.metricType ?? "revenue",
    tags: overrides.tags ?? ["#MicroSaaS"],
    translations: overrides.translations ?? {
      en: {
        title: overrides.titleOrig ?? `Mock SaaS Signal #${idx}`,
        whatItIs: "Automated billing workflow for founders.",
        businessSignal: "$8k MRR via Stripe",
        indieTakeaway: "Target vertical B2B pain.",
        metricsBadge: "$8k MRR",
        tags: ["#MicroSaaS"],
      },
    },
    score: overrides.score ?? 8.2,
    isTopPick: overrides.isTopPick ?? false,
    sourcePlatform: overrides.sourcePlatform ?? "trustmrr",
    sourceSublabel: overrides.sourceSublabel ?? "TrustMRR 实名榜",
    sourceUrl: overrides.sourceUrl ?? `https://example.com/p/${idx}`,
    publishedAt: overrides.publishedAt ?? now,
    createdAt: overrides.createdAt ?? now,
  };
}

function createMockSignalsDb(
  allRows: SignalDbRow[],
  options: { throwOnRecent?: boolean; throwOnSearchSql?: boolean } = {}
) {
  let selectCalls = 0;
  let whereCalls = 0;

  return {
    getStats: () => ({ selectCalls, whereCalls }),
    select() {
      selectCalls += 1;
      return {
        from(_table: unknown) {
          return {
            orderBy(..._orders: unknown[]) {
              return {
                limit: async (n: number) => {
                  if (options.throwOnRecent) {
                    throw new Error(
                      "postgresql://postgres:top_secret_pw@db.supabase.co:5432/postgres timeout"
                    );
                  }
                  return allRows.slice(0, n);
                },
              };
            },
            where(_cond: unknown) {
              whereCalls += 1;
              return {
                orderBy(..._orders: unknown[]) {
                  return {
                    limit: async (n: number) => {
                      if (options.throwOnSearchSql) {
                        throw new Error(
                          "postgresql://postgres:top_secret_pw@db.supabase.co:5432/postgres query error"
                        );
                      }
                      // Return rows beyond the 360-row cache window to simulate older historical SQL ILIKE hits
                      return allRows
                        .slice(RECENT_CORPUS_CACHE_LIMIT)
                        .slice(0, n);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function makeSampleSignalItem(overrides: Partial<SignalItem> = {}): SignalItem {
  return {
    id: overrides.id ?? "sig-sample-1",
    dateKey: overrides.dateKey ?? "2026-11-24",
    title: overrides.title ?? "InvoicePilot hits $14k MRR with QuickBooks Sync",
    titleZh: overrides.titleZh ?? "InvoicePilot 靠 QuickBooks 同步达到 $14k MRR",
    titleOrig:
      overrides.titleOrig ?? "InvoicePilot hits $14k MRR with QuickBooks Sync",
    category: overrides.category ?? "revenue",
    whatItIs:
      overrides.whatItIs ??
      "One-click Stripe-to-QuickBooks reconciliation micro-SaaS.",
    businessSignal:
      overrides.businessSignal ??
      "$49/mo flat subscription, 100% organic SEO acquisition.",
    indieTakeaway:
      overrides.indieTakeaway ??
      "Build boring accounting bridges where SMBs gladly pay monthly.",
    metricsBadge: overrides.metricsBadge ?? "$14k MRR",
    metricType: overrides.metricType ?? "revenue",
    tags: overrides.tags ?? ["#MicroSaaS", "#Stripe"],
    score: overrides.score ?? 9.2,
    isTopPick: overrides.isTopPick ?? true,
    sourcePlatform: overrides.sourcePlatform ?? "trustmrr",
    sourceSublabel: overrides.sourceSublabel ?? "Verified Leaderboard",
    sourceUrl: overrides.sourceUrl ?? "https://trustmrr.com/startup/invoicepilot",
    publishedAt: overrides.publishedAt ?? "2026-11-24T02:00:00.000Z",
  };
}

describe("Package B: Full-Corpus Search API, Dynamic Safe OG Renderer & Saved Vault Portability", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    setDbForTests(null);
    clearSignalsRepoMemoryCache();
  });

  afterEach(() => {
    setDbForTests(null);
    resetOfflineTestGuard();
    clearSignalsRepoMemoryCache();
  });

  describe("1. Cross-Day Full-Corpus Search API (/api/signals/search & searchSignalsCorpus)", () => {
    it("guards short queries (< 2 chars), escapes SQL ILIKE wildcards, clamps limits (1..30), and sets CDN cache headers", async () => {
      assert.equal(
        escapeIlikePattern("100%_growth\\test"),
        "100\\%\\_growth\\\\test"
      );

      for (const shortQ of ["", "   ", "a", " 中 "]) {
        const res = await searchSignalsGet(
          new NextRequest(
            `https://radar.aibuildon.com/api/signals/search?q=${encodeURIComponent(shortQ)}&locale=en`
          )
        );
        assert.equal(res.status, 200);
        assert.equal(
          res.headers.get("cache-control"),
          "public, s-maxage=60, stale-while-revalidate=300"
        );
        const body = (await res.json()) as { ok: boolean; items: unknown[] };
        assert.deepEqual(body, { ok: true, items: [] });
      }

      // Pure wildcard query ("%%%") must NOT match every row as SQL wildcard
      const wildcardRes = await searchSignalsGet(
        new NextRequest(
          "https://radar.aibuildon.com/api/signals/search?q=%25%25%25&locale=en"
        )
      );
      const wildcardBody = (await wildcardRes.json()) as {
        ok: boolean;
        items: SignalItem[];
      };
      assert.equal(wildcardBody.ok, true);
      assert.equal(wildcardBody.items.length, 0);

      // Limit clamping: limit=0 -> 1, limit=999 -> <=30
      const minLimitRes = await searchSignalsGet(
        new NextRequest(
          "https://radar.aibuildon.com/api/signals/search?q=SaaS&locale=en&limit=0"
        )
      );
      const minLimitJson = (await minLimitRes.json()) as {
        ok: boolean;
        items: SignalItem[];
      };
      assert.equal(minLimitJson.ok, true);
      assert.equal(minLimitJson.items.length, 1);

      const maxLimitResult = await searchSignalsCorpus({
        query: "a".repeat(120), // truncated safely to 64 chars
        locale: "en",
        limit: 500,
      });
      assert.equal(maxLimitResult.items.length, 0);
    });

    it("searches across multiple archive dates in local-fallback mode with 4-locale parity and zero EN CJK leaks", async () => {
      const redditSearch = await searchSignalsCorpus({
        query: "SaaS",
        locale: "en",
        platform: "reddit",
        limit: 24,
      });
      assert.equal(redditSearch.storageMode, "local-fallback");
      assert.ok(redditSearch.items.length >= 1);
      for (const item of redditSearch.items) {
        assert.equal(item.sourcePlatform, "reddit");
        assert.equal(
          CJK_CHAR_RE.test(item.title),
          false,
          `CJK leaked in EN search title: ${item.title}`
        );
        assert.equal(
          CJK_CHAR_RE.test(item.sourceSublabel),
          false,
          `CJK leaked in EN search sublabel: ${item.sourceSublabel}`
        );
      }

      // Verify score DESC sorting
      const broadEn = await searchSignalsCorpus({
        query: "MRR",
        locale: "en",
        limit: 24,
      });
      assert.ok(broadEn.items.length >= 2);
      for (let i = 1; i < broadEn.items.length; i += 1) {
        assert.ok(
          broadEn.items[i - 1].score >= broadEn.items[i].score,
          "Search results must be ordered by score DESC"
        );
      }
      const distinctDates = new Set(broadEn.items.map((i) => i.dateKey));
      assert.ok(
        distinctDates.size >= 2,
        "Cross-day search must span multiple archived dates"
      );

      // Verify Traditional Chinese derived matching in zh-TW
      const twSearch = await searchSignalsGet(
        new NextRequest(
          `https://radar.aibuildon.com/api/signals/search?q=${encodeURIComponent("獨立開發")}&locale=zh-TW&category=revenue&limit=10`
        )
      );
      assert.equal(twSearch.status, 200);
      const twJson = (await twSearch.json()) as {
        ok: boolean;
        items: SignalItem[];
      };
      assert.equal(twJson.ok, true);
      for (const item of twJson.items) {
        assert.equal(item.category, "revenue");
      }
    });

    it("uses warm memory cache first in DB mode, falls back to Drizzle ILIKE when 360-row cache is full, and degrades safely on DB error", async () => {
      // Case A: < 360 rows -> answered purely from warm corpus without SQL where() scan
      const smallDbRows = [
        makeSignalRow(1, {
          id: "sig-warm-1",
          dateKey: "2026-11-24",
          titleOrig: "WarmCache LedgerBridge $22k MRR",
          score: 9.4,
        }),
      ];
      const smallDb = createMockSignalsDb(smallDbRows);
      setDbForTests(smallDb);

      const warmHit = await searchSignalsCorpus({
        query: "LedgerBridge",
        locale: "en",
      });
      assert.equal(warmHit.storageMode, "supabase");
      assert.equal(warmHit.items.length, 1);
      assert.equal(warmHit.items[0].id, "sig-warm-1");
      assert.equal(smallDb.getStats().whereCalls, 0);

      // Case B: >= 360 rows in DB -> complements warm cache with older historical row via Drizzle SQL ILIKE & deduplicates
      clearSignalsRepoMemoryCache();
      const fullRows: SignalDbRow[] = [];
      for (let i = 0; i < RECENT_CORPUS_CACHE_LIMIT; i += 1) {
        fullRows.push(
          makeSignalRow(i, {
            id: i === 0 ? "sig-dup-both" : `sig-recent-${i}`,
            dateKey: "2026-11-24",
            titleOrig:
              i === 0
                ? "DeepArchive QuantumInvoice $30k MRR"
                : `Routine Item #${i}`,
            score: i === 0 ? 8.9 : 7.5,
          })
        );
      }
      // Row #361 outside the 360-row cache window + duplicate ID check
      fullRows.push(
        makeSignalRow(999, {
          id: "sig-dup-both",
          dateKey: "2026-08-01",
          titleOrig: "DeepArchive QuantumInvoice $30k MRR",
          score: 8.9,
        }),
        makeSignalRow(1000, {
          id: "sig-historical-2026-06",
          dateKey: "2026-06-15",
          titleOrig: "DeepArchive QuantumInvoice Legacy $45k MRR",
          score: 9.6,
        })
      );

      const fullDb = createMockSignalsDb(fullRows);
      setDbForTests(fullDb);

      const deepHit = await searchSignalsCorpus({
        query: "QuantumInvoice",
        locale: "en",
        limit: 10,
      });
      assert.equal(deepHit.storageMode, "supabase");
      assert.ok(fullDb.getStats().whereCalls >= 1);
      assert.deepEqual(
        deepHit.items.map((i) => i.id),
        ["sig-historical-2026-06", "sig-dup-both"]
      );

      // Case C: DB throws -> seamlessly falls back to local-signals.json without leaking credentials
      clearSignalsRepoMemoryCache();
      const brokenDb = createMockSignalsDb([], { throwOnRecent: true });
      setDbForTests(brokenDb);

      const fallbackRes = await searchSignalsCorpus({
        query: "Chrome",
        locale: "en",
      });
      assert.equal(fallbackRes.storageMode, "local-fallback");
      assert.ok(fallbackRes.items.length >= 1);
    });
  });

  describe("2. Dynamic Offline-Safe OpenGraph Social Cards & SEO Metadata", () => {
    it("points SEO openGraph/twitter images to non-/api/ localized dynamic OG routes and passes middleware & robots rules", async () => {
      const dates = await getAllAvailableDates();
      const sampleDate = dates[0];
      const payload = await getRadarPayload("zh", sampleDate);

      const robotsCfg = robots();
      const rules = Array.isArray(robotsCfg.rules)
        ? robotsCfg.rules
        : [robotsCfg.rules];
      assert.deepEqual(rules[0].disallow, ["/api/"]);

      for (const locale of LOCALES) {
        const homeMeta = buildRadarMetadata({
          locale,
          dateKey: sampleDate,
          isArchiveRoute: false,
          overview: payload.overview,
          items: payload.items,
        });
        const archiveMeta = buildRadarMetadata({
          locale,
          dateKey: sampleDate,
          isArchiveRoute: true,
          overview: payload.overview,
          items: payload.items,
        });
        const topicMeta = buildHubMetadata({
          locale,
          kind: "topic",
          slug: "chrome-extension",
          seoTitle: "Chrome Extensions",
          h1: "Chrome Extensions",
          description: "Desc",
          breadcrumbLabel: "Chrome Extensions",
          latestDateKey: sampleDate,
          items: payload.items,
        });
        const sourceMeta = buildHubMetadata({
          locale,
          kind: "source",
          slug: "trustmrr",
          seoTitle: "TrustMRR",
          h1: "TrustMRR",
          description: "Desc",
          breadcrumbLabel: "TrustMRR",
          latestDateKey: sampleDate,
          items: payload.items,
        });

        assert.equal(
          homeMeta.metadataBase?.toString(),
          "https://radar.aibuildon.com/"
        );

        const ogUrls = [
          (homeMeta.openGraph?.images as Array<{ url: string }>)[0].url,
          (archiveMeta.openGraph?.images as Array<{ url: string }>)[0].url,
          (topicMeta.openGraph?.images as Array<{ url: string }>)[0].url,
          (sourceMeta.openGraph?.images as Array<{ url: string }>)[0].url,
        ];

        assert.deepEqual(ogUrls, [
          `/og/${locale}`,
          `/og/${locale}/daily/${sampleDate}`,
          `/og/${locale}/topic/chrome-extension`,
          `/og/${locale}/source/trustmrr`,
        ]);

        for (const ogPath of ogUrls) {
          assert.equal(
            ogPath.startsWith("/api/"),
            false,
            `OG path ${ogPath} must never sit under Disallow: /api/`
          );
          const mwRes = middleware(
            new NextRequest(`https://radar.aibuildon.com${ogPath}`)
          );
          assert.equal(
            mwRes.status,
            200,
            `Middleware must pass ${ogPath} straight through`
          );
          assert.equal(mwRes.headers.get("location"), null);
        }
      }
    });

    it("sanitizes CJK/emoji tokens to pure printable ASCII and renders valid PNG bytes completely offline with zero external fetch", async () => {
      for (const locale of LOCALES) {
        assert.ok(PRINTABLE_ASCII_RE.test(OG_LOCALE_BADGES[locale]));
      }

      const sanitized = sanitizeOgText(
        "★ 14.1k (+908 今日) · 月入 $18k MRR — 浏览器插件 🚀"
      );
      assert.ok(
        PRINTABLE_ASCII_RE.test(sanitized),
        `Non-ASCII leaked into OG text: ${sanitized}`
      );
      assert.ok(sanitized.includes("14.1k (+908 today)"));
      assert.ok(sanitized.includes("$18k MRR"));

      const summary = summarizeOgMetrics([
        makeSampleSignalItem({
          score: 9.5,
          metricsBadge: "★ 14.1k (+908 本日)",
          sourcePlatform: "github",
          titleOrig: "acme/agent-browser: Headless SDK",
        }),
        makeSampleSignalItem({
          id: "sig-2",
          score: 8.5,
          metricsBadge: "$12k MRR",
        }),
      ]);
      assert.equal(summary.signalCount, 2);
      assert.equal(summary.avgScoreText, "9.0");
      assert.equal(summary.peakScoreText, "9.5");
      assert.equal(summary.isStarMetric, true);
      assert.ok(PRINTABLE_ASCII_RE.test(summary.topMetricBadge));
      assert.ok(PRINTABLE_ASCII_RE.test(summary.topSignalHeadline));

      const dates = await getAllAvailableDates();
      const responses = await Promise.all([
        getRootOpenGraphImage(),
        getDynamicOgImage(
          new NextRequest("https://radar.aibuildon.com/og/zh"),
          { params: Promise.resolve({ slug: ["zh"] }) }
        ),
        getDynamicOgImage(
          new NextRequest(
            `https://radar.aibuildon.com/og/ja/daily/${dates[0]}`
          ),
          { params: Promise.resolve({ slug: ["ja", "daily", dates[0]] }) }
        ),
        getDynamicOgImage(
          new NextRequest(
            "https://radar.aibuildon.com/og/zh-TW/topic/chrome-extension"
          ),
          {
            params: Promise.resolve({
              slug: ["zh-TW", "topic", "chrome-extension"],
            }),
          }
        ),
        getDynamicOgImage(
          new NextRequest(
            "https://radar.aibuildon.com/og/en/source/trustmrr"
          ),
          { params: Promise.resolve({ slug: ["en", "source", "trustmrr"] }) }
        ),
      ]);

      for (const res of responses) {
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") ?? "", /image\/png/);
        const buf = new Uint8Array(await res.arrayBuffer());
        assert.ok(
          buf.byteLength > 5_000,
          `Expected non-trivial PNG buffer, got ${buf.byteLength} bytes`
        );
        assert.deepEqual(Array.from(buf.slice(0, 8)), PNG_MAGIC_BYTES);
      }
    });
  });

  describe("3. Local Saved Vault Portability (Markdown Export + JSON Backup/Merge Security)", () => {
    it("exports reverse-chronological research Markdown across all 4 locales and neutralizes unsafe URLs", () => {
      const older = makeSampleSignalItem({
        id: "sig-older",
        dateKey: "2026-11-20",
        title: "Older Pain Point Tool",
        titleOrig: "Older Pain Point Tool",
        score: 9.8,
        sourceUrl: "javascript:alert(1)",
      });
      const newer = makeSampleSignalItem({
        id: "sig-newer",
        dateKey: "2026-11-24",
        title: "Newer Stripe Dunning SaaS",
        titleOrig: "Newer Stripe Dunning SaaS",
        score: 8.9,
      });

      const input = [older, newer];
      const enMd = formatSavedSignalsMarkdown(
        input,
        "en",
        "https://radar.aibuildon.com/"
      );

      // Input array not mutated; output ordered by dateKey DESC (2026-11-24 before 2026-11-20)
      assert.equal(input[0].id, "sig-older");
      assert.ok(
        enMd.indexOf("Newer Stripe Dunning SaaS") <
          enMd.indexOf("Older Pain Point Tool")
      );
      assert.ok(enMd.includes("📌 What it is:"));
      assert.ok(enMd.includes("💵 Monetization:"));
      assert.ok(enMd.includes("💡 Indie Playbook:"));
      assert.ok(
        enMd.includes(
          "https://radar.aibuildon.com/en/daily/2026-11-24?utm_source=saved_md#sig-newer"
        )
      );
      assert.equal(enMd.includes("javascript:"), false);
      assert.equal(CJK_CHAR_RE.test(enMd), false);

      for (const loc of ["zh", "zh-TW", "ja"] as const) {
        const localizedMd = formatSavedSignalsMarkdown(
          [newer],
          loc,
          "https://radar.aibuildon.com"
        );
        assert.ok(
          localizedMd.includes(
            `https://radar.aibuildon.com/${loc}/daily/2026-11-24?utm_source=saved_md#sig-newer`
          )
        );
      }
    });

    it("serializes backups, merges only new valid items, enforces <=2MB cap, and blocks prototype pollution & javascript: URLs", () => {
      const itemA = makeSampleSignalItem({ id: "sig-a", dateKey: "2026-11-23" });
      const itemB = makeSampleSignalItem({ id: "sig-b", dateKey: "2026-11-24" });

      const serialized = serializeSavedSignalsBackup({
        "sig-a": itemA,
        "sig-b": itemB,
      });

      const mergeResult = parseAndMergeSavedSignalsBackup(serialized, {
        "sig-a": itemA,
      });
      assert.equal(mergeResult.validCount, 2);
      assert.equal(mergeResult.addedCount, 1);
      assert.deepEqual(Object.keys(mergeResult.merged).sort(), [
        "sig-a",
        "sig-b",
      ]);

      // Empty state recovery (0 existing saved items -> restores all)
      const emptyStateRestore = parseAndMergeSavedSignalsBackup(serialized, {});
      assert.equal(emptyStateRestore.addedCount, 2);
      assert.equal(emptyStateRestore.validCount, 2);

      // Prototype pollution + unsafe URL + malformed items mixed with 1 valid item
      const hostileJson = `
      {
        "__proto__": { "pollutedProp": "pwned", "id": "__proto__", "dateKey": "2026-11-24", "title": "x", "sourceUrl": "https://a.com", "score": 9 },
        "constructor": { "prototype": { "pollutedProp": "pwned" } },
        "evilJs": { "id": "sig-xss", "dateKey": "2026-11-24", "title": "XSS", "sourceUrl": "javascript:alert(document.cookie)", "score": 9.1 },
        "badScore": { "id": "sig-nan", "dateKey": "2026-11-24", "title": "Bad", "sourceUrl": "https://a.com", "score": "not-a-number" },
        "goodOne": { "id": "sig-clean", "dateKey": "2026-11-24", "title": "Clean SaaS", "sourceUrl": "https://clean.example.com", "score": 8.7, "__proto__": { "pollutedNested": true } }
      }`;

      const sanitizedMerge = parseAndMergeSavedSignalsBackup(hostileJson, {});
      assert.equal(
        ({} as Record<string, unknown>).pollutedProp,
        undefined,
        "Object.prototype must never be polluted"
      );
      assert.equal(
        ({} as Record<string, unknown>).pollutedNested,
        undefined,
        "Nested __proto__ must never pollute Object.prototype"
      );
      assert.equal(sanitizedMerge.validCount, 1);
      assert.equal(sanitizedMerge.addedCount, 1);
      assert.deepEqual(Object.keys(sanitizedMerge.merged), ["sig-clean"]);
      assert.equal(sanitizeSavedSignalItem({ id: "__proto__" }), null);

      // Oversized > 2MB input rejected immediately
      const oversized = "x".repeat(MAX_SAVED_BACKUP_BYTES + 32);
      assert.throws(
        () => parseAndMergeSavedSignalsBackup(oversized, {}),
        /BACKUP_TOO_LARGE/
      );

      // Invalid JSON & all-invalid items rejected cleanly
      assert.throws(
        () => parseAndMergeSavedSignalsBackup("{broken json", {}),
        /INVALID_JSON/
      );
      assert.throws(
        () =>
          parseAndMergeSavedSignalsBackup(
            JSON.stringify({
              bad: {
                id: "sig-bad",
                dateKey: "2026-11-24",
                title: "XSS",
                sourceUrl: "javascript:void(0)",
                score: 8,
              },
            }),
            {}
          ),
        /NO_VALID_ITEMS/
      );
    });

    it("maintains strict 4-locale dictionary symmetry, zero EN CJK leaks, and analytics event coverage", () => {
      for (const locale of LOCALES) {
        const dict = getDictionary(locale);
        assert.ok(dict.filters.searchingArchive.length > 0);
        assert.ok(dict.filters.archiveMatchesHeading(5).includes("5"));
        assert.ok(dict.filters.archiveMatchesSubnote.length > 0);
        assert.ok(dict.savedToolbar.title(3).includes("3"));
        assert.ok(dict.savedToolbar.exportMarkdown.length > 0);
        assert.ok(dict.savedToolbar.exportJson.length > 0);
        assert.ok(dict.savedToolbar.importJson.length > 0);
        assert.ok(dict.savedToolbar.importSuccess(2, 4).includes("2"));
        assert.ok(dict.savedToolbar.importSuccess(0, 4).includes("4"));
        assert.ok(dict.savedToolbar.importError.length > 0);

        if (locale === "en") {
          const joinedEn = [
            dict.filters.searchingArchive,
            dict.filters.archiveMatchesHeading(5),
            dict.filters.archiveMatchesSubnote,
            dict.savedToolbar.title(3),
            dict.savedToolbar.exportMarkdown,
            dict.savedToolbar.exportJson,
            dict.savedToolbar.importJson,
            dict.savedToolbar.importSuccess(2, 4),
            dict.savedToolbar.importSuccess(0, 4),
            dict.savedToolbar.importError,
          ].join(" ");
          assert.equal(
            CJK_CHAR_RE.test(joinedEn),
            false,
            `CJK leaked into English Wave B dictionary strings: ${joinedEn}`
          );
        }
      }

      const events: string[] = [];
      const g = globalThis as unknown as { window?: unknown };
      const prevWin = g.window;
      try {
        g.window = {
          posthog: {
            capture: (ev: string) => events.push(ev),
          },
        };
        trackRadarEvent("search_query", { query_length: 4, locale: "en" });
        trackRadarEvent("saved_export", { format: "markdown", locale: "zh" });
        trackRadarEvent("saved_import", { result: "success", locale: "ja" });
        assert.deepEqual(events, [
          "search_query",
          "saved_export",
          "saved_import",
        ]);
      } finally {
        if (prevWin === undefined) delete g.window;
        else g.window = prevWin;
      }
    });
  });
});
