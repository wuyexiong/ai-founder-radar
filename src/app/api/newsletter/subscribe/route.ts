import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabaseConfigured } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { DEFAULT_LOCALE, isValidLocale, type Locale } from "@/i18n/config";
import {
  checkMemoryIpRateLimit,
  CONFIRM_RESEND_COOLDOWN_MS,
  extractTrustedClientIp,
  hashClientIp,
  hasResendConfigured,
  normalizeAndValidateEmail,
  sendConfirmationEmail,
  SUBSCRIBE_MAX_ATTEMPTS_PER_WINDOW,
  SUBSCRIBE_RATE_WINDOW_MS,
} from "@/lib/newsletter";

export async function POST(request: NextRequest) {
  const ip = extractTrustedClientIp(request.headers);
  const ipHash = hashClientIp(ip);

  // 第一道防线：进程内存极速拦截畸形请求洪峰（无需消耗数据库连接）
  if (!checkMemoryIpRateLimit(ipHash ?? ip)) {
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

  // 蜜罐字段：正常人类表单不会填写隐藏的 website 输入框，静默伪造成功响应欺骗机器人
  if (typeof payload.website === "string" && payload.website.trim().length > 0) {
    return NextResponse.json({
      ok: true,
      status: "confirmation_required",
    });
  }

  const email = normalizeAndValidateEmail(payload.email);
  if (!email) {
    return NextResponse.json(
      { ok: false, code: "INVALID_EMAIL" },
      { status: 400 }
    );
  }

  const locale: Locale =
    typeof payload.locale === "string" && isValidLocale(payload.locale)
      ? payload.locale
      : DEFAULT_LOCALE;

  const db = getDb();
  if (!db || !hasDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, code: "DB_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const now = new Date();

  try {
    // 第二道防线：PostgreSQL 滑动窗口跨 Serverless 实例持久化 IP 限流（GDPR 合规仅比对哈希）
    if (ipHash) {
      const windowStart = new Date(now.getTime() - SUBSCRIBE_RATE_WINDOW_MS);
      const recentFromIp = await db
        .select()
        .from(newsletterSubscribers)
        .where(
          and(
            eq(newsletterSubscribers.signupIpHash, ipHash),
            gte(newsletterSubscribers.updatedAt, windowStart)
          )
        )
        .limit(SUBSCRIBE_MAX_ATTEMPTS_PER_WINDOW);

      if (recentFromIp.length >= SUBSCRIBE_MAX_ATTEMPTS_PER_WINDOW) {
        return NextResponse.json(
          { ok: false, code: "RATE_LIMITED" },
          { status: 429 }
        );
      }
    }

    const existingRows = await db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);

    const existing = existingRows[0];
    const resendReady = hasResendConfigured();

    if (existing) {
      // 1. 已确认激活的存量订阅者：保持 active，仅同步语言偏好，不重复发信
      if (existing.status === "active") {
        if (existing.locale !== locale) {
          await db
            .update(newsletterSubscribers)
            .set({ locale, updatedAt: now })
            .where(eq(newsletterSubscribers.id, existing.id));
        }
        return NextResponse.json({
          ok: true,
          status: "already_subscribed",
        });
      }

      // 2. 待确认 (pending) 订阅者：15 分钟冷却期内静默返回，严防恶意代填轰炸他人邮箱
      if (
        existing.status === "pending" &&
        resendReady &&
        existing.confirmSentAt &&
        now.getTime() - existing.confirmSentAt.getTime() <
          CONFIRM_RESEND_COOLDOWN_MS
      ) {
        return NextResponse.json({
          ok: true,
          status: "confirmation_required",
        });
      }

      // 3. 已退订 (unsubscribed) 或冷却期已过的待确认用户：轮换令牌并走 Double Opt-in 确认
      const nextUnsubToken =
        existing.status === "unsubscribed"
          ? randomBytes(24).toString("hex")
          : existing.unsubscribeToken;
      const nextConfirmToken = randomBytes(24).toString("hex");

      if (!resendReady) {
        await db
          .update(newsletterSubscribers)
          .set({
            status: "pending",
            locale,
            unsubscribeToken: nextUnsubToken,
            confirmToken: nextConfirmToken,
            confirmSentAt: null,
            confirmedAt: null,
            signupIpHash: ipHash ?? existing.signupIpHash,
            updatedAt: now,
          })
          .where(eq(newsletterSubscribers.id, existing.id));

        return NextResponse.json({
          ok: true,
          status: "pending_mailer",
        });
      }

      const sent = await sendConfirmationEmail({
        email,
        locale,
        confirmToken: nextConfirmToken,
        unsubscribeToken: nextUnsubToken,
      });

      if (!sent) {
        return NextResponse.json(
          { ok: false, code: "DELIVERY_FAILED" },
          { status: 502 }
        );
      }

      await db
        .update(newsletterSubscribers)
        .set({
          status: "pending",
          locale,
          unsubscribeToken: nextUnsubToken,
          confirmToken: nextConfirmToken,
          confirmSentAt: now,
          confirmedAt: null,
          signupIpHash: ipHash ?? existing.signupIpHash,
          updatedAt: now,
        })
        .where(eq(newsletterSubscribers.id, existing.id));

      return NextResponse.json({
        ok: true,
        status: "confirmation_required",
      });
    }

    // 4. 全新订阅者：生成独立退订与确认令牌，确认前绝不进入 active 群发池
    const unsubscribeToken = randomBytes(24).toString("hex");
    const confirmToken = randomBytes(24).toString("hex");

    if (!resendReady) {
      await db.insert(newsletterSubscribers).values({
        id: `sub_${randomUUID()}`,
        email,
        locale,
        status: "pending",
        unsubscribeToken,
        confirmToken,
        confirmSentAt: null,
        confirmedAt: null,
        signupIpHash: ipHash,
        createdAt: now,
        updatedAt: now,
      });

      return NextResponse.json({
        ok: true,
        status: "pending_mailer",
      });
    }

    const sent = await sendConfirmationEmail({
      email,
      locale,
      confirmToken,
      unsubscribeToken,
    });

    if (!sent) {
      return NextResponse.json(
        { ok: false, code: "DELIVERY_FAILED" },
        { status: 502 }
      );
    }

    await db.insert(newsletterSubscribers).values({
      id: `sub_${randomUUID()}`,
      email,
      locale,
      status: "pending",
      unsubscribeToken,
      confirmToken,
      confirmSentAt: now,
      confirmedAt: null,
      signupIpHash: ipHash,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      ok: true,
      status: "confirmation_required",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    console.error(
      "[Newsletter] Subscribe error:",
      msg.replace(/(postgres(?:ql)?:\/\/)([^@\s]+)@/gi, "$1***@")
    );
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
