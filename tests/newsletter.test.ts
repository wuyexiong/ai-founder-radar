import "./helpers/env-guard";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, it } from "node:test";
import { POST as subscribePost } from "../src/app/api/newsletter/subscribe/route";
import {
  GET as unsubscribeGet,
  POST as unsubscribePost,
} from "../src/app/api/newsletter/unsubscribe/route";
import { setDbForTests } from "../src/db";
import { LOCALES } from "../src/i18n/config";
import {
  buildDigestContent,
  sendDailyNewsletterDigests,
  sendWelcomeEmail,
} from "../src/lib/newsletter";
import type { SignalItem } from "../src/types/signal";
import {
  installFetchMock,
  jsonResponse,
  resetOfflineTestGuard,
  textResponse,
  withEnv,
} from "./helpers/env-guard";
import { createMockNewsletterDb, type SubscriberRow } from "./helpers/mock-db";

const VALID_TOKEN_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const VALID_TOKEN_B = "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a59687";

function makeSampleSignal(overrides: Partial<SignalItem> = {}): SignalItem {
  return {
    id: "sig-xss-test",
    dateKey: "2026-11-24",
    title: 'Alert <script>alert("xss")</script> SaaS',
    titleZh: '恶意脚本 <script>alert("zh")</script> 营收软件',
    titleOrig: 'Malicious <script>alert("orig")</script> SaaS',
    category: "revenue",
    whatItIs: "Solves <img src=x onerror=alert(1)> billing pain.",
    businessSignal: "$12k MRR & 90% margin.",
    indieTakeaway: "Niche B2B wedge.",
    metricsBadge: "$12k MRR",
    metricType: "revenue",
    tags: ["#SaaS"],
    score: 9.2,
    isTopPick: true,
    sourcePlatform: "trustmrr",
    sourceSublabel: "TrustMRR 实名榜",
    sourceUrl: "javascript:alert(1)",
    publishedAt: "2026-11-24T01:00:00.000Z",
    translations: {
      en: {
        title: 'Safe? <script>alert("en")</script> $12k MRR',
        whatItIs: "Automated invoicing.",
        businessSignal: "Verified $12k MRR.",
        indieTakeaway: "Target agencies.",
        metricsBadge: "$12k MRR",
        tags: ["#SaaS"],
      },
      ja: {
        title: 'テスト <script>alert("ja")</script> 月商$12k',
        whatItIs: "請求書自動化ツール。",
        businessSignal: "MRR $12k達成。",
        indieTakeaway: "代理店向け。",
        metricsBadge: "$12k MRR",
        tags: ["#個人開発"],
      },
    },
    ...overrides,
  };
}

