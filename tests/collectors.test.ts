import "./helpers/env-guard";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  fetchAppStoreTopGrossing,
  fetchGitHubTrending,
  fetchTrustMrr,
  setExtraSourcesTimingForTests,
} from "../src/lib/collectors/extra-sources";
import {
  fetchViaJinaMarkdown,
  setJinaTimingForTests,
} from "../src/lib/collectors/jina";
import {
  fetchAcquireListings,
  fetchHackerNewsShowHN,
  fetchIndieHackers,
  fetchProductHuntFeed,
  fetchRedditSubreddits,
  getScannedCandidatesCount,
  resetScannedCandidatesCount,
} from "../src/lib/collectors/sources";
import {
  installFetchMock,
  jsonResponse,
  resetOfflineTestGuard,
  textResponse,
  withEnv,
} from "./helpers/env-guard";

const FIXTURES_DIR = join(process.cwd(), "tests/helpers/fixtures");
const readFixture = (name: string) =>
  readFileSync(join(FIXTURES_DIR, name), "utf8");

describe("Collectors & Jina Throttling Pool", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    resetScannedCandidatesCount();
    setJinaTimingForTests({
      retryBackoffMs: 5,
      errorBackoffMs: 5,
      anonSpacingMs: 0,
      authSpacingMs: 0,
    });
    setExtraSourcesTimingForTests({
      ghTrendingMinDelayMs: 0,
      ghTrendingMaxDelayMs: 0,
    });
  });

  afterEach(() => {
    setJinaTimingForTests(null);
    setExtraSourcesTimingForTests(null);
    resetOfflineTestGuard();
  });

  describe("Jina Throttling Pool (jina.ts)", () => {
    it("immediately rejects private/loopback/metadata URLs with 0 network calls", async () => {
      const mock = installFetchMock(() => textResponse("should not be called"));
      try {
        assert.equal(
          await fetchViaJinaMarkdown("http://127.0.0.1:8080/internal"),
          null
        );
        assert.equal(
          await fetchViaJinaMarkdown("http://169.254.169.254/latest/meta-data"),
          null
        );
        assert.equal(
          await fetchViaJinaMarkdown("http://localhost:3000/secret"),
          null
        );
        assert.equal(mock.calls.length, 0);
      } finally {
        mock.restore();
      }
    });

    it("retries once on HTTP 429/503 and on network error, then succeeds", async () => {
      let attempt429 = 0;
      const mock1 = installFetchMock((url) => {
        assert.equal(url, "https://r.jina.ai/https://trustmrr.com/");
        attempt429 += 1;
        if (attempt429 === 1) {
          return textResponse("Rate limited", 429);
        }
        return textResponse("#Recovered Markdown", 200);
      });
      try {
        const res = await fetchViaJinaMarkdown("https://trustmrr.com/", 2000);
        assert.ok(res && res.ok);
        assert.equal(await res.text(), "#Recovered Markdown");
        assert.equal(mock1.calls.length, 2);
        assert.equal(mock1.calls[0].headers.authorization, undefined);
      } finally {
        mock1.restore();
      }

      let attemptNetErr = 0;
      const mock2 = installFetchMock(() => {
        attemptNetErr += 1;
        if (attemptNetErr === 1) {
          throw new Error("Socket hang up");
        }
        return textResponse("Recovered after 503/network error", 200);
      });
      try {
        const res = await fetchViaJinaMarkdown("https://acquire.com/", 2000);
        assert.ok(res && res.ok);
        assert.equal(mock2.calls.length, 2);
      } finally {
        mock2.restore();
      }
    });

    it("attaches Authorization: Bearer header when JINA_API_KEY is configured", async () => {
      await withEnv({ JINA_API_KEY: "jina_fake_key_for_test" }, async () => {
        const mock = installFetchMock(() => textResponse("ok", 200));
        try {
          const res = await fetchViaJinaMarkdown("https://indiehackers.com/");
          assert.ok(res?.ok);
          assert.equal(mock.calls.length, 1);
          assert.equal(
            mock.calls[0].headers.authorization,
            "Bearer jina_fake_key_for_test"
          );
          assert.equal(mock.calls[0].headers["x-return-format"], "markdown");
        } finally {
          mock.restore();
        }
      });
    });

    it("caps anonymous concurrency at 2 simultaneous in-flight requests", async () => {
      setJinaTimingForTests({ anonSpacingMs: 2, authSpacingMs: 1 });
      let inFlight = 0;
      let peakInFlight = 0;

      const mock = installFetchMock(async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 25));
        inFlight -= 1;
        return textResponse("slot-ok", 200);
      });

      try {
        const results = await Promise.all([
          fetchViaJinaMarkdown("https://example.com/1"),
          fetchViaJinaMarkdown("https://example.com/2"),
          fetchViaJinaMarkdown("https://example.com/3"),
          fetchViaJinaMarkdown("https://example.com/4"),
          fetchViaJinaMarkdown("https://example.com/5"),
        ]);
        assert.equal(results.length, 5);
        assert.ok(results.every((r) => r?.ok));
        assert.equal(peakInFlight, 2);
      } finally {
        mock.restore();
      }
    });
  });

  describe("1. Hacker News (Show HN)", () => {
    it("parses Algolia API, filters toys, preserves hard monetization overrides, deduplicates URLs, and enriches short posts", async () => {
      const algoliaFixture = readFixture("hn-algolia.json");
      const mock = installFetchMock((url) => {
        if (url.startsWith("https://hn.algolia.com/api/v1/search?tags=show_hn")) {
          return textResponse(algoliaFixture, 200, "application/json");
        }
        if (url === "https://hacker-news.firebaseio.com/v0/item/9001.json") {
          return jsonResponse({
            by: "alice_founder",
            text: "Hi HN! I built MailPulse after losing $3k to silent Stripe webhook failures.",
          });
        }
        if (url === "https://hacker-news.firebaseio.com/v0/item/9002.json") {
          return jsonResponse({
            by: "other_commenter",
            text: "Should not be treated as author self-pitch.",
          });
        }
        if (url === "https://mailpulse.example.com") {
          // Verify SSRF redirect protection on landing page meta fetch: 302 -> safe URL -> HTML
          return new Response("", {
            status: 302,
            headers: { Location: "https://www.mailpulse.example.com/home" },
          });
        }
        if (url === "https://www.mailpulse.example.com/home") {
          return textResponse(
            `<html><head><title>MailPulse</title><meta name="description" content="Real-time Stripe billing &amp; webhook alerting for B2B SaaS." /></head><body></body></html>`,
            200,
            "text/html"
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      try {
        const excluded = new Set(["https://already-seen.example.com"]);
        const items = await fetchHackerNewsShowHN(4, excluded);

        assert.equal(items.length, 2);
        assert.ok(getScannedCandidatesCount() >= 5);

        const urls = items.map((i) => i.url);
        // MailPulse kept & enriched
        assert.ok(urls.includes("https://mailpulse.example.com"));
        // ChessClub CRM has "chess" (toy word) BUT also "SaaS", "Stripe", "MRR", "CRM" -> kept by HN_HARD_MONETIZATION_OVERRIDE
        assert.ok(urls.includes("https://chessclubcrm.example.com"));
        // Pure Gameboy shader toy, SSRF 127.0.0.1, and excluded historical URL are all filtered out
        assert.ok(!urls.includes("https://github.com/bob/gb-shader"));
        assert.ok(!urls.includes("http://127.0.0.1:8080/admin"));
        assert.ok(!urls.includes("https://already-seen.example.com"));

        const mailPulse = items.find(
          (i) => i.url === "https://mailpulse.example.com"
        )!;
        assert.ok(
          mailPulse.summary.includes(
            "Real-time Stripe billing & webhook alerting"
          )
        );
        assert.ok(mailPulse.summary.includes("losing $3k to silent Stripe"));
        assert.equal(mailPulse.sourceSublabel, "Show HN");
      } finally {
        mock.restore();
      }
    });

    it("automatically falls back to Firebase showstories when Algolia fails", async () => {
      const mock = installFetchMock((url) => {
        if (url.startsWith("https://hn.algolia.com/")) {
          return textResponse("Service Unavailable", 503);
        }
        if (url === "https://hacker-news.firebaseio.com/v0/showstories.json") {
          return jsonResponse([701, 702, 703]);
        }
        if (url === "https://hacker-news.firebaseio.com/v0/item/701.json") {
          return jsonResponse({
            id: 701,
            title: "Show HN: Retro NES emulator in C",
            url: "https://github.com/nes/emu",
            score: 40,
            descendants: 12,
            time: 1795480000,
          });
        }
        if (url === "https://hacker-news.firebaseio.com/v0/item/702.json") {
          return jsonResponse({
            id: 702,
            title: "Show HN: LedgerFlow – Automated SaaS invoice API",
            text: "Built an API for Stripe &amp; tax invoices.",
            url: "https://ledgerflow.example.com",
            score: 36,
            descendants: 9,
            time: 1795481000,
          });
        }
        if (url === "https://hacker-news.firebaseio.com/v0/item/703.json") {
          return jsonResponse({
            id: 703,
            title: "Show HN: Low score post",
            url: "https://lowscore.example.com",
            score: 1,
            descendants: 0,
            time: 1795481000,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      try {
        const items = await fetchHackerNewsShowHN(4);
        assert.equal(items.length, 1);
        assert.equal(items[0].url, "https://ledgerflow.example.com");
        assert.equal(
          items[0].summary,
          "Built an API for Stripe & tax invoices."
        );
        assert.equal(items[0].rawMetric, "▲ 36 HN · 💬 9");
      } finally {
        mock.restore();
      }
    });
  });

  describe("2. Product Hunt", () => {
    it("parses Atom XML, decodes CDATA and HTML entities, and skips unsafe or excluded URLs", async () => {
      const xml = readFixture("producthunt-feed.xml");
      const mock = installFetchMock((url) => {
        assert.equal(url, "https://www.producthunt.com/feed");
        return textResponse(xml, 200, "application/atom+xml");
      });

      try {
        const excluded = new Set([
          "https://www.producthunt.com/posts/already-synced",
        ]);
        const items = await fetchProductHuntFeed(4, excluded);
        assert.equal(items.length, 2);

        assert.equal(
          items[0].title,
          "FormCraft & AI '26 — Instant B2B Intake Forms"
        );
        assert.equal(
          items[0].summary,
          'Turn plain prompts into Stripe-connected & GDPR-compliant client onboarding forms in "60 seconds".'
        );
        assert.equal(
          items[0].url,
          "https://www.producthunt.com/posts/formcraft-ai"
        );
        assert.equal(items[0].sourceSublabel, "PH Top #1");

        assert.equal(items[1].title, "DocuSnap Studio");
        assert.equal(items[1].sourceSublabel, "PH Top #4");
      } finally {
        mock.restore();
      }
    });
  });

  describe("3. Indie Hackers", () => {
    it("parses home hot posts, filters legacy /post/tech/ paths, drops >7d stale posts, and extracts Build Board revenue", async () => {
      const homeMd = readFixture("indiehackers-home.md");
      const productsMd = readFixture("indiehackers-products.md");
      const freshIso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

      const mock = installFetchMock((url) => {
        if (url === "https://r.jina.ai/https://www.indiehackers.com/") {
          return textResponse(homeMd, 200);
        }
        if (
          url ===
          "https://r.jina.ai/https://www.indiehackers.com/products?revenueVerification=stripe&sorting=newest-first"
        ) {
          return textResponse(productsMd, 200);
        }
        if (
          url ===
          "https://r.jina.ai/https://www.indiehackers.com/post/numbers/ai-pdf-12k-mrr-abc123"
        ) {
          return textResponse(
            `Published Time: ${freshIso}\nMarkdown Content:\nWe launched six months ago focusing on automated invoice parsing for accounting firms and crossed $12,000 MRR with 92% margins and zero paid ads.`,
            200
          );
        }
        if (
          url ===
          "https://r.jina.ai/https://www.indiehackers.com/post/stale-5k-mrr-xyz999"
        ) {
          return textResponse(
            `Published Time: 2024-05-01T00:00:00Z\nMarkdown Content:\nThis post is from 2024 and must be discarded by the 7-day freshness gate even though it has high upvotes.`,
            200
          );
        }
        throw new Error(`Unexpected IH URL: ${url}`);
      });

      try {
        const excluded = new Set([
          "https://www.indiehackers.com/post/historical-seen-thread",
          "https://www.indiehackers.com/product/seen-prod",
        ]);
        const items = await fetchIndieHackers(4, excluded);

        assert.equal(items.length, 2);
        const urls = items.map((i) => i.url);
        assert.ok(
          urls.includes(
            "https://www.indiehackers.com/post/numbers/ai-pdf-12k-mrr-abc123"
          )
        );
        assert.ok(
          urls.includes("https://www.indiehackers.com/product/clipflow")
        );
        // Legacy /post/tech/ and >7d stale post are both absent
        assert.ok(
          !urls.some((u) => u.includes("/post/tech/")) &&
            !urls.some((u) => u.includes("stale-5k-mrr"))
        );

        const buildBoard = items.find(
          (i) => i.url === "https://www.indiehackers.com/product/clipflow"
        )!;
        assert.equal(buildBoard.sourceSublabel, "IH Build Board");
        assert.equal(buildBoard.rawMetric, "$8.4k · ▲ 28");

        const numbersPost = items.find((i) =>
          i.url.includes("ai-pdf-12k-mrr-abc123")
        )!;
        assert.equal(numbersPost.sourceSublabel, "IH 营收快讯");
        assert.ok(numbersPost.summary.includes("crossed $12,000 MRR"));
      } finally {
        mock.restore();
      }
    });
  });

  describe("4. Acquire.com", () => {
    it("filters tech slugs from sitemap.xml, excludes blacklisted industries, and extracts ARR / TTM metrics", async () => {
      const sitemapXml = readFixture("acquire-sitemap.xml");
      const detailMd = readFixture("acquire-detail.md");

      const mock = installFetchMock((url) => {
        if (url === "https://app.acquire.com/sitemap.xml") {
          return textResponse(sitemapXml, 200, "application/xml");
        }
        if (
          url ===
          "https://r.jina.ai/https://app.acquire.com/public/a1b2-b2b-ai-crm-saas"
        ) {
          return textResponse(detailMd, 200);
        }
        if (
          url ===
          "https://r.jina.ai/https://app.acquire.com/public/c3d4-shopify-analytics-plugin"
        ) {
          return textResponse(
            `Title: Shopify Analytics Plugin | Acquire.com\nMarkdown Content:\nRecurring merchant analytics app.\nTTM revenue: $84k\nLast month revenue: $7.2k`,
            200
          );
        }
        throw new Error(`Unexpected Acquire URL: ${url}`);
      });

      try {
        const excluded = new Set([
          "https://app.acquire.com/public/already-synced-saas",
        ]);
        const items = await fetchAcquireListings(4, excluded);

        assert.equal(items.length, 2);
        assert.equal(
          items[0].url,
          "https://app.acquire.com/public/a1b2-b2b-ai-crm-saas"
        );
        assert.equal(items[0].title, "Profitable B2B AI CRM SaaS");
        assert.equal(items[0].rawMetric, "ARR $195k · 净利 $142k");

        assert.equal(
          items[1].url,
          "https://app.acquire.com/public/c3d4-shopify-analytics-plugin"
        );
        assert.equal(items[1].rawMetric, "年收 $84k · 月收 $7.2k");
      } finally {
        mock.restore();
      }
    });

    it("falls back to saas-companies-for-sale when sitemap fails", async () => {
      const fallbackMd = readFixture("acquire-fallback.md");
      const mock = installFetchMock((url) => {
        if (url === "https://app.acquire.com/sitemap.xml") {
          return textResponse("Upstream error", 502);
        }
        if (
          url ===
          "https://r.jina.ai/https://acquire.com/saas-companies-for-sale/"
        ) {
          return textResponse(fallbackMd, 200);
        }
        throw new Error(`Unexpected Acquire fallback URL: ${url}`);
      });

      try {
        const excluded = new Set([
          "https://app.acquire.com/startup/already-synced-fallback",
        ]);
        const items = await fetchAcquireListings(3, excluded);
        assert.equal(items.length, 1);
        assert.equal(
          items[0].url,
          "https://app.acquire.com/startup/warmup-saas-01"
        );
        assert.equal(items[0].sourceSublabel, "Acquire SaaS 精选");
        assert.ok(items[0].rawMetric.includes("叫价 $120k"));
      } finally {
        mock.restore();
      }
    });
  });

  describe("5. TrustMRR", () => {
    it("filters anonymous slugs & <$150 toys, parses What's happening feed, enriches detail MRR, and deduplicates", async () => {
      const homeMd = readFixture("trustmrr-home.md");
      const detailMd = readFixture("trustmrr-detail.md");

      const mock = installFetchMock((url) => {
        if (url === "https://r.jina.ai/https://trustmrr.com/") {
          return textResponse(homeMd, 200);
        }
        if (url === "https://r.jina.ai/https://trustmrr.com/acquire") {
          // Return duplicate invoicepilot card to verify seenUrls deduplication
          return textResponse(
            `[FOR SALE ![logo](https://trustmrr.com/l1.png) ### InvoicePilot Revenue $14.5k Price $180k](https://trustmrr.com/startup/invoicepilot)`,
            200
          );
        }
        if (
          url ===
          "https://r.jina.ai/https://trustmrr.com/startup/invoicepilot"
        ) {
          return textResponse(detailMd, 200);
        }
        if (
          url === "https://r.jina.ai/https://trustmrr.com/startup/rankpulse"
        ) {
          return textResponse(
            `Title: RankPulse | TrustMRR\nMarkdown Content:\n# RankPulse\nAutomated SEO rank anomaly tracker doing MRR $6.2k with 120 agency teams.`,
            200
          );
        }
        throw new Error(`Unexpected TrustMRR URL: ${url}`);
      });

      try {
        const excluded = new Set([
          "https://trustmrr.com/startup/already-seen-mrr",
        ]);
        const items = await fetchTrustMrr(10, excluded);

        assert.equal(items.length, 2);
        const urls = items.map((i) => i.url);
        assert.deepEqual(urls, [
          "https://trustmrr.com/startup/invoicepilot",
          "https://trustmrr.com/startup/rankpulse",
        ]);

        // Detail MRR enriched cleanly
        assert.equal(items[0].title, "InvoicePilot");
        assert.ok(items[0].rawMetric.startsWith("MRR $4.8k"));
        assert.ok(items[0].summary.includes("Startup Details:"));

        // Feed item parsed & enriched
        assert.equal(items[1].sourceSublabel, "TrustMRR 动态");
        assert.ok(items[1].rawMetric.startsWith("MRR $6.2k"));
      } finally {
        mock.restore();
      }
    });
  });

  describe("6. App Store (US / JP Top Grossing)", () => {
    it("filters Big Tech & hardware apps, applies new-launch bonus, deduplicates bundleId across regions, and enforces category & 5+5 quotas", async () => {
      const recentReleaseIso = new Date(
        Date.now() - 60 * 86400 * 1000
      ).toISOString();
      const rawJson = readFixture("appstore-rss.json").replaceAll(
        "{{RECENT_DATE}}",
        recentReleaseIso
      );
      const feeds = JSON.parse(rawJson) as Record<string, unknown>;

      const mock = installFetchMock((url) => {
        if (url.includes("/us/rss/topgrossingapplications/limit=60/genre=6007/")) {
          return jsonResponse(feeds.us6007);
        }
        if (url.includes("/us/rss/topgrossingapplications/limit=60/genre=6002/")) {
          return jsonResponse(feeds.us6002);
        }
        if (url.includes("/jp/rss/topgrossingapplications/limit=60/genre=6007/")) {
          return jsonResponse(feeds.jp6007);
        }
        if (url.includes("/jp/rss/topgrossingapplications/limit=60/genre=6002/")) {
          return jsonResponse(feeds.jp6002);
        }
        throw new Error(`Unexpected iTunes URL: ${url}`);
      });

      try {
        const items = await fetchAppStoreTopGrossing(10);
        assert.equal(items.length, 10);

        const usItems = items.filter((i) => i.sourceSublabel.startsWith("美区"));
        const jpItems = items.filter((i) => i.sourceSublabel.startsWith("日区"));
        assert.equal(usItems.length, 5);
        assert.equal(jpItems.length, 5);

        // Big Tech & hardware companion filtered out
        assert.ok(!items.some((i) => /ChatGPT|Google|RoadCam/i.test(i.title)));

        // Cross-region bundleId deduplicated (VoiceMemo AI Note appears only once)
        const voiceMemoMatches = items.filter((i) =>
          i.title.includes("VoiceMemo AI Note")
        );
        assert.equal(voiceMemoMatches.length, 1);

        // Category caps enforced: QR <= 1, Cleaner <= 2, VPN/Adblock <= 2
        const qrCount = items.filter((i) => /\bqr\b|barcode/i.test(i.title)).length;
        const cleanerCount = items.filter((i) => /cleaner/i.test(i.title)).length;
        const vpnCount = items.filter(
          (i) => /\bvpn\b|proxy|adblock|広告ブロック/i.test(i.title)
        ).length;
        assert.equal(qrCount, 1);
        assert.equal(cleanerCount, 2);
        assert.equal(vpnCount, 2);

        // Freshness year tag applied
        assert.ok(items[0].rawMetric.includes("新黑马"));
      } finally {
        mock.restore();
      }
    });
  });

  describe("7. GitHub Trending & 7-Day Breakout", () => {
    it("scans 5 language Daily Trending pages, deduplicates & merges valid starsToday/totalStars, and populates githubStats across both pools", async () => {
      const trendingHtml = readFixture("github-trending.html");
      const breakoutJson = readFixture("github-breakout.json");
      const rustTrendingHtml = `
        <div class="Box">
          <article class="Box-row">
            <h2 class="h3 lh-condensed"><a href="/acme/agent-browser">acme / agent-browser</a></h2>
            <p class="col-9">Headless browser automation workflow SDK</p>
            <div>
              <span itemprop="programmingLanguage">TypeScript</span>
              <a href="/acme/agent-browser/stargazers">4,310</a>
              <span>0 stars today</span>
            </div>
          </article>
          <article class="Box-row">
            <h2 class="h3 lh-condensed"><a href="/rust-ai/mcp-runtime">rust-ai / mcp-runtime</a></h2>
            <p class="col-9">Zero-overhead Rust MCP server gateway &amp; sandbox runtime</p>
            <div>
              <span itemprop="programmingLanguage">Rust</span>
              <a href="/rust-ai/mcp-runtime/stargazers">1,850</a>
              <span>420 stars today</span>
            </div>
          </article>
        </div>
      `;

      const requestedTrendingUrls: string[] = [];
      const mock = installFetchMock((url) => {
        if (url.startsWith("https://github.com/trending")) {
          requestedTrendingUrls.push(url);
          if (url === "https://github.com/trending?since=daily") {
            return textResponse(trendingHtml, 200, "text/html");
          }
          if (url === "https://github.com/trending/rust?since=daily") {
            return textResponse(rustTrendingHtml, 200, "text/html");
          }
          return textResponse("<div class='Box'></div>", 200, "text/html");
        }
        if (url.startsWith("https://api.github.com/search/repositories")) {
          return textResponse(breakoutJson, 200, "application/json");
        }
        throw new Error(`Unexpected GitHub URL: ${url}`);
      });

      try {
        const excluded = new Set(["https://github.com/seen/already-in-db"]);
        const items = await fetchGitHubTrending(10, 4, excluded);

        assert.deepEqual(requestedTrendingUrls, [
          "https://github.com/trending?since=daily",
          "https://github.com/trending/typescript?since=daily",
          "https://github.com/trending/python?since=daily",
          "https://github.com/trending/rust?since=daily",
          "https://github.com/trending/go?since=daily",
        ]);

        assert.equal(items.length, 4);
        // Pool A #1: acme/agent-browser deduplicated across "" (615 today, 4280 total) & "rust" (0 today, 4310 total) -> retains 615 today & 4310 total!
        assert.equal(items[0].url, "https://github.com/acme/agent-browser");
        assert.equal(items[0].sourceSublabel, "GitHub Trending");
        assert.equal(items[0].rawMetric, "★ 4.3k (+615 今日)");
        assert.deepEqual(items[0].githubStats, {
          totalStars: 4310,
          starsDelta: 615,
          deltaKind: "today",
        });

        // Pool A #2: rust-ai/mcp-runtime from Rust daily trending
        assert.equal(items[1].url, "https://github.com/rust-ai/mcp-runtime");
        assert.equal(items[1].sourceSublabel, "GitHub Trending");
        assert.equal(items[1].rawMetric, "★ 1.9k (+420 今日)");
        assert.deepEqual(items[1].githubStats, {
          totalStars: 1850,
          starsDelta: 420,
          deltaKind: "today",
        });

        // Pool B: 7d Breakout — MIT + demo homepage (300 stars) outranks GPL-3.0 (330 stars) and carries per_day githubStats!
        assert.equal(
          items[2].url,
          "https://github.com/indie/mcp-billing-gateway"
        );
        assert.equal(items[2].sourceSublabel, "GitHub 7日新锐");
        assert.equal(items[2].githubStats?.totalStars, 300);
        assert.equal(items[2].githubStats?.deltaKind, "per_day");
        assert.ok((items[2].githubStats?.starsDelta ?? 0) >= 1);
        assert.match(items[2].rawMetric, /^★ 300 \(\+\d+\/日\)$/);

        assert.equal(items[3].url, "https://github.com/indie/pdf-ocr-gpl");
        assert.equal(items[3].githubStats?.totalStars, 330);
        assert.equal(items[3].githubStats?.deltaKind, "per_day");
        assert.match(items[3].rawMetric, /^★ 330 \(\+\d+\/日\)$/);

        // Noise repos (leetcode / minecraft cheat) and duplicate URL not duplicated
        assert.ok(
          !items.some((i) => /leetcode|minecraft/i.test(i.url)) &&
            items.filter((i) => i.url === "https://github.com/acme/agent-browser")
              .length === 1
        );
      } finally {
        mock.restore();
      }
    });
  });

  describe("8. Reddit", () => {
    it("filters removed/spam posts in Arctic Shift and boosts pain-point & revenue keywords", async () => {
      const redditFixture = JSON.parse(
        readFixture("reddit-arctic-shift.json")
      ) as Record<string, unknown>;

      const mock = installFetchMock((url) => {
        if (url.includes("subreddit=SaaS")) {
          return jsonResponse(redditFixture.SaaS);
        }
        if (url.includes("subreddit=SomebodyMakeThis")) {
          return jsonResponse(redditFixture.SomebodyMakeThis);
        }
        throw new Error(`Unexpected Reddit URL: ${url}`);
      });

      try {
        const items = await fetchRedditSubreddits(
          ["SaaS", "SomebodyMakeThis"],
          1
        );
        assert.equal(items.length, 2);

        const saasItem = items.find((i) => i.sourceSublabel === "r/SaaS")!;
        assert.ok(saasItem.title.includes("$9.2k MRR"));
        assert.ok(saasItem.title.includes("& reduced churn"));
        assert.equal(saasItem.rawMetric, "▲ 38 · 💬 19");

        // In SomebodyMakeThis, p2 (score 12 + pain boost 12 + 6*1.2 = 49.2) beats p1 (score 14, no pain boost = 39.8)
        const painItem = items.find(
          (i) => i.sourceSublabel === "r/SomebodyMakeThis"
        )!;
        assert.ok(painItem.title.includes("VAT reconciliation"));
        assert.equal(painItem.rawMetric, "💬 6 讨论 · ▲ 12");
      } finally {
        mock.restore();
      }
    });

    it("falls back to HN Ask HN pain points when both Reddit OAuth and Arctic Shift fail", async () => {
      const mock = installFetchMock((url) => {
        if (url.startsWith("https://arctic-shift.photon-reddit.com/")) {
          return textResponse("Gateway Timeout", 504);
        }
        if (
          url.startsWith(
            "https://hn.algolia.com/api/v1/search_by_date?tags=(story,ask_hn)"
          )
        ) {
          return jsonResponse({
            hits: [
              {
                objectID: "88001",
                title: "Ask HN: What B2B SaaS are you paying too much for in 2026?",
                story_text: "Looking for leaner indie alternatives to bloated CRM tools.",
                points: 67,
                num_comments: 52,
                created_at: "2026-11-24T03:00:00Z",
              },
            ],
          });
        }
        throw new Error(`Unexpected fallback URL: ${url}`);
      });

      try {
        const items = await fetchRedditSubreddits(["SaaS"], 2);
        assert.equal(items.length, 1);
        assert.equal(items[0].sourcePlatform, "hackernews");
        assert.equal(items[0].sourceSublabel, "Ask HN 痛点");
        assert.equal(
          items[0].url,
          "https://news.ycombinator.com/item?id=88001"
        );
      } finally {
        mock.restore();
      }
    });
  });
});
