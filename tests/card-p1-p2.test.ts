import "./helpers/env-guard";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SignalDetailPage, {
  generateMetadata as generateSignalMetadata,
  generateStaticParams as generateSignalStaticParams,
} from "../src/app/(localized)/[locale]/signal/[id]/page";
import { GET as getDynamicOgImage } from "../src/app/og/[...slug]/route";
import { SignalDetailView } from "../src/components/signal-detail-view";
import { setDbForTests } from "../src/db";
import type { signalItems } from "../src/db/schema";
import { HREFLANG_MAP, LOCALES } from "../src/i18n/config";
import { getDictionary } from "../src/i18n/dictionaries";
import {
  distillRawItem,
  setDistillerTimingScaleForTests,
} from "../src/lib/ai-distiller";
import { buildIndexNowUrlList } from "../src/lib/revalidate";
import {
  buildSignalDetailJsonLd,
  buildSignalDetailMetadata,
} from "../src/lib/seo";
import {
  enforceStrictMetricType,
  formatSignalAgeBadge,
  resolveSignalLinks,
} from "../src/lib/signal-meta";
import {
  clearSignalsRepoMemoryCache,
  getSignalDetailPayload,
  isValidSignalId,
  RECENT_CORPUS_CACHE_LIMIT,
} from "../src/lib/signals-repo";
import { buildSignalDetailUrl } from "../src/lib/utils";
import {
  installFetchMock,
  jsonResponse,
  resetOfflineTestGuard,
  withEnv,
} from "./helpers/env-guard";

