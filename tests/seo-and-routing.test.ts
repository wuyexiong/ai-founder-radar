import "./helpers/env-guard";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  generateMetadata as generateDailyMetadata,
  generateStaticParams as generateDailyStaticParams,
} from "../src/app/(localized)/[locale]/daily/[date]/page";
import { generateMetadata as generateHomeMetadata } from "../src/app/(localized)/[locale]/page";
import {
  generateMetadata as generateSourceMetadata,
  generateStaticParams as generateSourceStaticParams,
} from "../src/app/(localized)/[locale]/source/[platform]/page";
import {
  generateMetadata as generateTopicMetadata,
  generateStaticParams as generateTopicStaticParams,
} from "../src/app/(localized)/[locale]/topic/[tag]/page";
import manifest from "../src/app/manifest";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import {
  getDb,
  hasDatabaseConfigured,
  normalizeDatabaseUrl,
  shouldRequireTls,
} from "../src/db";
import { HREFLANG_MAP, LOCALE_COOKIE, LOCALES } from "../src/i18n/config";
import {
  buildHubJsonLd,
  buildRadarJsonLd,
  buildRadarMetadata,
} from "../src/lib/seo";
import {
  getSourceCopy,
  getTopicCopy,
  resolveTopicSlugFromTag,
  SOURCE_PLATFORMS,
  TOPIC_SLUGS,
} from "../src/lib/seo-taxonomy";
import {
  getAllAvailableDates,
  getRadarPayload,
  getSeoHubIndex,
  getSourceHubPayload,
  getTopicHubPayload,
} from "../src/lib/signals-repo";
import { middleware } from "../src/middleware";
import {
  CLEARED_ENV_KEYS,
  resetOfflineTestGuard,
  withEnv,
} from "./helpers/env-guard";

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|json|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("SEO Metadata, Sitemap/Robots, Middleware & Database URL Tools", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
  });

  afterEach(() => {
    resetOfflineTestGuard();
  });

  describe("1. SEO Metadata & JSON-LD (seo.ts & localized pages)", () => {
    it("generates complete canonical, hreflang (with x-default), OG/Twitter tags, and sanitizes javascript: URLs in ItemList JSON-LD across all 4 locales", async () => {
      const dates = await getAllAvailableDates();
      const sampleDate = dates[0];

      await withEnv(
        { NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "gsc_verify_token_123" },
        async () => {
          for (const locale of LOCALES) {
            const payload = await getRadarPayload(locale, sampleDate);

            // Home route metadata
            const homeMeta = await generateHomeMetadata({
              params: Promise.resolve({ locale }),
            });
            assert.equal(
              homeMeta.alternates?.canonical,
              `https://radar.aibuildon.com/${locale}`
            );
            const homeLangs = homeMeta.alternates?.languages as Record<
              string,
              string
            >;
            for (const loc of LOCALES) {
              assert.equal(
                homeLangs[HREFLANG_MAP[loc]],
                `https://radar.aibuildon.com/${loc}`
              );
            }
            assert.equal(
              homeLangs["x-default"],
              "https://radar.aibuildon.com/en"
            );
            assert.equal(
              homeMeta.openGraph?.url,
              `https://radar.aibuildon.com/${locale}`
            );
            assert.equal(
              (homeMeta.twitter as { card?: string })?.card,
              "summary_large_image"
            );
            assert.equal(
              homeMeta.verification?.google,
              "gsc_verify_token_123"
            );

            // Archive route metadata
            const archiveMeta = await generateDailyMetadata({
              params: Promise.resolve({ locale, date: sampleDate }),
            });
            assert.equal(
              archiveMeta.alternates?.canonical,
              `https://radar.aibuildon.com/${locale}/daily/${sampleDate}`
            );
            const archiveLangs = archiveMeta.alternates?.languages as Record<
              string,
              string
            >;
            assert.equal(
              archiveLangs["x-default"],
              `https://radar.aibuildon.com/en/daily/${sampleDate}`
            );

            // JSON-LD structure & javascript: URL sanitization
            const itemsWithEvilUrl = [
              {
                ...payload.items[0],
                sourceUrl: "javascript:alert(document.cookie)",
              },
              ...payload.items.slice(1, 3),
            ];
            const jsonLd = buildRadarJsonLd({
              locale,
              dateKey: sampleDate,
              isArchiveRoute: true,
              overview: payload.overview,
              items: itemsWithEvilUrl,
            });

            const collectionNode = jsonLd["@graph"][1] as {
              "@type": string;
              url: string;
              mainEntity: {
                "@type": string;
                numberOfItems: number;
                itemListElement: Array<{
                  position: number;
                  url: string;
                  name: string;
                }>;
              };
            };
            assert.equal(collectionNode["@type"], "CollectionPage");
            assert.equal(collectionNode.mainEntity["@type"], "ItemList");
            assert.equal(
              collectionNode.mainEntity.numberOfItems,
              itemsWithEvilUrl.length
            );
            assert.equal(collectionNode.mainEntity.itemListElement[0].position, 1);
            // Unsafe javascript: URL sanitized to archive page URL
            assert.equal(
              collectionNode.mainEntity.itemListElement[0].url,
              `https://radar.aibuildon.com/${locale}/daily/${sampleDate}`
            );
            assert.equal(
              JSON.stringify(jsonLd).includes("javascript:"),
              false
            );
          }
        }
      );

      // Invalid locale or unarchived date returns empty metadata object
      const emptyMeta = await generateDailyMetadata({
        params: Promise.resolve({ locale: "fr", date: sampleDate }),
      });
      assert.deepEqual(emptyMeta, {});

      const staticParams = await generateDailyStaticParams();
      assert.equal(staticParams.length, LOCALES.length * Math.min(dates.length, 15));

      // Direct buildRadarMetadata check without verification env
      const plainMeta = buildRadarMetadata({
        locale: "en",
        dateKey: sampleDate,
        isArchiveRoute: false,
        overview: {
          dateKey: sampleDate,
          scannedCount: 100,
          selectedCount: 10,
          estimatedReadMinutes: 5,
          summaryNote: "Summary",
        },
        items: [],
      });
      assert.equal(plainMeta.verification, undefined);
    });
  });

  describe("2. robots.ts / sitemap.ts / manifest.ts & Legacy Domain Hygiene", () => {
    it("verifies Disallow: /api/, full symmetric Sitemap entries across locales & dates, valid Manifest, and zero indieradar.dev remnants", async () => {
      const robotsCfg = robots();
      const rules = Array.isArray(robotsCfg.rules)
        ? robotsCfg.rules
        : [robotsCfg.rules];
      assert.deepEqual(rules[0].disallow, ["/api/"]);
      assert.equal(
        robotsCfg.sitemap,
        "https://radar.aibuildon.com/sitemap.xml"
      );

      const dates = await getAllAvailableDates();
      const hubIndex = await getSeoHubIndex();
      const mapEntries = await sitemap();
      assert.equal(
        mapEntries.length,
        LOCALES.length *
          (1 +
            dates.length +
            hubIndex.topics.length +
            hubIndex.sources.length)
      );

      // Populated programmatic SEO hubs are included in sitemap
      assert.ok(
        mapEntries.some(
          (e) =>
            e.url === "https://radar.aibuildon.com/en/topic/chrome-extension"
        )
      );
      assert.ok(
        mapEntries.some(
          (e) => e.url === "https://radar.aibuildon.com/zh/topic/shopify"
        )
      );
      assert.ok(
        mapEntries.some(
          (e) => e.url === "https://radar.aibuildon.com/en/source/trustmrr"
        )
      );
      assert.ok(
        mapEntries.some(
          (e) => e.url === "https://radar.aibuildon.com/ja/source/reddit"
        )
      );
      // 0-item sources in local-fallback (e.g. acquire) are excluded from sitemap to prevent thin content
      assert.equal(
        mapEntries.some((e) => e.url.endsWith("/source/acquire")),
        false
      );

      for (const entry of mapEntries) {
        assert.ok(entry.url.startsWith("https://radar.aibuildon.com/"));
        assert.equal(entry.url.includes("indieradar.dev"), false);
        const langs = entry.alternates?.languages as Record<string, string>;
        assert.ok(langs);
        assert.ok(langs.en);
        assert.ok(langs["zh-CN"]);
        assert.ok(langs["zh-TW"]);
        assert.ok(langs.ja);
        assert.ok(langs["x-default"]?.startsWith("https://radar.aibuildon.com/en"));
      }

      const webManifest = manifest();
      assert.equal(webManifest.name, "AI Founder Radar");
      assert.equal(webManifest.start_url, "/");
      assert.ok((webManifest.icons ?? []).length >= 2);

      // Scan entire src/ directory for any leftover legacy domain indieradar.dev
      const srcFiles = collectSourceFiles(join(process.cwd(), "src"));
      for (const file of srcFiles) {
        const content = readFileSync(file, "utf8");
        assert.equal(
          content.includes("indieradar.dev"),
          false,
          `Found legacy domain indieradar.dev in ${file}`
        );
      }
    });
  });

  describe("3. Middleware Full Routing Matrix (middleware.ts)", () => {
    it("root / prioritizes Cookie over Accept-Language with 307 + Vary: Accept-Language, Cookie", () => {
      const req = new NextRequest("https://radar.aibuildon.com/", {
        headers: {
          "accept-language": "ja,en;q=0.9",
          cookie: `${LOCALE_COOKIE}=zh-TW`,
        },
      });
      const res = middleware(req);
      assert.equal(res.status, 307);
      assert.equal(
        res.headers.get("location"),
        "https://radar.aibuildon.com/zh-TW"
      );
      assert.equal(res.headers.get("vary"), "Accept-Language, Cookie");
    });

    it("redirects legacy /?date=2026-11-23 to 307 /<locale>/daily/2026-11-23", () => {
      const req = new NextRequest(
        "https://radar.aibuildon.com/?date=2026-11-23",
        {
          headers: { "accept-language": "zh-CN,zh;q=0.9" },
        }
      );
      const res = middleware(req);
      assert.equal(res.status, 307);
      assert.equal(
        res.headers.get("location"),
        "https://radar.aibuildon.com/zh/daily/2026-11-23"
      );
    });

    it("redirects unprefixed /daily/2026-11-23, /topic/*, and /source/* to 307 /<locale>/...", () => {
      const req = new NextRequest(
        "https://radar.aibuildon.com/daily/2026-11-23",
        {
          headers: { "accept-language": "ja-JP,ja;q=0.9" },
        }
      );
      const res = middleware(req);
      assert.equal(res.status, 307);
      assert.equal(
        res.headers.get("location"),
        "https://radar.aibuildon.com/ja/daily/2026-11-23"
      );
      assert.equal(res.headers.get("vary"), "Accept-Language, Cookie");

      const topicReq = new NextRequest(
        "https://radar.aibuildon.com/topic/chrome-extension",
        {
          headers: { "accept-language": "zh-CN,zh;q=0.9" },
        }
      );
      const topicRes = middleware(topicReq);
      assert.equal(topicRes.status, 307);
      assert.equal(
        topicRes.headers.get("location"),
        "https://radar.aibuildon.com/zh/topic/chrome-extension"
      );

      const sourceReq = new NextRequest(
        "https://radar.aibuildon.com/source/trustmrr",
        {
          headers: { "accept-language": "en-US,en;q=0.9" },
        }
      );
      const sourceRes = middleware(sourceReq);
      assert.equal(sourceRes.status, 307);
      assert.equal(
        sourceRes.headers.get("location"),
        "https://radar.aibuildon.com/en/source/trustmrr"
      );
    });

    it("permanently redirects /zh?date=2026-11-23 to 308 /zh/daily/2026-11-23", () => {
      const req = new NextRequest(
        "https://radar.aibuildon.com/zh?date=2026-11-23"
      );
      const res = middleware(req);
      assert.equal(res.status, 308);
      assert.equal(
        res.headers.get("location"),
        "https://radar.aibuildon.com/zh/daily/2026-11-23"
      );
    });

    it("falls back safely to home route on implausible/future dates like /?date=2099-01-01", () => {
      const rootFuture = middleware(
        new NextRequest("https://radar.aibuildon.com/?date=2099-01-01", {
          headers: { "accept-language": "en-US" },
        })
      );
      assert.equal(rootFuture.status, 307);
      assert.equal(
        rootFuture.headers.get("location"),
        "https://radar.aibuildon.com/en"
      );

      // Localized /zh?date=2099-01-01 does NOT redirect to /zh/daily/2099-01-01
      const zhFuture = middleware(
        new NextRequest("https://radar.aibuildon.com/zh?date=2099-01-01")
      );
      assert.equal(zhFuture.status, 200);
      assert.equal(zhFuture.headers.get("location"), null);
    });

    it("passes static assets, API routes, and icon endpoints straight through", () => {
      for (const path of [
        "/_next/static/chunks/main.js",
        "/api/newsletter/subscribe",
        "/favicon.ico",
        "/icon.svg",
        "/apple-icon",
        "/opengraph-image",
        "/manifest.webmanifest",
        "/robots.txt",
        "/sitemap.xml",
        "/en",
        "/zh/daily/2026-11-23",
        "/en/topic/chrome-extension",
        "/zh/source/reddit",
      ]) {
        const res = middleware(
          new NextRequest(`https://radar.aibuildon.com${path}`)
        );
        assert.equal(res.status, 200, `Expected 200 pass-through for ${path}`);
        assert.equal(res.headers.get("location"), null);
      }
    });
  });

  describe("4. Database Connection Utilities (src/db/index.ts)", () => {
    it("strips password brackets, channel_binding, and pgbouncer params in normalizeDatabaseUrl", () => {
      const supabaseRaw =
        "postgresql://postgres.ref:[MyS3cretP@ss!]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";
      const normalizedSupa = normalizeDatabaseUrl(supabaseRaw);
      assert.equal(normalizedSupa.includes("[MyS3cret"), false);
      assert.equal(normalizedSupa.includes("pgbouncer="), false);
      assert.ok(normalizedSupa.includes("connection_limit=1"));

      const neonRaw =
        "postgresql://neondb_owner:pass123@ep-cool-sky.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
      const normalizedNeon = normalizeDatabaseUrl(neonRaw);
      assert.equal(normalizedNeon.includes("channel_binding="), false);
      assert.ok(normalizedNeon.includes("sslmode=require"));
    });

    it("does not force TLS on localhost/loopback or explicit sslmode, and enables TLS on remote cloud DB hosts", () => {
      assert.equal(
        shouldRequireTls("postgresql://postgres:postgres@localhost:5432/radar"),
        false
      );
      assert.equal(
        shouldRequireTls("postgresql://postgres:postgres@127.0.0.1:5432/radar"),
        false
      );
      assert.equal(
        shouldRequireTls("postgresql://postgres:postgres@[::1]:5432/radar"),
        false
      );
      assert.equal(
        shouldRequireTls(
          "postgresql://user:pass@remote.db.example.com:5432/radar?sslmode=disable"
        ),
        false
      );
      assert.equal(
        shouldRequireTls(
          "postgresql://postgres.abc:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
        ),
        true
      );

      assert.equal(hasDatabaseConfigured(), false);
      assert.equal(getDb(), null);
    });
  });

  describe("5. Offline Env Guard & CI Workflow Security Gate", () => {
    it("env-guard clears all sensitive keys and blocks unmocked external fetch fail-fast", async () => {
      for (const key of CLEARED_ENV_KEYS) {
        assert.equal(
          process.env[key],
          undefined,
          `${key} must be cleared by env-guard`
        );
      }
      await assert.rejects(
        () => globalThis.fetch("https://example.com/unmocked"),
        /Blocked unmocked external fetch/
      );
    });

    it("ci.yml enforces least-privilege permissions, pinned Action SHAs, zero Secrets, paths-ignore, and offline DATABASE_URL", () => {
      const ciYml = readFileSync(".github/workflows/ci.yml", "utf8");
      assert.ok(ciYml.includes("contents: read"));
      assert.ok(
        ciYml.includes(
          "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683"
        )
      );
      assert.ok(
        ciYml.includes(
          "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"
        )
      );
      assert.equal(
        ciYml.includes("secrets."),
        false,
        "CI workflow must not inject any repository Secrets"
      );
      assert.ok(ciYml.includes('DATABASE_URL: ""'));
      assert.ok(ciYml.includes("paths-ignore:"));
      assert.ok(ciYml.includes("npm run typecheck"));
      assert.ok(ciYml.includes("npm run test:coverage"));
      assert.ok(ciYml.includes("npm run build"));
    });
  });

  describe("6. Programmatic SEO Topic & Source Hubs (/topic/[tag] & /source/[platform])", () => {
    it("maintains symmetric cross-locale topic classification, zero CJK leaks in EN copy, cross-day aggregation, and noindex guardrails on empty hubs", async () => {
      const cjkRe = /[\u4e00-\u9fff\u3040-\u30ff]/;

      for (const slug of TOPIC_SLUGS) {
        const enCopy = getTopicCopy(slug, "en");
        assert.equal(
          cjkRe.test(
            `${enCopy.label} ${enCopy.seoTitle} ${enCopy.h1} ${enCopy.description}`
          ),
          false,
          `CJK character leaked into English topic copy for ${slug}`
        );
      }

      for (const platform of SOURCE_PLATFORMS) {
        const enCopy = getSourceCopy(platform, "en");
        assert.equal(
          cjkRe.test(
            `${enCopy.label} ${enCopy.seoTitle} ${enCopy.h1} ${enCopy.description}`
          ),
          false,
          `CJK character leaked into English source copy for ${platform}`
        );
      }

      assert.equal(resolveTopicSlugFromTag("#Chrome插件"), "chrome-extension");
      assert.equal(
        resolveTopicSlugFromTag("#ChromeExtension"),
        "chrome-extension"
      );
      assert.equal(resolveTopicSlugFromTag("#Shopify生态"), "shopify");
      assert.equal(resolveTopicSlugFromTag("#随机未知标签XYZ"), null);

      const topicStatic = generateTopicStaticParams();
      assert.equal(topicStatic.length, LOCALES.length * TOPIC_SLUGS.length);
      const sourceStatic = generateSourceStaticParams();
      assert.equal(
        sourceStatic.length,
        LOCALES.length * SOURCE_PLATFORMS.length
      );

      // Cross-locale item parity on topic hubs
      const enChrome = await getTopicHubPayload("en", "chrome-extension");
      const zhChrome = await getTopicHubPayload("zh", "chrome-extension");
      const jaChrome = await getTopicHubPayload("ja", "chrome-extension");
      assert.ok(enChrome.items.length >= 1);
      assert.deepEqual(
        enChrome.items.map((i) => i.id),
        zhChrome.items.map((i) => i.id)
      );
      assert.deepEqual(
        enChrome.items.map((i) => i.id),
        jaChrome.items.map((i) => i.id)
      );

      // Cross-day aggregation on Reddit source hub (combines 2026-11-23 and 2026-11-22 items)
      const redditHub = await getSourceHubPayload("en", "reddit");
      const distinctDates = new Set(redditHub.items.map((i) => i.dateKey));
      assert.ok(
        distinctDates.size >= 2,
        "Source hub must aggregate signals across multiple archive dates"
      );

      // Active topic metadata: index=true + symmetric hreflang
      const topicMeta = await generateTopicMetadata({
        params: Promise.resolve({ locale: "en", tag: "chrome-extension" }),
      });
      assert.equal(
        topicMeta.alternates?.canonical,
        "https://radar.aibuildon.com/en/topic/chrome-extension"
      );
      assert.deepEqual(topicMeta.robots, { index: true, follow: true });
      const topicLangs = topicMeta.alternates?.languages as Record<
        string,
        string
      >;
      assert.equal(
        topicLangs["zh-CN"],
        "https://radar.aibuildon.com/zh/topic/chrome-extension"
      );
      assert.equal(
        topicLangs["x-default"],
        "https://radar.aibuildon.com/en/topic/chrome-extension"
      );

      // Empty source hub in local-fallback (acquire): index=false (noindex) to prevent soft-404 / thin content
      const emptySourceMeta = await generateSourceMetadata({
        params: Promise.resolve({ locale: "en", platform: "acquire" }),
      });
      assert.deepEqual(emptySourceMeta.robots, { index: false, follow: true });

      // Invalid topic/source returns {}
      assert.deepEqual(
        await generateTopicMetadata({
          params: Promise.resolve({ locale: "en", tag: "non-existent-tag" }),
        }),
        {}
      );
      assert.deepEqual(
        await generateSourceMetadata({
          params: Promise.resolve({
            locale: "en",
            platform: "myspace",
          }),
        }),
        {}
      );

      // Hub JSON-LD includes BreadcrumbList + CollectionPage and sanitizes javascript: URLs
      const hubLd = buildHubJsonLd({
        locale: "zh",
        kind: "topic",
        slug: "chrome-extension",
        seoTitle: zhChrome.hub!.seoTitle,
        h1: zhChrome.hub!.h1,
        description: zhChrome.hub!.description,
        breadcrumbLabel: zhChrome.hub!.label,
        latestDateKey: zhChrome.hub!.latestDateKey,
        items: [
          {
            ...zhChrome.items[0],
            sourceUrl: "javascript:alert(1)",
          },
        ],
      });
      assert.equal(hubLd["@graph"].length, 3);
      assert.equal(hubLd["@graph"][1]["@type"], "BreadcrumbList");
      assert.equal(hubLd["@graph"][2]["@type"], "CollectionPage");
      assert.equal(JSON.stringify(hubLd).includes("javascript:"), false);
    });
  });
});
