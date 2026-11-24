import "./helpers/env-guard";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import {
  GET as getRssFeed,
  generateStaticParams as generateRssStaticParams,
} from "../src/app/(localized)/[locale]/feed.xml/route";
import { generateMetadata as generateHomeMetadata } from "../src/app/(localized)/[locale]/page";
import { generateMetadata as generateTopicMetadata } from "../src/app/(localized)/[locale]/topic/[tag]/page";
import { GET as getLlmsFullTxt } from "../src/app/llms-full.txt/route";
import { GET as getLlmsTxt } from "../src/app/llms.txt/route";
import { HREFLANG_MAP, LOCALES } from "../src/i18n/config";
import { getDictionary } from "../src/i18n/dictionaries";
import { trackRadarEvent } from "../src/lib/analytics";
import { buildRssFeedXml, escapeXml } from "../src/lib/feeds";
import { collectRevalidatePaths } from "../src/lib/revalidate";
import {
  clearSignalsRepoMemoryCache,
  getAllAvailableDates,
  getRadarPayload,
  RECENT_CORPUS_CACHE_LIMIT,
} from "../src/lib/signals-repo";
import {
  buildSignalPermalink,
  buildTrackedOutboundUrl,
} from "../src/lib/utils";
import { middleware } from "../src/middleware";
import { resetOfflineTestGuard } from "./helpers/env-guard";