type SignalDbRow = typeof signalItems.$inferSelect;

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("Card P1/P2 Evolution: Strict Green Badge, Lifecycle Age, Dual Links & Standalone Signal Detail Page", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    setDbForTests(null);
    clearSignalsRepoMemoryCache();
    setDistillerTimingScaleForTests(0);
  });

  afterEach(() => {
    setDistillerTimingScaleForTests(1);
    setDbForTests(null);
    clearSignalsRepoMemoryCache();
    resetOfflineTestGuard();
  });

  describe("1. Strict Emerald Revenue Badge Guardrail (enforceStrictMetricType & distillRawItem)", () => {
    it("downgrades unit pricing ($9/mo, $79 LTD), upvote badges, pain complaints, and GitHub stars from revenue to heat/pain", async () => {
      // Mere $9/mo or $79 LTD pricing on a launch MUST NOT get green revenue badge
      assert.equal(
        enforceStrictMetricType({
          category: "launch",
          proposedMetricType: "revenue",
          sourcePlatform: "producthunt",
          metricsBadge: "$9/mo",
          rawMetric: "PH Top #1",
          businessSignal: "Priced at $9/mo or $79 LTD.",
          title: "SnapInvoice — Receipt OCR tool",
        }),
        "heat"
      );

      assert.equal(
        enforceStrictMetricType({
          category: "launch",
          proposedMetricType: "revenue",
          sourcePlatform: "hackernews",
          metricsBadge: "▲ 318 HN",
          rawMetric: "▲ 318 HN",
          businessSignal: "$12/mo pro export tier.",
          title: "Show HN: Zero-server WebGPU background remover",
        }),
        "heat"
      );

      // Pain-point thread mentioning willingness to pay $49-$99 MUST stay "pain"
      assert.equal(
        enforceStrictMetricType({
          category: "pain_point",
          proposedMetricType: "revenue",
          sourcePlatform: "reddit",
          metricsBadge: "💬 186 Pain",
          rawMetric: "💬 186 · ▲ 95",
          businessSignal: "30+ owners willing to pay $49-$99 one-off.",
          title: "Looking for flat-rate Calendly alternative",
        }),
        "pain"
      );

      // GitHub stars MUST stay "heat"
      assert.equal(
        enforceStrictMetricType({
          category: "ai_trend",
          proposedMetricType: "revenue",
          sourcePlatform: "github",
          metricsBadge: "★ 14.1k (+908 today)",
          rawMetric: "★ 14.1k (+908 今日)",
        }),
        "heat"
      );

      // Verified MRR / ARR / Acquire / App Store Top Grossing keep "revenue"
      assert.equal(
        enforceStrictMetricType({
          category: "revenue",
          proposedMetricType: "revenue",
          sourcePlatform: "trustmrr",
          metricsBadge: "$14.5k MRR",
          rawMetric: "MRR $14.5k",
        }),
        "revenue"
      );
      assert.equal(
        enforceStrictMetricType({
          category: "revenue",
          proposedMetricType: "heat",
          sourcePlatform: "acquire",
          metricsBadge: "ARR $120k",
          rawMetric: "ARR $120k",
        }),
        "revenue"
      );

      // End-to-end distillRawItem: LLM mistakenly proposes metricType="revenue" for a $9/mo Product Hunt launch
      await withEnv({ GEMINI_API_KEY: "fake_strict_badge_key" }, async () => {
        const mock = installFetchMock(() =>
          jsonResponse({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        category: "launch",
                        metricType: "revenue",
                        score: 8.4,
                        metricsBadge: "$9/mo",
                        zh: {
                          title: "截图转报销单工具上线",
                          whatItIs: "自动识别电子收据。",
                          businessSignal: "定价 $9/月 或 $79 买断。",
                          indieTakeaway: "切财务软件导入桥接。",
                          metricsBadge: "$9/mo",
                          tags: ["#SaaS"],
                        },
                        en: {
                          title: "Screenshot to QuickBooks Tool Launches",
                          whatItIs: "Extracts receipt fields.",
                          businessSignal: "$9/mo or $79 LTD.",
                          indieTakeaway: "Build accounting bridges.",
                          metricsBadge: "$9/mo",
                          tags: ["#SaaS"],
                        },
                        ja: {
                          title: "領収書OCRツールが公開",
                          whatItIs: "レシート自動認識。",
                          businessSignal: "月額$9または買切$79。",
                          indieTakeaway: "会計連携を狙う。",
                          metricsBadge: "$9/mo",
                          tags: ["#SaaS"],
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
          const distilled = await distillRawItem(
            {
              title: "SnapInvoice — Receipt OCR",
              summary: "Turn screenshots into QuickBooks CSV. Pricing starts at $9/mo.",
              url: "https://www.producthunt.com/products/snapinvoice",
              sourcePlatform: "producthunt",
              sourceSublabel: "PH Top #1",
              rawMetric: "PH 今日推荐 #1",
              publishedAt: "2026-11-24T01:00:00.000Z",
              launchMeta: {
                productUrl: "https://snapinvoice.app",
                discussionUrl: "https://www.producthunt.com/products/snapinvoice",
              },
            },
            "2026-11-24",
            0
          );

          assert.equal(distilled.item.metricType, "heat");
          assert.equal(distilled.item.productUrl, "https://snapinvoice.app/");
          assert.equal(
            distilled.item.discussionUrl,
            "https://www.producthunt.com/products/snapinvoice"
          );
          assert.deepEqual(distilled.item.translations?._meta, {
            productUrl: "https://snapinvoice.app",
            discussionUrl: "https://www.producthunt.com/products/snapinvoice",
          });
        } finally {
          mock.restore();
        }
      });
    });
  });

  describe("2. Lifecycle Age Badge & Dual Outbound Link Resolution (signal-meta.ts)", () => {
    it("formats App Store & GitHub lifecycle age badges deterministically across all 4 locales with zero EN CJK leaks", () => {
      for (const locale of LOCALES) {
        const appNew = formatSignalAgeBadge({
          locale,
          sourcePlatform: "appstore",
          dateKey: "2026-11-24",
          publishedAt: "2026-11-10T00:00:00Z",
          meta: { ageMonths: 0, releaseYear: 2026, ageKind: "appstore_release" },
        });
        const appMonths = formatSignalAgeBadge({
          locale,
          sourcePlatform: "appstore",
          dateKey: "2026-11-24",
          publishedAt: "2026-07-24T00:00:00Z",
          meta: { ageMonths: 4, releaseYear: 2026, ageKind: "appstore_release" },
        });
        const appYears = formatSignalAgeBadge({
          locale,
          sourcePlatform: "appstore",
          dateKey: "2026-11-24",
          publishedAt: "2023-05-01T00:00:00Z",
          meta: { ageMonths: 42, releaseYear: 2023, ageKind: "appstore_release" },
        });
        const repoBreakout = formatSignalAgeBadge({
          locale,
          sourcePlatform: "github",
          dateKey: "2026-11-24",
          publishedAt: "2026-11-21T10:00:00Z",
          rawSublabel: "GitHub 7日新锐",
        });

        assert.ok(appNew && appNew.length > 0);
        assert.ok(appMonths && appMonths.includes("4"));
        assert.ok(appYears && appYears.includes("2023"));
        assert.ok(repoBreakout && repoBreakout.length > 0);

        if (locale === "en") {
          const allEn = `${appNew} ${appMonths} ${appYears} ${repoBreakout}`;
          assert.equal(CJK_RE.test(allEn), false, `CJK leaked in EN ageBadge: ${allEn}`);
        }
      }
    });

    it("resolves productUrl vs discussionUrl cleanly, deduplicates identical URLs, and blocks javascript: schemes", () => {
      // Show HN with external custom domain + HN item thread
      const hnBoth = resolveSignalLinks({
        sourcePlatform: "hackernews",
        sourceUrl: "https://bgstudio.dev",
        meta: {
          productUrl: "https://bgstudio.dev",
          discussionUrl: "https://news.ycombinator.com/item?id=42000001",
        },
      });
      assert.equal(hnBoth.productUrl, "https://bgstudio.dev/");
      assert.equal(
        hnBoth.discussionUrl,
        "https://news.ycombinator.com/item?id=42000001"
      );

      // Legacy Show HN row with only external domain in sourceUrl -> treated as productUrl (not mislabeled as thread)
      const hnLegacyExternal = resolveSignalLinks({
        sourcePlatform: "hackernews",
        sourceUrl: "https://legacy-saas.io",
      });
      assert.equal(hnLegacyExternal.productUrl, "https://legacy-saas.io/");
      assert.equal(hnLegacyExternal.discussionUrl, null);

      // Identical URLs differing only by utm_source are deduplicated to a single button
      const deduped = resolveSignalLinks({
        sourcePlatform: "trustmrr",
        sourceUrl: "https://trustmrr.com/startup/acme",
        meta: {
          productUrl: "https://trustmrr.com/startup/acme?utm_source=test",
          discussionUrl: "https://trustmrr.com/startup/acme/",
        },
      });
      assert.equal(deduped.productUrl, null);
      assert.equal(deduped.discussionUrl, "https://trustmrr.com/startup/acme/");

      // Malicious javascript: URLs stripped safely
      const hostile = resolveSignalLinks({
        sourcePlatform: "reddit",
        sourceUrl: "https://www.reddit.com/r/SaaS/comments/123",
        meta: {
          productUrl: "javascript:alert(1)",
          discussionUrl: "data:text/html,<script>alert(1)</script>",
        },
      });
      assert.equal(hostile.productUrl, null);
      assert.equal(
        hostile.discussionUrl,
        "https://www.reddit.com/r/SaaS/comments/123"
      );
    });
  });

  describe("3. Standalone Signal SEO Detail Page (/[locale]/signal/[id]), JSON-LD & Dynamic OG Image", () => {
    it("resolves 4-locale signal detail payloads, related cases, metadata, Article JSON-LD, and offline PNG OG cards", async () => {
      assert.equal(isValidSignalId("sig-20261123-02"), true);
      assert.equal(isValidSignalId("../etc/passwd"), false);
      assert.equal(isValidSignalId(""), false);

      assert.equal(
        buildSignalDetailUrl({
          siteUrl: "https://radar.aibuildon.com/",
          locale: "zh",
          signalId: "sig-20261123-02",
          utmSource: "share_brief",
        }),
        "https://radar.aibuildon.com/zh/signal/sig-20261123-02?utm_source=share_brief"
      );

      const staticParams = await generateSignalStaticParams();
      assert.ok(staticParams.length >= LOCALES.length * 5);

      for (const locale of LOCALES) {
        const payload = await getSignalDetailPayload(locale, "sig-20261123-02");
        assert.ok(payload, `Expected detail payload for ${locale}`);
        assert.equal(payload.item.id, "sig-20261123-02");
        assert.equal(payload.item.productUrl, "https://snapinvoice.app/");
        assert.equal(payload.item.discussionUrl, "https://www.producthunt.com/");
        assert.ok(payload.relatedItems.length >= 3);
        assert.equal(
          payload.relatedItems.some((r) => r.id === "sig-20261123-02"),
          false,
          "relatedItems must exclude current signal itself"
        );

        const meta = await generateSignalMetadata({
          params: Promise.resolve({ locale, id: "sig-20261123-02" }),
        });
        assert.equal(
          meta.alternates?.canonical,
          `https://radar.aibuildon.com/${locale}/signal/sig-20261123-02`
        );
        const langs = meta.alternates?.languages as Record<string, string>;
        assert.equal(
          langs[HREFLANG_MAP[locale]],
          `https://radar.aibuildon.com/${locale}/signal/sig-20261123-02`
        );
        assert.equal(
          langs["x-default"],
          "https://radar.aibuildon.com/en/signal/sig-20261123-02"
        );
        const ogImages = meta.openGraph?.images as Array<{ url: string }>;
        assert.equal(ogImages[0].url, `/og/${locale}/signal/sig-20261123-02`);

        const html = renderToStaticMarkup(
          React.createElement(SignalDetailView, { payload })
        );
        const dict = getDictionary(locale);
        assert.ok(html.includes(payload.item.title));
        assert.ok(html.includes('href="https://snapinvoice.app/"'));
        assert.ok(html.includes(dict.signalDetail.relatedHeading));
        // Bottom newsletter subscribe card & GitHub footer link on /signal/[id]
        assert.ok(html.includes(dict.sidebar.newsletterTitle));
        assert.ok(html.includes(dict.sidebar.newsletterCta));
        assert.ok(html.includes(dict.footer.githubLabel));
        assert.equal(html.includes("sponsored"), false);
        if (locale !== "en") {
          // Detail page preserves original English product/post subtitle (SnapInvoice) for SEO & brand lookup
          assert.ok(html.includes("SnapInvoice"));
        }
        if (locale === "en") {
          assert.equal(
            CJK_RE.test(html),
            false,
            "English SignalDetailView must contain zero CJK characters"
          );
        }
      }

      // JSON-LD sanitizes javascript: URLs and includes BreadcrumbList + Article
      const enPayload = (await getSignalDetailPayload("en", "sig-20261123-06"))!;
      assert.equal(enPayload.item.ageBadge, "Launched 4mo ago");
      const jsonLd = buildSignalDetailJsonLd({
        locale: "en",
        item: {
          ...enPayload.item,
          sourceUrl: "javascript:alert(1)",
          productUrl: "javascript:void(0)",
        },
      });
      assert.equal(jsonLd["@graph"].length, 3);
      assert.equal(jsonLd["@graph"][1]["@type"], "BreadcrumbList");
      assert.equal(jsonLd["@graph"][2]["@type"], "Article");
      assert.equal(JSON.stringify(jsonLd).includes("javascript:"), false);

      const directMeta = buildSignalDetailMetadata({
        locale: "en",
        item: enPayload.item,
      });
      assert.ok(String(directMeta.title).includes("[$22k/mo IAP]"));

      // Dynamic OG image for /og/[locale]/signal/[id] renders valid offline PNG
      const ogRes = await getDynamicOgImage(
        new NextRequest(
          "https://radar.aibuildon.com/og/zh/signal/sig-20261123-02"
        ),
        { params: Promise.resolve({ slug: ["zh", "signal", "sig-20261123-02"] }) }
      );
      assert.equal(ogRes.status, 200);
      assert.match(ogRes.headers.get("content-type") ?? "", /image\/png/);
      const ogBytes = new Uint8Array(await ogRes.arrayBuffer());
      assert.ok(ogBytes.byteLength > 5_000);
      assert.deepEqual(Array.from(ogBytes.slice(0, 8)), PNG_MAGIC_BYTES);

      // IndexNow includes high-score /signal/[id] URLs across all 4 locales
      const indexNowUrls = buildIndexNowUrlList({
        siteUrl: "https://radar.aibuildon.com",
        dateKey: "2026-11-24",
        items: [
          {
            id: "sig-new-alpha1",
            score: 9.1,
            titleZh: "Stripe 催款插件",
            titleOrig: "Stripe Dunning SaaS",
            whatItIs: "自动挽回失败订单",
            businessSignal: "$12k MRR",
            indieTakeaway: "ROI 清晰",
            tags: ["#Stripe"],
            sourcePlatform: "trustmrr",
            sourceSublabel: "TrustMRR 实名榜",
          },
        ],
      });
      assert.ok(
        indexNowUrls.includes(
          "https://radar.aibuildon.com/en/signal/sig-new-alpha1"
        )
      );
      assert.ok(
        indexNowUrls.includes(
          "https://radar.aibuildon.com/ja/signal/sig-new-alpha1"
        )
      );
    });

    it("queries DB single-row fallback when 360-row cache is full and triggers 404 notFound() on missing/invalid IDs", async () => {
      await assert.rejects(
        () =>
          SignalDetailPage({
            params: Promise.resolve({ locale: "en", id: "sig-does-not-exist-999" }),
          }),
        /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/
      );

      await assert.rejects(
        () =>
          SignalDetailPage({
            params: Promise.resolve({ locale: "fr", id: "sig-20261123-01" }),
          }),
        /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/
      );

      // Simulate >= 360 rows in warm cache + older historical signal fetched via single-row DB fallback
      const now = new Date("2026-11-24T02:00:00Z");
      const mockRows: SignalDbRow[] = Array.from(
        { length: RECENT_CORPUS_CACHE_LIMIT },
        (_, idx) => ({
          id: `sig-cache-${idx}`,
          dateKey: "2026-11-24",
          titleZh: `缓存信号 ${idx}`,
          titleOrig: `Cached Signal ${idx}`,
          category: "revenue",
          whatItIs: "SaaS workflow",
          businessSignal: "$5k MRR",
          indieTakeaway: "Niche wedge",
          metricsBadge: "$5k MRR",
          metricType: "revenue",
          tags: ["#MicroSaaS"],
          translations: {},
          score: 8.1,
          isTopPick: false,
          sourcePlatform: "trustmrr",
          sourceSublabel: "TrustMRR 实名榜",
          sourceUrl: `https://trustmrr.com/startup/c-${idx}`,
          publishedAt: now,
          createdAt: now,
        })
      );

      const deepRow: SignalDbRow = {
        id: "sig-deep-archive-001",
        dateKey: "2026-05-10",
        titleZh: "早期归档 SaaS 案例",
        titleOrig: "Early Archive SaaS Case",
        category: "revenue",
        whatItIs: "Automated invoicing",
        businessSignal: "$19k MRR",
        indieTakeaway: "Focus on SMB billing",
        metricsBadge: "$19k MRR",
        metricType: "revenue",
        tags: ["#Stripe"],
        translations: {
          en: {
            title: "Early Archive SaaS Case",
            whatItIs: "Automated invoicing",
            businessSignal: "$19k MRR",
            indieTakeaway: "Focus on SMB billing",
            metricsBadge: "$19k MRR",
            tags: ["#Stripe"],
          },
          _meta: {
            productUrl: "https://earlybilling.io",
            discussionUrl: "https://trustmrr.com/startup/earlybilling",
          },
        },
        score: 9.0,
        isTopPick: true,
        sourcePlatform: "trustmrr",
        sourceSublabel: "TrustMRR 实名榜",
        sourceUrl: "https://trustmrr.com/startup/earlybilling",
        publishedAt: now,
        createdAt: now,
      };

      let whereLookupCount = 0;
      setDbForTests({
        select() {
          return {
            from() {
              return {
                orderBy() {
                  return {
                    limit: async (n: number) => mockRows.slice(0, n),
                  };
                },
                where() {
                  whereLookupCount += 1;
                  return {
                    orderBy() {
                      return {
                        limit: async () => [deepRow],
                      };
                    },
                  };
                },
              };
            },
          };
        },
      });

      const deepDetail = await getSignalDetailPayload("en", "sig-deep-archive-001");
      assert.ok(deepDetail);
      assert.equal(whereLookupCount, 1);
      assert.equal(deepDetail.item.title, "Early Archive SaaS Case");
      assert.equal(deepDetail.item.productUrl, "https://earlybilling.io/");
      assert.equal(
        deepDetail.item.discussionUrl,
        "https://trustmrr.com/startup/earlybilling"
      );
    });
  });
});
