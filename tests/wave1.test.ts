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
  collectRevalidatePaths,
  isAuthorizedRevalidateToken,
} from "../src/lib/revalidate";
import { middleware } from "../src/middleware";
import {
  detectPreferredLocale,
  getSiteUrl,
  isPlausibleArchiveDate,
  LOCALES,
} from "../src/i18n/config";
import { getDictionary } from "../src/i18n/dictionaries";
import {
  distillRawItem,
  extractJsonGeneric,
  translateExistingSignalRow,
} from "../src/lib/ai-distiller";
import { fetchViaJinaMarkdown } from "../src/lib/collectors/jina";
import { isSafePublicHttpUrl } from "../src/lib/collectors/sources";
import { localizeSourceSublabel } from "../src/lib/localize-sublabel";
import { normalizeAndValidateEmail } from "../src/lib/newsletter";
import { getAllAvailableDates, getRadarPayload } from "../src/lib/signals-repo";
import { formatDeterministicClock, toSafeHttpUrl } from "../src/lib/utils";
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

test("local-fallback dataset & all 4 locale dictionaries are internally consistent", async () => {
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const dates = await getAllAvailableDates();
    assert.ok(dates.length >= 2);

    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      assert.ok(dict.tabs.ai_trend.length > 0);
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

test("daily-radar GitHub Actions workflow uses odd-minute dual cron with concurrency & idempotent skip", () => {
  const yml = readFileSync(".github/workflows/daily-radar.yml", "utf8");
  assert.ok(yml.includes('cron: "23 23 * * *"'), "primary odd-minute cron present");
  assert.ok(yml.includes('cron: "17 0 * * *"'), "backup odd-minute cron present");
  assert.ok(yml.includes("workflow_dispatch:"), "manual trigger enabled");
  assert.ok(yml.includes("group: daily-radar-sync"), "concurrency group configured");
  assert.ok(
    yml.includes("SKIP_IF_TODAY_SYNCED:"),
    "idempotent backup skip env configured"
  );
  assert.ok(
    yml.includes("REVALIDATE_SECRET:"),
    "on-demand revalidation secret passed in workflow"
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