describe("Package A Growth Engine: RSS 2.0, llms.txt, Analytics, UTM & Cache/SSR Fixes", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    clearSignalsRepoMemoryCache();
  });

  afterEach(() => {
    resetOfflineTestGuard();
    clearSignalsRepoMemoryCache();
  });

  describe("1. 4-Locale RSS 2.0 Feeds (/[locale]/feed.xml) & Autodiscovery", () => {
    it("renders valid localized RSS 2.0 XML across all 4 locales and returns 404 on invalid locale", async () => {
      const staticParams = generateRssStaticParams();
      assert.equal(staticParams.length, LOCALES.length);

      for (const locale of LOCALES) {
        const res = await getRssFeed(
          new Request(`https://radar.aibuildon.com/${locale}/feed.xml`),
          { params: Promise.resolve({ locale }) }
        );
        assert.equal(res.status, 200);
        assert.match(
          res.headers.get("content-type") ?? "",
          /application\/rss\+xml/
        );
        const xml = await res.text();
        assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
        assert.ok(xml.includes(`<language>${HREFLANG_MAP[locale]}</language>`));
        assert.ok(
          xml.includes(
            `href="https://radar.aibuildon.com/${locale}/feed.xml" rel="self"`
          )
        );
        assert.ok(xml.includes("utm_source=rss#"));
        assert.ok(xml.includes("<item>"));

        // Verify <head> RSS autodiscovery metadata on localized home & hub pages
        const homeMeta = await generateHomeMetadata({
          params: Promise.resolve({ locale }),
        });
        assert.equal(
          homeMeta.alternates?.types?.["application/rss+xml"],
          `https://radar.aibuildon.com/${locale}/feed.xml`
        );
      }

      const topicMeta = await generateTopicMetadata({
        params: Promise.resolve({ locale: "zh", tag: "chrome-extension" }),
      });
      assert.equal(
        topicMeta.alternates?.types?.["application/rss+xml"],
        "https://radar.aibuildon.com/zh/feed.xml"
      );

      const badRes = await getRssFeed(
        new Request("https://radar.aibuildon.com/fr/feed.xml"),
        { params: Promise.resolve({ locale: "fr" }) }
      );
      assert.equal(badRes.status, 404);
    });

    it("escapes hostile XML characters, control bytes, and javascript: URLs in RSS items", () => {
      assert.equal(
        escapeXml("Bad\x00Title <script>&\"'"),
        "BadTitle &lt;script&gt;&amp;&quot;&apos;"
      );

      const xml = buildRssFeedXml({
        siteUrl: "https://radar.aibuildon.com",
        locale: "en",
        latestDateKey: "2026-11-24",
        items: [
          {
            id: "sig-evil",
            dateKey: "2026-11-24",
            title: "Evil <script>alert(1)</script> & SaaS",
            titleZh: "恶意标题",
            titleOrig: "Evil <script>alert(1)</script> & SaaS",
            category: "revenue",
            whatItIs: "Solves A & B <fast>",
            businessSignal: "$12k MRR",
            indieTakeaway: "Clone niche",
            metricsBadge: "$12k MRR",
            metricType: "revenue",
            tags: ["#SaaS&AI"],
            score: 9.1,
            isTopPick: true,
            sourcePlatform: "trustmrr",
            sourceSublabel: "Verified",
            sourceUrl: "javascript:alert(1)",
            publishedAt: "2026-11-24T01:00:00.000Z",
          },
        ],
      });

      assert.equal(xml.includes("<script>"), false);
      assert.equal(xml.includes("javascript:"), false);
      assert.ok(xml.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    });

    it("redirects root /feed.xml and /rss.xml by preferred locale while passing localized feeds & llms.txt through", () => {
      const rootFeed = middleware(
        new NextRequest("https://radar.aibuildon.com/feed.xml", {
          headers: { "accept-language": "ja,en;q=0.8" },
        })
      );
      assert.equal(rootFeed.status, 307);
      assert.equal(
        rootFeed.headers.get("location"),
        "https://radar.aibuildon.com/ja/feed.xml"
      );
      assert.equal(rootFeed.headers.get("vary"), "Accept-Language, Cookie");

      const rootRss = middleware(
        new NextRequest("https://radar.aibuildon.com/rss.xml", {
          headers: { "accept-language": "zh-CN,zh;q=0.9" },
        })
      );
      assert.equal(rootRss.status, 307);
      assert.equal(
        rootRss.headers.get("location"),
        "https://radar.aibuildon.com/zh/feed.xml"
      );

      for (const directPath of [
        "/en/feed.xml",
        "/zh/feed.xml",
        "/llms.txt",
        "/llms-full.txt",
      ]) {
        const res = middleware(
          new NextRequest(`https://radar.aibuildon.com${directPath}`)
        );
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("location"), null);
      }
    });
  });

  describe("2. AI Search Discovery (/llms.txt & /llms-full.txt) & Revalidation Coverage", () => {
    it("serves structured Markdown on /llms.txt and /llms-full.txt and includes feeds in collectRevalidatePaths", async () => {
      const llmsRes = await getLlmsTxt();
      assert.equal(llmsRes.status, 200);
      assert.match(llmsRes.headers.get("content-type") ?? "", /text\/plain/);
      const llmsBody = await llmsRes.text();
      assert.ok(llmsBody.startsWith("# AI Founder Radar"));
      assert.ok(llmsBody.includes("https://radar.aibuildon.com/en/feed.xml"));
      assert.ok(llmsBody.includes("https://radar.aibuildon.com/zh/feed.xml"));
      assert.ok(llmsBody.includes("https://radar.aibuildon.com/llms-full.txt"));
      assert.ok(
        llmsBody.includes("https://radar.aibuildon.com/en/topic/chrome-extension")
      );

      const fullRes = await getLlmsFullTxt();
      assert.equal(fullRes.status, 200);
      const fullBody = await fullRes.text();
      assert.ok(
        fullBody.startsWith(
          "# AI Founder Radar — Full Structured Commercial Intelligence Context"
        )
      );
      assert.ok(fullBody.includes("- **What It Is**:"));
      assert.ok(fullBody.includes("- **Monetization & Traction**:"));
      assert.ok(fullBody.includes("- **Replicable Indie Playbook**:"));
      assert.ok(fullBody.includes("utm_source=llms_txt#"));

      const paths = collectRevalidatePaths("2026-11-24", "2026-11-23");
      assert.ok(paths.includes("/llms.txt"));
      assert.ok(paths.includes("/llms-full.txt"));
      for (const loc of LOCALES) {
        assert.ok(paths.includes(`/${loc}/feed.xml`));
      }
    });
  });

  describe("3. Archive SSR Flag, 2MB Cache Guardrail, Analytics & Outbound UTM Attribution", () => {
    it("distinguishes home vs archive payload flags and enforces <2MB corpus cache limit", async () => {
      const dates = await getAllAvailableDates();
      const homePayload = await getRadarPayload("zh");
      const archivePayload = await getRadarPayload("zh", dates[0], true);

      assert.equal(homePayload.isArchiveRoute, false);
      assert.equal(archivePayload.isArchiveRoute, true);
      assert.ok(
        RECENT_CORPUS_CACHE_LIMIT <= 400,
        `RECENT_CORPUS_CACHE_LIMIT (${RECENT_CORPUS_CACHE_LIMIT}) must stay safely under Next.js 2MB unstable_cache ceiling`
      );
    });

    it("appends UTM parameters safely on toolbox & share permalinks and dispatches analytics without throwing", () => {
      assert.equal(
        buildSignalPermalink({
          siteUrl: "https://radar.aibuildon.com/",
          locale: "ja",
          dateKey: "2026-11-24",
          signalId: "sig-999",
          utmSource: "share_brief",
        }),
        "https://radar.aibuildon.com/ja/daily/2026-11-24?utm_source=share_brief#sig-999"
      );

      assert.equal(
        buildTrackedOutboundUrl("https://supabase.com?ref=partner123", {
          source: "radar.aibuildon.com",
          medium: "sidebar",
          campaign: "indie_stack",
        }),
        "https://supabase.com/?ref=partner123&utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack"
      );
      assert.equal(buildTrackedOutboundUrl("javascript:alert(1)"), "#");

      for (const locale of LOCALES) {
        const dict = getDictionary(locale);
        assert.ok(dict.footer.rssLabel.length > 0);
        assert.ok(dict.footer.llmsLabel.length > 0);
        assert.ok(dict.footer.githubLabel.length > 0);
        for (const tool of dict.sidebar.tools) {
          assert.ok(
            tool.url.includes("utm_source=radar.aibuildon.com"),
            `Missing UTM on toolbox URL (${locale} - ${tool.name}): ${tool.url}`
          );
        }
      }

      // Test trackRadarEvent dispatching & error resilience
      const capturedPosthog: Array<{ event: string; props: unknown }> = [];
      const capturedGtag: Array<{ cmd: string; event: string; props: unknown }> =
        [];
      const g = globalThis as unknown as { window?: unknown };
      const prevWin = g.window;

      try {
        g.window = {
          posthog: {
            capture: (event: string, props: unknown) => {
              capturedPosthog.push({ event, props });
            },
          },
          gtag: (cmd: string, event: string, props: unknown) => {
            capturedGtag.push({ cmd, event, props });
          },
        };

        trackRadarEvent("toolbox_click", {
          tool_name: "Supabase",
          locale: "zh",
          ignored: undefined,
        });

        assert.equal(capturedPosthog.length, 1);
        assert.deepEqual(capturedPosthog[0], {
          event: "toolbox_click",
          props: { tool_name: "Supabase", locale: "zh" },
        });
        assert.equal(capturedGtag.length, 1);
        assert.deepEqual(capturedGtag[0], {
          cmd: "event",
          event: "toolbox_click",
          props: { tool_name: "Supabase", locale: "zh" },
        });

        // Throwing tracker must never crash caller
        g.window = {
          posthog: {
            capture: () => {
              throw new Error("Adblock blocked tracker");
            },
          },
        };
        assert.doesNotThrow(() =>
          trackRadarEvent("newsletter_submit", { locale: "en" })
        );
      } finally {
        if (prevWin === undefined) delete g.window;
        else g.window = prevWin;
      }
    });
  });
});