describe("Newsletter Rendering, Broadcast Idempotency & API Routes", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    setDbForTests(null);
  });

  afterEach(() => {
    setDbForTests(null);
    resetOfflineTestGuard();
  });

  describe("1. Email Rendering, XSS Escaping & RFC 8058 Headers", () => {
    it("renders welcome email across all 4 locales with RFC 8058 List-Unsubscribe headers", async () => {
      await withEnv({ RESEND_API_KEY: "re_test_mock_welcome" }, async () => {
        for (const locale of LOCALES) {
          const mock = installFetchMock((url) => {
            assert.equal(url, "https://api.resend.com/emails");
            return jsonResponse({ id: `email_${locale}` }, 200);
          });

          try {
            const ok = await sendWelcomeEmail({
              email: `user-${locale}@example.com`,
              locale,
              unsubscribeToken: VALID_TOKEN_A,
            });
            assert.equal(ok, true);
            assert.equal(mock.calls.length, 1);

            const sentBody = JSON.parse(mock.calls[0].bodyText ?? "{}") as {
              to: string[];
              subject: string;
              html: string;
              headers: Record<string, string>;
            };
            assert.deepEqual(sentBody.to, [`user-${locale}@example.com`]);
            assert.ok(sentBody.subject.includes("AI Founder Radar"));
            assert.ok(sentBody.html.includes(`/${locale}`));
            assert.equal(
              sentBody.headers["List-Unsubscribe"],
              `<https://radar.aibuildon.com/api/newsletter/unsubscribe?token=${VALID_TOKEN_A}>`
            );
            assert.equal(
              sentBody.headers["List-Unsubscribe-Post"],
              "List-Unsubscribe=One-Click"
            );
          } finally {
            mock.restore();
          }
        }
      });
    });

    it("escapes <script> XSS, sanitizes javascript: URLs, and never leaks Chinese summary into EN/JA when summaryTranslations is missing", () => {
      const xssItem = makeSampleSignal();

      for (const locale of LOCALES) {
        const digest = buildDigestContent({
          locale,
          dateKey: "2026-11-24",
          totalCount: 12,
          topItems: [xssItem],
          summaryZh: "今日精选 12 条海外软件商业信号。",
          summaryTranslations: undefined,
          unsubscribeToken: VALID_TOKEN_A,
        });

        // HTML must never contain unescaped <script> or onerror attribute or javascript: href
        assert.equal(digest.html.includes("<script>"), false);
        assert.ok(digest.html.includes("&lt;script&gt;"));
        assert.equal(digest.html.includes("javascript:alert"), false);
        assert.ok(
          digest.html.includes(
            `https://radar.aibuildon.com/${locale}/daily/2026-11-24`
          )
        );

        if (locale === "en") {
          // Missing summaryTranslations falls back to English default, not Chinese summaryZh
          assert.ok(
            digest.html.includes("Curated 12 verified Micro-SaaS launches")
          );
          assert.equal(digest.html.includes("今日精选"), false);
        }
        if (locale === "ja") {
          assert.ok(
            digest.html.includes("厳選した 12 件をお届けします")
          );
          assert.equal(digest.html.includes("今日精选"), false);
        }
        if (locale === "zh-TW") {
          // OpenCC converts 软件 -> 軟體
          assert.ok(digest.html.includes("軟體"));
        }
      }
    });
  });

  describe("2. Daily Digest Broadcast Idempotency (sendDailyNewsletterDigests)", () => {
    it("skips already-sent & unsubscribed users, updates lastSentDate on 200, and preserves null lastSentDate when Resend fails", async () => {
      const now = new Date("2026-11-24T00:00:00.000Z");
      const initialSubscribers: SubscriberRow[] = [
        {
          id: "sub_already_sent",
          email: "done@example.com",
          locale: "en",
          status: "active",
          unsubscribeToken: VALID_TOKEN_A,
          lastSentDate: "2026-11-24",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sub_unsubscribed",
          email: "unsub@example.com",
          locale: "zh",
          status: "unsubscribed",
          unsubscribeToken: "11112222333344445555666677778888",
          lastSentDate: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sub_ok_send",
          email: "deliver-ok@example.com",
          locale: "ja",
          status: "active",
          unsubscribeToken: VALID_TOKEN_B,
          lastSentDate: "2026-11-23",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sub_fail_send",
          email: "resend-500@example.com",
          locale: "en",
          status: "active",
          unsubscribeToken: "99998888777766665555444433332222",
          lastSentDate: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const mockDb = createMockNewsletterDb(initialSubscribers);

      await withEnv({ RESEND_API_KEY: "re_test_digest_key" }, async () => {
        const mock = installFetchMock((_url, _init, call) => {
          const payload = JSON.parse(call.bodyText ?? "{}") as { to: string[] };
          if (payload.to[0] === "resend-500@example.com") {
            return textResponse("Upstream gateway error", 502);
          }
          return jsonResponse({ id: "msg_ok_1" }, 200);
        });

        try {
          await sendDailyNewsletterDigests({
            db: mockDb as unknown as Parameters<
              typeof sendDailyNewsletterDigests
            >[0]["db"],
            dateKey: "2026-11-24",
            allItems: [makeSampleSignal()],
            summaryNote: "今日精选商业信号。",
            rateLimitDelayMs: 0,
          });

          // Only the 2 pending active subscribers were attempted
          assert.equal(mock.calls.length, 2);
          const recipients = mock.calls.map(
            (c) => (JSON.parse(c.bodyText ?? "{}") as { to: string[] }).to[0]
          );
          assert.deepEqual(recipients, [
            "deliver-ok@example.com",
            "resend-500@example.com",
          ]);

          // Successful recipient marked as sent today
          const okRow = mockDb.rows.find((r) => r.id === "sub_ok_send")!;
          assert.equal(okRow.lastSentDate, "2026-11-24");

          // Failed recipient NOT marked as sent so next run retries
          const failRow = mockDb.rows.find((r) => r.id === "sub_fail_send")!;
          assert.equal(failRow.lastSentDate, null);
        } finally {
          mock.restore();
        }
      });
    });
  });

  describe("3. Subscribe API (POST /api/newsletter/subscribe)", () => {
    it("returns 400 INVALID_JSON on malformed JSON body", async () => {
      const res = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.1",
          },
          body: "{bad-json",
        })
      );
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { ok: false, code: "INVALID_JSON" });
    });

    it("returns 400 INVALID_EMAIL on malformed email or CRLF header injection", async () => {
      for (const badEmail of [
        "not-an-email",
        "victim@example.com\r\nBcc:attacker@evil.com",
        "missing-tld@localhost",
      ]) {
        const res = await subscribePost(
          new NextRequest(
            "https://radar.aibuildon.com/api/newsletter/subscribe",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-forwarded-for": "203.0.113.2",
              },
              body: JSON.stringify({ email: badEmail, locale: "en" }),
            }
          )
        );
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), {
          ok: false,
          code: "INVALID_EMAIL",
        });
      }
    });

    it("silently returns 200 without writing to DB when honeypot website field is filled", async () => {
      const mockDb = createMockNewsletterDb();
      setDbForTests(mockDb);

      const res = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.3",
          },
          body: JSON.stringify({
            email: "bot@spammer.com",
            locale: "en",
            website: "https://spam-link.biz",
          }),
        })
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, status: "subscribed" });
      assert.equal(mockDb.rows.length, 0);
    });

    it("returns 503 DB_NOT_CONFIGURED when database is absent", async () => {
      const res = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.4",
          },
          body: JSON.stringify({ email: "solo@founder.io", locale: "zh" }),
        })
      );
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), {
        ok: false,
        code: "DB_NOT_CONFIGURED",
      });
    });

    it("enforces IP rate limit: 7th attempt from same IP returns 429 RATE_LIMITED", async () => {
      const ip = "203.0.113.88";
      for (let i = 0; i < 6; i++) {
        const r = await subscribePost(
          new NextRequest(
            "https://radar.aibuildon.com/api/newsletter/subscribe",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-forwarded-for": ip,
              },
              body: JSON.stringify({ email: "bad", locale: "en" }),
            }
          )
        );
        assert.equal(r.status, 400);
      }

      const seventh = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({ email: "founder@example.com", locale: "en" }),
        })
      );
      assert.equal(seventh.status, 429);
      assert.deepEqual(await seventh.json(), {
        ok: false,
        code: "RATE_LIMITED",
      });
    });

    it("Mock DB lifecycle: inserts new subscriber, returns already_subscribed + syncs locale on duplicate, and rotates token on re-subscribe", async () => {
      const mockDb = createMockNewsletterDb([
        {
          id: "sub_former",
          email: "returning@founder.dev",
          locale: "en",
          status: "unsubscribed",
          unsubscribeToken: VALID_TOKEN_A,
          lastSentDate: "2026-11-20",
          createdAt: new Date("2026-11-01T00:00:00Z"),
          updatedAt: new Date("2026-11-20T00:00:00Z"),
        },
      ]);
      setDbForTests(mockDb);

      await withEnv({ RESEND_API_KEY: "re_test_sub_flow" }, async () => {
        const mock = installFetchMock(() => jsonResponse({ id: "welcome_1" }));
        try {
          // 1. Brand-new subscription
          const resNew = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-forwarded-for": "203.0.113.50",
                },
                body: JSON.stringify({
                  email: "  NewFounder@Indie.IO ",
                  locale: "zh",
                }),
              }
            )
          );
          assert.equal(resNew.status, 200);
          assert.deepEqual(await resNew.json(), {
            ok: true,
            status: "subscribed",
          });
          const inserted = mockDb.rows.find(
            (r) => r.email === "newfounder@indie.io"
          );
          assert.ok(inserted);
          assert.equal(inserted.status, "active");
          assert.equal(inserted.locale, "zh");
          assert.equal(mock.calls.length, 1);

          // 2. Duplicate active subscription with updated locale (zh -> ja)
          const resDup = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-forwarded-for": "203.0.113.51",
                },
                body: JSON.stringify({
                  email: "newfounder@indie.io",
                  locale: "ja",
                }),
              }
            )
          );
          assert.equal(resDup.status, 200);
          assert.deepEqual(await resDup.json(), {
            ok: true,
            status: "already_subscribed",
          });
          assert.equal(
            mockDb.rows.find((r) => r.email === "newfounder@indie.io")?.locale,
            "ja"
          );
          // No redundant welcome email sent on already_subscribed
          assert.equal(mock.calls.length, 1);

          // 3. Previously unsubscribed user re-subscribes -> reactivates & rotates token
          const resRe = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-forwarded-for": "203.0.113.52",
                },
                body: JSON.stringify({
                  email: "returning@founder.dev",
                  locale: "zh-TW",
                }),
              }
            )
          );
          assert.equal(resRe.status, 200);
          assert.deepEqual(await resRe.json(), {
            ok: true,
            status: "subscribed",
          });
          const reactivated = mockDb.rows.find(
            (r) => r.email === "returning@founder.dev"
          )!;
          assert.equal(reactivated.status, "active");
          assert.equal(reactivated.locale, "zh-TW");
          assert.notEqual(reactivated.unsubscribeToken, VALID_TOKEN_A);
          assert.equal(reactivated.unsubscribeToken.length, 48);
          assert.equal(mock.calls.length, 2);
        } finally {
          mock.restore();
        }
      });
    });
  });

  describe("4. Unsubscribe API (GET & POST /api/newsletter/unsubscribe)", () => {
    it("handles invalid tokens gracefully, updates status on valid GET/POST tokens, and returns 503 on DB error or missing DB", async () => {
      // 1. Invalid token -> 200 without needing DB
      const badTokenGet = await unsubscribeGet(
        new NextRequest(
          "https://radar.aibuildon.com/api/newsletter/unsubscribe?token=not-hex"
        )
      );
      assert.equal(badTokenGet.status, 200);

      // 2. Valid token with no DB -> 503 for both GET and POST
      const noDbPost = await unsubscribePost(
        new NextRequest(
          `https://radar.aibuildon.com/api/newsletter/unsubscribe?token=${VALID_TOKEN_A}`,
          { method: "POST" }
        )
      );
      assert.equal(noDbPost.status, 503);
      assert.deepEqual(await noDbPost.json(), { ok: false });

      // 3. Valid token with Mock DB -> GET unsubscribes & renders localized page; POST unsubscribes second user
      const now = new Date();
      const mockDb = createMockNewsletterDb([
        {
          id: "u_zh",
          email: "zh@founder.cn",
          locale: "zh",
          status: "active",
          unsubscribeToken: VALID_TOKEN_A,
          lastSentDate: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "u_ja",
          email: "ja@founder.jp",
          locale: "ja",
          status: "active",
          unsubscribeToken: VALID_TOKEN_B,
          lastSentDate: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      setDbForTests(mockDb);

      const okGet = await unsubscribeGet(
        new NextRequest(
          `https://radar.aibuildon.com/api/newsletter/unsubscribe?token=${VALID_TOKEN_A}`
        )
      );
      assert.equal(okGet.status, 200);
      const html = await okGet.text();
      assert.ok(html.includes("已成功退订早报"));
      assert.equal(
        mockDb.rows.find((r) => r.id === "u_zh")?.status,
        "unsubscribed"
      );

      const okPost = await unsubscribePost(
        new NextRequest(
          `https://radar.aibuildon.com/api/newsletter/unsubscribe?token=${VALID_TOKEN_B}`,
          { method: "POST" }
        )
      );
      assert.equal(okPost.status, 200);
      assert.deepEqual(await okPost.json(), { ok: true });
      assert.equal(
        mockDb.rows.find((r) => r.id === "u_ja")?.status,
        "unsubscribed"
      );

      // 4. DB exception -> returns 503 Temporary Error
      setDbForTests(createMockNewsletterDb([], { throwOnQuery: true }));
      const errGet = await unsubscribeGet(
        new NextRequest(
          `https://radar.aibuildon.com/api/newsletter/unsubscribe?token=${VALID_TOKEN_A}`
        )
      );
      assert.equal(errGet.status, 503);
      assert.ok((await errGet.text()).includes("Temporary Error"));
    });
  });
});
