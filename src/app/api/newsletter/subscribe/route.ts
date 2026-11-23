import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabaseConfigured } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { DEFAULT_LOCALE, isValidLocale, type Locale } from "@/i18n/config";
import {
  normalizeAndValidateEmail,
  sendWelcomeEmail,
} from "@/lib/newsletter";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 6;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  if (ipBuckets.size > 2000) {
    for (const [k, v] of ipBuckets) {
      if (v.resetAt <= now) ipBuckets.delete(k);
    }
  }
  const existing = ipBuckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (existing.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return false;
  }
  existing.count += 1;
  return true;
}

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkIpRateLimit(ip)) {
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

  // 蜜罐字段：正常人类表单不会填写隐藏的 website 输入框，防机器人刷库
  if (typeof payload.website === "string" && payload.website.trim().length > 0) {
    return NextResponse.json({ ok: true, status: "subscribed" });
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

  try {
    const existingRows = await db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);

    const existing = existingRows[0];

    if (existing) {
      if (existing.status === "active") {
        if (existing.locale !== locale) {
          await db
            .update(newsletterSubscribers)
            .set({ locale, updatedAt: new Date() })
            .where(eq(newsletterSubscribers.id, existing.id));
        }
        return NextResponse.json({
          ok: true,
          status: "already_subscribed",
        });
      }

      const freshToken = randomBytes(24).toString("hex");
      await db
        .update(newsletterSubscribers)
        .set({
          status: "active",
          locale,
          unsubscribeToken: freshToken,
          updatedAt: new Date(),
        })
        .where(eq(newsletterSubscribers.id, existing.id));

      await sendWelcomeEmail({
        email,
        locale,
        unsubscribeToken: freshToken,
      });

      return NextResponse.json({
        ok: true,
        status: "subscribed",
      });
    }

    const unsubscribeToken = randomBytes(24).toString("hex");
    await db.insert(newsletterSubscribers).values({
      id: `sub_${randomUUID()}`,
      email,
      locale,
      status: "active",
      unsubscribeToken,
    });

    await sendWelcomeEmail({
      email,
      locale,
      unsubscribeToken,
    });

    return NextResponse.json({
      ok: true,
      status: "subscribed",
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
