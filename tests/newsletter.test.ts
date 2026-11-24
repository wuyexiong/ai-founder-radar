import "./helpers/env-guard";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, it } from "node:test";
import { GET as confirmGet } from "../src/app/api/newsletter/confirm/route";
import { POST as subscribePost } from "../src/app/api/newsletter/subscribe/route";
import {
  GET as unsubscribeGet,
  POST as unsubscribePost,
} from "../src/app/api/newsletter/unsubscribe/route";
import { setDbForTests } from "../src/db";
import { LOCALES } from "../src/i18n/config";
import {
  buildDigestContent,
  CONFIRM_RESEND_COOLDOWN_MS,
  CONFIRM_TOKEN_TTL_MS,
  extractTrustedClientIp,
  hashClientIp,
  resetSubscribeRateLimitForTests,
  sendConfirmationEmail,
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
import {
  createMockNewsletterDb,
  type SeedSubscriberInput,
} from "./helpers/mock-db";

const VALID_TOKEN_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const VALID_TOKEN_B = "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a59687";
const VALID_CONFIRM_TOKEN = "c0ffee1234567890abcdef1234567890abcdef1234567890";
const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;

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

describe("Newsletter Double Opt-in, DB Rate Limiting, Batch Broadcast & API Routes", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    resetSubscribeRateLimitForTests();
    setDbForTests(null);
  });

  afterEach(() => {
    setDbForTests(null);
    resetSubscribeRateLimitForTests();
    resetOfflineTestGuard();
  });

  describe("1. Confirmation, Welcome & Digest Email Rendering + Security", () => {
    it("renders 4-locale Double Opt-in confirmation emails with confirm URL, RFC 8058 headers, and zero EN CJK leaks", async () => {
      await withEnv({ RESEND_API_KEY: "re_test_mock_confirm" }, async () => {
        for (const locale of LOCALES) {
          const mock = installFetchMock((url) => {
            assert.equal(url, "https://api.resend.com/emails");
            return jsonResponse({ id: `confirm_${locale}` }, 200);
          });

          try {
            const ok = await sendConfirmationEmail({
              email: `founder-${locale}@example.com`,
              locale,
              confirmToken: VALID_CONFIRM_TOKEN,
              unsubscribeToken: VALID_TOKEN_A,
            });
            assert.equal(ok, true);
            assert.equal(mock.calls.length, 1);

            const sentBody = JSON.parse(mock.calls[0].bodyText ?? "{}") as {
              to: string[];
              subject: string;
              html: string;
              text: string;
              headers: Record<string, string>;
            };
            assert.deepEqual(sentBody.to, [`founder-${locale}@example.com`]);
            assert.ok(sentBody.subject.includes("AI Founder Radar"));
            assert.ok(
              sentBody.html.includes(
                `https://radar.aibuildon.com/api/newsletter/confirm?token=${VALID_CONFIRM_TOKEN}`
              )
            );
            assert.equal(
              sentBody.headers["List-Unsubscribe"],
              `<https://radar.aibuildon.com/api/newsletter/unsubscribe?token=${VALID_TOKEN_A}>`
            );
            assert.equal(
              sentBody.headers["List-Unsubscribe-Post"],
              "List-Unsubscribe=One-Click"
            );
            if (locale === "en") {
              assert.equal(CJK_RE.test(sentBody.subject), false);
              assert.equal(CJK_RE.test(sentBody.html), false);
            }
          } finally {
            mock.restore();
          }
        }
      });
    });

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

    it("escapes <script> XSS, sanitizes javascript: URLs, appends digest UTM, and never leaks CJK into EN/JA", () => {
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

        assert.equal(digest.html.includes("<script>"), false);
        assert.ok(digest.html.includes("&lt;script&gt;"));
        assert.equal(digest.html.includes("javascript:alert"), false);
        assert.ok(
          digest.html.includes(
            `https://radar.aibuildon.com/${locale}/daily/2026-11-24?utm_source=daily_digest&amp;utm_medium=email`
          )
        );

        if (locale === "en") {
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
          assert.ok(digest.html.includes("軟體"));
        }
      }
    });

    it("prioritizes x-vercel-forwarded-for over spoofed x-forwarded-for and hashes IPs without storing PII", () => {
      const headers = new Headers({
        "x-forwarded-for": "1.1.1.1, 2.2.2.2",
        "x-vercel-forwarded-for": "198.51.100.77",
      });
      const ip = extractTrustedClientIp(headers);
      assert.equal(ip, "198.51.100.77");

      const hashed = hashClientIp(ip);
      assert.ok(hashed && /^[a-f0-9]{32}$/.test(hashed));
      assert.equal(hashed.includes("198.51.100.77"), false);
      assert.equal(hashClientIp("unknown"), null);
    });
  });

  describe("2. Resend Batch API Broadcast & Strict Active-Only Filtering (sendDailyNewsletterDigests)", () => {
    it("skips pending, unsubscribed & already-sent rows, sends via /emails/batch in chunks, and updates lastSentDate per successful batch", async () => {
      const now = new Date("2026-11-24T00:00:00.000Z");
      const initialSubscribers: SeedSubscriberInput[] = [
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
          id: "sub_pending_unconfirmed",
          email: "unconfirmed@example.com",
          locale: "zh",
          status: "pending",
          unsubscribeToken: "22223333444455556666777788889999",
          confirmToken: VALID_CONFIRM_TOKEN,
          confirmSentAt: now,
          lastSentDate: null,
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
          id: "sub_batch1_a",
          email: "batch1-a@example.com",
          locale: "ja",
          status: "active",
          unsubscribeToken: VALID_TOKEN_B,
          lastSentDate: "2026-11-23",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sub_batch1_b",
          email: "batch1-b@example.com",
          locale: "zh",
          status: "active",
          unsubscribeToken: "33334444555566667777888899990000",
          lastSentDate: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sub_batch2_fail",
          email: "batch2-fail@example.com",
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
        const mock = installFetchMock((url, _init, call) => {
          assert.equal(url, "https://api.resend.com/emails/batch");
          const batch = JSON.parse(call.bodyText ?? "[]") as Array<{
            to: string[];
            headers: Record<string, string>;
          }>;
          if (batch.some((item) => item.to[0] === "batch2-fail@example.com")) {
            return textResponse("Upstream gateway error", 502);
          }
          return jsonResponse(
            { data: batch.map((_, idx) => ({ id: `batch_msg_${idx}` })) },
            200
          );
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
            batchSize: 2,
          });

          // 3 eligible active subscribers split into 2 batch requests (chunk 1: 2 emails, chunk 2: 1 email)
          assert.equal(mock.calls.length, 2);
          const firstBatch = JSON.parse(
            mock.calls[0].bodyText ?? "[]"
          ) as Array<{ to: string[]; headers: Record<string, string> }>;
          const secondBatch = JSON.parse(
            mock.calls[1].bodyText ?? "[]"
          ) as Array<{ to: string[] }>;

          assert.deepEqual(
            firstBatch.map((m) => m.to[0]),
            ["batch1-a@example.com", "batch1-b@example.com"]
          );
          assert.equal(
            firstBatch[0].headers["List-Unsubscribe-Post"],
            "List-Unsubscribe=One-Click"
          );
          assert.deepEqual(
            secondBatch.map((m) => m.to[0]),
            ["batch2-fail@example.com"]
          );

          // Chunk 1 recipients marked as sent today via batch inArray update
          assert.equal(
            mockDb.rows.find((r) => r.id === "sub_batch1_a")?.lastSentDate,
            "2026-11-24"
          );
          assert.equal(
            mockDb.rows.find((r) => r.id === "sub_batch1_b")?.lastSentDate,
            "2026-11-24"
          );

          // Pending unconfirmed & failed chunk 2 remain untouched
          assert.equal(
            mockDb.rows.find((r) => r.id === "sub_pending_unconfirmed")
              ?.lastSentDate,
            null
          );
          assert.equal(
            mockDb.rows.find((r) => r.id === "sub_batch2_fail")?.lastSentDate,
            null
          );
        } finally {
          mock.restore();
        }
      });
    });
  });

  describe("3. Subscribe & Confirm APIs (Double Opt-in + Persistent DB Rate Limit + Cooldown)", () => {
    it("validates JSON, email & CRLF injection, honeypot trap, and missing DB", async () => {
      const badJsonRes = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": "203.0.113.1",
          },
          body: "{bad-json",
        })
      );
      assert.equal(badJsonRes.status, 400);
      assert.deepEqual(await badJsonRes.json(), {
        ok: false,
        code: "INVALID_JSON",
      });

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
                "x-vercel-forwarded-for": "203.0.113.2",
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

      // Honeypot returns 200 confirmation_required with 0 DB writes
      const mockDb = createMockNewsletterDb();
      setDbForTests(mockDb);
      const hpRes = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": "203.0.113.3",
          },
          body: JSON.stringify({
            email: "bot@spammer.com",
            locale: "en",
            website: "https://spam-link.biz",
          }),
        })
      );
      assert.equal(hpRes.status, 200);
      assert.deepEqual(await hpRes.json(), {
        ok: true,
        status: "confirmation_required",
      });
      assert.equal(mockDb.rows.length, 0);

      // Missing DB -> 503
      setDbForTests(null);
      const noDbRes = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": "203.0.113.4",
          },
          body: JSON.stringify({ email: "solo@founder.io", locale: "zh" }),
        })
      );
      assert.equal(noDbRes.status, 503);
      assert.deepEqual(await noDbRes.json(), {
        ok: false,
        code: "DB_NOT_CONFIGURED",
      });
    });

    it("enforces both in-memory rate limit AND cross-instance DB sliding-window IP rate limit", async () => {
      // A. In-memory rate limit catches malformed floods before hitting DB
      const floodIp = "203.0.113.88";
      for (let i = 0; i < 6; i++) {
        const r = await subscribePost(
          new NextRequest(
            "https://radar.aibuildon.com/api/newsletter/subscribe",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-vercel-forwarded-for": floodIp,
              },
              body: JSON.stringify({ email: "bad", locale: "en" }),
            }
          )
        );
        assert.equal(r.status, 400);
      }
      const seventhMem = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": floodIp,
          },
          body: JSON.stringify({ email: "founder@example.com", locale: "en" }),
        })
      );
      assert.equal(seventhMem.status, 429);

      // B. Cross-instance DB rate limit: simulate 6 Serverless cold starts (clearing memory Map each time!)
      const mockDb = createMockNewsletterDb();
      setDbForTests(mockDb);
      const serverlessIp = "198.51.100.42";

      await withEnv({ RESEND_API_KEY: "re_test_db_rl" }, async () => {
        const mock = installFetchMock(() => jsonResponse({ id: "confirm_rl" }));
        try {
          for (let i = 0; i < 6; i++) {
            resetSubscribeRateLimitForTests();
            const res = await subscribePost(
              new NextRequest(
                "https://radar.aibuildon.com/api/newsletter/subscribe",
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    "x-vercel-forwarded-for": serverlessIp,
                  },
                  body: JSON.stringify({
                    email: `victim-${i}@example.com`,
                    locale: "en",
                  }),
                }
              )
            );
            assert.equal(res.status, 200);
          }

          // 7th attempt on a fresh cold-started Lambda (memory Map cleared) MUST still be blocked by PostgreSQL!
          resetSubscribeRateLimitForTests();
          const seventhDb = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-vercel-forwarded-for": serverlessIp,
                },
                body: JSON.stringify({
                  email: "victim-7@example.com",
                  locale: "en",
                }),
              }
            )
          );
          assert.equal(seventhDb.status, 429);
          assert.deepEqual(await seventhDb.json(), {
            ok: false,
            code: "RATE_LIMITED",
          });
          assert.equal(mock.calls.length, 6);
        } finally {
          mock.restore();
        }
      });
    });

    it("executes full Double Opt-in lifecycle: pending -> 15m anti-bombing cooldown -> confirm activation -> idempotent double-click -> active locale sync -> re-subscribe confirmation", async () => {
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

      await withEnv({ RESEND_API_KEY: "re_test_doi_flow" }, async () => {
        const mock = installFetchMock(() => jsonResponse({ id: "confirm_1" }));
        try {
          // 1. Brand-new subscription -> writes status='pending', sends confirm email, returns confirmation_required
          const resNew = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-vercel-forwarded-for": "203.0.113.50",
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
            status: "confirmation_required",
          });

          const inserted = mockDb.rows.find(
            (r) => r.email === "newfounder@indie.io"
          )!;
          assert.ok(inserted);
          assert.equal(inserted.status, "pending");
          assert.equal(inserted.locale, "zh");
          assert.ok(inserted.confirmToken && inserted.confirmToken.length === 48);
          assert.ok(inserted.confirmSentAt instanceof Date);
          assert.equal(inserted.confirmedAt, null);
          assert.equal(mock.calls.length, 1);

          // 2. Immediate repeat submit within 15m cooldown -> 200 confirmation_required with ZERO extra Resend calls
          const firstConfirmToken = inserted.confirmToken!;
          const resCooldown = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-vercel-forwarded-for": "203.0.113.51",
                },
                body: JSON.stringify({
                  email: "newfounder@indie.io",
                  locale: "zh",
                }),
              }
            )
          );
          assert.equal(resCooldown.status, 200);
          assert.equal(mock.calls.length, 1);
          assert.equal(inserted.confirmToken, firstConfirmToken);

          // 3. After >15m cooldown -> rotates confirmToken and sends fresh confirmation email
          inserted.confirmSentAt = new Date(
            Date.now() - CONFIRM_RESEND_COOLDOWN_MS - 5_000
          );
          const resAfterCooldown = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-vercel-forwarded-for": "203.0.113.52",
                },
                body: JSON.stringify({
                  email: "newfounder@indie.io",
                  locale: "zh",
                }),
              }
            )
          );
          assert.equal(resAfterCooldown.status, 200);
          assert.equal(mock.calls.length, 2);
          assert.notEqual(inserted.confirmToken, firstConfirmToken);

          // 4. User clicks confirmation link -> activates status='active' & renders localized HTML with noindex
          const latestConfirmToken = inserted.confirmToken!;
          const confirmRes1 = await confirmGet(
            new NextRequest(
              `https://radar.aibuildon.com/api/newsletter/confirm?token=${latestConfirmToken}`
            )
          );
          assert.equal(confirmRes1.status, 200);
          const confirmHtml = await confirmRes1.text();
          assert.ok(confirmHtml.includes("早报订阅已确认激活"));
          assert.ok(confirmHtml.includes('content="noindex, nofollow"'));
          const confirmedRow = mockDb.rows.find(
            (r) => r.email === "newfounder@indie.io"
          )!;
          assert.equal(confirmedRow.status, "active");
          assert.ok(confirmedRow.confirmedAt instanceof Date);

          // 5. Email scanner / user double-clicks same confirm link -> idempotent 200 OK
          const confirmRes2 = await confirmGet(
            new NextRequest(
              `https://radar.aibuildon.com/api/newsletter/confirm?token=${latestConfirmToken}`
            )
          );
          assert.equal(confirmRes2.status, 200);

          // 6. Active subscriber submits again with new locale (zh -> ja) -> stays active, updates locale, 0 emails sent
          const resActiveDup = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-vercel-forwarded-for": "203.0.113.53",
                },
                body: JSON.stringify({
                  email: "newfounder@indie.io",
                  locale: "ja",
                }),
              }
            )
          );
          assert.equal(resActiveDup.status, 200);
          assert.deepEqual(await resActiveDup.json(), {
            ok: true,
            status: "already_subscribed",
          });
          assert.equal(inserted.status, "active");
          assert.equal(inserted.locale, "ja");
          assert.equal(mock.calls.length, 2);

          // 7. Previously unsubscribed user re-subscribes -> requires Double Opt-in confirmation & rotates unsub token
          const resRe = await subscribePost(
            new NextRequest(
              "https://radar.aibuildon.com/api/newsletter/subscribe",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-vercel-forwarded-for": "203.0.113.54",
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
            status: "confirmation_required",
          });
          const returning = mockDb.rows.find(
            (r) => r.email === "returning@founder.dev"
          )!;
          assert.equal(returning.status, "pending");
          assert.equal(returning.locale, "zh-TW");
          assert.notEqual(returning.unsubscribeToken, VALID_TOKEN_A);
          assert.equal(mock.calls.length, 3);
        } finally {
          mock.restore();
        }
      });
    });

    it("rejects invalid or expired (>48h) confirmation tokens and stores pending_mailer safely when RESEND_API_KEY is absent", async () => {
      const expiredSentAt = new Date(
        Date.now() - CONFIRM_TOKEN_TTL_MS - 60_000
      );
      const mockDb = createMockNewsletterDb([
        {
          id: "sub_expired",
          email: "expired@founder.io",
          locale: "en",
          status: "pending",
          unsubscribeToken: VALID_TOKEN_A,
          confirmToken: VALID_CONFIRM_TOKEN,
          confirmSentAt: expiredSentAt,
          lastSentDate: null,
          createdAt: expiredSentAt,
          updatedAt: expiredSentAt,
        },
      ]);
      setDbForTests(mockDb);

      // Invalid hex token -> 400
      const badTokenRes = await confirmGet(
        new NextRequest(
          "https://radar.aibuildon.com/api/newsletter/confirm?token=bad-token",
          { headers: { "accept-language": "en-US,en;q=0.9" } }
        )
      );
      assert.equal(badTokenRes.status, 400);
      assert.equal(CJK_RE.test(await badTokenRes.text()), false);

      // Expired >48h token -> 400 & remains pending
      const expiredRes = await confirmGet(
        new NextRequest(
          `https://radar.aibuildon.com/api/newsletter/confirm?token=${VALID_CONFIRM_TOKEN}`
        )
      );
      assert.equal(expiredRes.status, 400);
      assert.equal(
        mockDb.rows.find((r) => r.id === "sub_expired")?.status,
        "pending"
      );

      // Without RESEND_API_KEY -> saves as pending_mailer with 0 external HTTP calls
      const noMailerSub = await subscribePost(
        new NextRequest("https://radar.aibuildon.com/api/newsletter/subscribe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": "203.0.113.99",
          },
          body: JSON.stringify({ email: "offline@founder.dev", locale: "en" }),
        })
      );
      assert.equal(noMailerSub.status, 200);
      assert.deepEqual(await noMailerSub.json(), {
        ok: true,
        status: "pending_mailer",
      });
      assert.equal(
        mockDb.rows.find((r) => r.email === "offline@founder.dev")?.status,
        "pending"
      );
    });
  });

  describe("4. Unsubscribe API (GET & POST /api/newsletter/unsubscribe)", () => {
    it("unsubscribes active users, clears confirmToken so old confirm links cannot re-activate, and handles missing DB / errors", async () => {
      const badTokenGet = await unsubscribeGet(
        new NextRequest(
          "https://radar.aibuildon.com/api/newsletter/unsubscribe?token=not-hex"
        )
      );
      assert.equal(badTokenGet.status, 200);

      const noDbPost = await unsubscribePost(
        new NextRequest(
          `https://radar.aibuildon.com/api/newsletter/unsubscribe?token=${VALID_TOKEN_A}`,
          { method: "POST" }
        )
      );
      assert.equal(noDbPost.status, 503);
      assert.deepEqual(await noDbPost.json(), { ok: false });

      const now = new Date();
      const mockDb = createMockNewsletterDb([
        {
          id: "u_zh",
          email: "zh@founder.cn",
          locale: "zh",
          status: "active",
          unsubscribeToken: VALID_TOKEN_A,
          confirmToken: VALID_CONFIRM_TOKEN,
          confirmSentAt: now,
          confirmedAt: now,
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
      assert.ok((await okGet.text()).includes("已成功退订早报"));
      const unsubRow = mockDb.rows.find((r) => r.id === "u_zh")!;
      assert.equal(unsubRow.status, "unsubscribed");
      assert.equal(unsubRow.confirmToken, null);

      // Old confirmation link must no longer re-activate an unsubscribed user
      const staleConfirm = await confirmGet(
        new NextRequest(
          `https://radar.aibuildon.com/api/newsletter/confirm?token=${VALID_CONFIRM_TOKEN}`
        )
      );
      assert.equal(staleConfirm.status, 400);
      assert.equal(unsubRow.status, "unsubscribed");

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
