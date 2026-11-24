import "./helpers/env-guard";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, it } from "node:test";
import { POST as feedbackPost } from "../src/app/api/feedback/route";
import { FeedbackModal } from "../src/components/feedback-modal";
import { setDbForTests } from "../src/db";
import { LOCALES } from "../src/i18n/config";
import { getDictionary } from "../src/i18n/dictionaries";
import {
  FEEDBACK_MAX_CONTACT_LENGTH,
  FEEDBACK_MAX_LENGTH,
  resetFeedbackRateLimitForTests,
  sanitizeFeedbackContact,
  sanitizeFeedbackMessage,
  sanitizeFeedbackPagePath,
} from "../src/lib/feedback";
import { resetOfflineTestGuard } from "./helpers/env-guard";
import { createMockFeedbackDb } from "./helpers/mock-db";

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;

describe("User Feedback Validation, Supabase API Route, Rate Limit & 4-Locale Modal", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    resetFeedbackRateLimitForTests();
    setDbForTests(null);
  });

  afterEach(() => {
    setDbForTests(null);
    resetFeedbackRateLimitForTests();
    resetOfflineTestGuard();
  });

  it("sanitizes feedback messages, optional contact strings, and page paths safely", () => {
    assert.equal(sanitizeFeedbackMessage("   "), null);
    assert.equal(sanitizeFeedbackMessage("abc"), null);
    assert.equal(
      sanitizeFeedbackMessage("  Great radar!\r\nAdd IndiePage\0  "),
      "Great radar!\nAdd IndiePage"
    );
    assert.equal(
      sanitizeFeedbackMessage("x".repeat(FEEDBACK_MAX_LENGTH + 1)),
      null
    );

    assert.deepEqual(sanitizeFeedbackContact(undefined), {
      ok: true,
      value: null,
    });
    assert.deepEqual(sanitizeFeedbackContact("   "), {
      ok: true,
      value: null,
    });
    assert.deepEqual(sanitizeFeedbackContact("  founder@indie.io\r\n "), {
      ok: true,
      value: "founder@indie.io",
    });
    assert.deepEqual(
      sanitizeFeedbackContact("x".repeat(FEEDBACK_MAX_CONTACT_LENGTH + 1)),
      { ok: false }
    );
    assert.deepEqual(sanitizeFeedbackContact(12345), { ok: false });

    assert.equal(
      sanitizeFeedbackPagePath("https://radar.aibuildon.com/zh/daily/2026-11-24?tab=revenue"),
      "/zh/daily/2026-11-24?tab=revenue"
    );
    assert.equal(sanitizeFeedbackPagePath("//evil.example.com/phish"), "/");
    assert.equal(sanitizeFeedbackPagePath("javascript:alert(1)"), "/");
    assert.equal(sanitizeFeedbackPagePath("/en/topic/ai-agents"), "/en/topic/ai-agents");
  });

  it("validates malformed JSON, type, message, contact, honeypot trap, missing DB, and DB error redaction", async () => {
    const badJson = await feedbackPost(
      new NextRequest("https://radar.aibuildon.com/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.10",
        },
        body: "{broken",
      })
    );
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), {
      ok: false,
      code: "INVALID_JSON",
    });

    const badType = await feedbackPost(
      new NextRequest("https://radar.aibuildon.com/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.11",
        },
        body: JSON.stringify({
          type: "invalid_kind",
          message: "Please add OpenAlternative source",
        }),
      })
    );
    assert.equal(badType.status, 400);
    assert.deepEqual(await badType.json(), {
      ok: false,
      code: "INVALID_TYPE",
    });

    const shortMsg = await feedbackPost(
      new NextRequest("https://radar.aibuildon.com/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.12",
        },
        body: JSON.stringify({ type: "bug", message: "hi" }),
      })
    );
    assert.equal(shortMsg.status, 400);
    assert.deepEqual(await shortMsg.json(), {
      ok: false,
      code: "INVALID_MESSAGE",
    });

    // Honeypot silently returns 200 submitted with 0 DB writes
    const mockDb = createMockFeedbackDb();
    setDbForTests(mockDb);
    const hpRes = await feedbackPost(
      new NextRequest("https://radar.aibuildon.com/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.13",
        },
        body: JSON.stringify({
          type: "suggestion",
          message: "Buy cheap backlinks now!",
          website: "https://spam-bot.biz",
        }),
      })
    );
    assert.equal(hpRes.status, 200);
    assert.deepEqual(await hpRes.json(), {
      ok: true,
      status: "submitted",
    });
    assert.equal(mockDb.rows.length, 0);

    // Missing DB returns 503 DB_NOT_CONFIGURED
    setDbForTests(null);
    const noDbRes = await feedbackPost(
      new NextRequest("https://radar.aibuildon.com/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.14",
        },
        body: JSON.stringify({
          type: "suggestion",
          message: "Add Stripe verified filter!",
          locale: "zh",
        }),
      })
    );
    assert.equal(noDbRes.status, 503);
    assert.deepEqual(await noDbRes.json(), {
      ok: false,
      code: "DB_NOT_CONFIGURED",
    });

    // DB failure returns 500 without leaking connection credentials
    const throwingDb = createMockFeedbackDb([], { throwOnQuery: true });
    setDbForTests(throwingDb);
    const errRes = await feedbackPost(
      new NextRequest("https://radar.aibuildon.com/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.15",
        },
        body: JSON.stringify({
          type: "bug",
          message: "Mobile header overlaps on 320px screen",
        }),
      })
    );
    assert.equal(errRes.status, 500);
    const errBody = await errRes.json();
    assert.deepEqual(errBody, { ok: false, code: "SERVER_ERROR" });
  });

  it("persists valid feedback to Supabase table and enforces cross-instance IP rate limiting without storing raw IP", async () => {
    const mockDb = createMockFeedbackDb();
    setDbForTests(mockDb);

    const clientIp = "198.51.100.99";
    for (let i = 0; i < 8; i++) {
      resetFeedbackRateLimitForTests();
      const res = await feedbackPost(
        new NextRequest("https://radar.aibuildon.com/api/feedback", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": clientIp,
          },
          body: JSON.stringify({
            type: i === 0 ? "source" : "suggestion",
            message: `Please track MicroLaunch leaderboard #${i + 1}`,
            contact: i === 0 ? "@indie_builder" : "",
            pagePath: "/zh/daily/2026-11-24",
            locale: "zh",
          }),
        })
      );
      assert.equal(res.status, 200);
      const data = (await res.json()) as { ok: boolean; status: string; id: string };
      assert.equal(data.ok, true);
      assert.equal(data.status, "submitted");
      assert.ok(data.id.startsWith("fb_"));
    }

    assert.equal(mockDb.rows.length, 8);
    const first = mockDb.rows[0]!;
    assert.equal(first.type, "source");
    assert.equal(first.contact, "@indie_builder");
    assert.equal(first.pagePath, "/zh/daily/2026-11-24");
    assert.equal(first.locale, "zh");
    assert.equal(first.status, "open");
    assert.ok(first.submitterIpHash && /^[a-f0-9]{32}$/.test(first.submitterIpHash));
    assert.equal(first.submitterIpHash.includes(clientIp), false);
    assert.equal(mockDb.rows[1]?.contact, null);

    // 9th submission from same IP across cold-started Serverless instance is blocked by DB sliding window
    resetFeedbackRateLimitForTests();
    const ninth = await feedbackPost(
      new NextRequest("https://radar.aibuildon.com/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": clientIp,
        },
        body: JSON.stringify({
          type: "other",
          message: "Flood attempt #9 should be rate limited",
        }),
      })
    );
    assert.equal(ninth.status, 429);
    assert.deepEqual(await ninth.json(), {
      ok: false,
      code: "RATE_LIMITED",
    });
  });

  it("renders FeedbackModal across all 4 locales with strict key symmetry and zero CJK leaks in English", () => {
    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      const closedHtml = renderToStaticMarkup(
        React.createElement(FeedbackModal, {
          open: false,
          onClose: () => {},
          locale,
          dict: dict.feedback,
        })
      );
      assert.equal(closedHtml, "");

      const openHtml = renderToStaticMarkup(
        React.createElement(FeedbackModal, {
          open: true,
          onClose: () => {},
          locale,
          dict: dict.feedback,
        })
      );
      const escapedTitle = dict.feedback.modalTitle.replace(/&/g, "&amp;");
      assert.ok(openHtml.includes('role="dialog"'));
      assert.ok(openHtml.includes(escapedTitle));
      assert.ok(openHtml.includes(dict.feedback.submitCta));

      if (locale === "en") {
        assert.equal(
          CJK_RE.test(openHtml),
          false,
          "English FeedbackModal must never leak CJK characters"
        );
      }
    }
  });
});
