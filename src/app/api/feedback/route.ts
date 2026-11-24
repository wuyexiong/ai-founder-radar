import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabaseConfigured } from "@/db";
import { userFeedback } from "@/db/schema";
import { DEFAULT_LOCALE, isValidLocale, type Locale } from "@/i18n/config";
import {
  checkFeedbackMemoryRateLimit,
  FEEDBACK_RATE_WINDOW_MS,
  isValidFeedbackType,
  MAX_FEEDBACK_PER_WINDOW,
  sanitizeFeedbackContact,
  sanitizeFeedbackMessage,
  sanitizeFeedbackPagePath,
  type FeedbackType,
} from "@/lib/feedback";
import { extractTrustedClientIp, hashClientIp } from "@/lib/newsletter";

export async function POST(request: NextRequest) {
  const ip = extractTrustedClientIp(request.headers);
  const ipHash = hashClientIp(ip);

  if (!checkFeedbackMemoryRateLimit(ipHash ?? ip)) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const payload =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};

  // 蜜罐字段：正常人类用户不会填写隐藏的 website 输入框，静默伪造成功响应拦截刷库脚本
  if (typeof payload.website === "string" && payload.website.trim().length > 0) {
    return NextResponse.json({
      ok: true,
      status: "submitted",
    });
  }

  let feedbackType: FeedbackType = "suggestion";
  if (payload.type !== undefined) {
    if (!isValidFeedbackType(payload.type)) {
      return NextResponse.json(
        { ok: false, code: "INVALID_TYPE" },
        { status: 400 }
      );
    }
    feedbackType = payload.type;
  }

  const message = sanitizeFeedbackMessage(payload.message);
  if (!message) {
    return NextResponse.json(
      { ok: false, code: "INVALID_MESSAGE" },
      { status: 400 }
    );
  }

  const contactResult = sanitizeFeedbackContact(payload.contact);
  if (!contactResult.ok) {
    return NextResponse.json(
      { ok: false, code: "INVALID_CONTACT" },
      { status: 400 }
    );
  }

  const locale: Locale =
    typeof payload.locale === "string" && isValidLocale(payload.locale)
      ? payload.locale
      : DEFAULT_LOCALE;
  const pagePath = sanitizeFeedbackPagePath(payload.pagePath);

  const db = getDb();
  if (!db || !hasDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, code: "DB_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const now = new Date();

  try {
    // 跨 Serverless 实例持久化滑动窗口限流（仅比对哈希，不落盘明文 IP）
    if (ipHash) {
      const windowStart = new Date(now.getTime() - FEEDBACK_RATE_WINDOW_MS);
      const recentFromIp = await db
        .select()
        .from(userFeedback)
        .where(
          and(
            eq(userFeedback.submitterIpHash, ipHash),
            gte(userFeedback.createdAt, windowStart)
          )
        )
        .limit(MAX_FEEDBACK_PER_WINDOW);

      if (recentFromIp.length >= MAX_FEEDBACK_PER_WINDOW) {
        return NextResponse.json(
          { ok: false, code: "RATE_LIMITED" },
          { status: 429 }
        );
      }
    }

    const id = `fb_${randomUUID()}`;
    await db.insert(userFeedback).values({
      id,
      type: feedbackType,
      message,
      contact: contactResult.value,
      pagePath,
      locale,
      status: "open",
      submitterIpHash: ipHash,
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      status: "submitted",
      id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    console.error(
      "[Feedback] Submit error:",
      msg.replace(/(postgres(?:ql)?:\/\/)([^@\s]+)@/gi, "$1***@")
    );
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
