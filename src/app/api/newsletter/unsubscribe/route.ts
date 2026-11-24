import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabaseConfigured } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { getSiteUrl, isValidLocale, type Locale } from "@/i18n/config";

const SAFE_TOKEN_RE = /^[a-f0-9]{32,64}$/i;

const UNSUB_COPY: Record<
  Locale,
  { title: string; desc: string; back: string }
> = {
  en: {
    title: "Unsubscribed Successfully",
    desc: "Your email has been removed from the AI Founder Radar daily digest list.",
    back: "Back to AI Founder Radar →",
  },
  zh: {
    title: "已成功退订早报",
    desc: "你的邮箱已从 AI Founder Radar 每日推送名单中移除，不会再收到早报邮件。",
    back: "返回 AI Founder Radar 首页 →",
  },
  "zh-TW": {
    title: "已成功取消訂閱",
    desc: "你的信箱已從 AI Founder Radar 每日推送名單中移除。",
    back: "返回 AI Founder Radar 首頁 →",
  },
  ja: {
    title: "配信停止が完了しました",
    desc: "AI Founder Radar の日刊メール配信リストから解除されました。",
    back: "AI Founder Radar トップへ戻る →",
  },
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function processUnsubscribe(
  token: string | null
): Promise<{ locale: Locale; ok: boolean }> {
  if (!token || !SAFE_TOKEN_RE.test(token)) {
    return { locale: "en", ok: true };
  }

  const db = getDb();
  if (!db || !hasDatabaseConfigured()) {
    return { locale: "en", ok: false };
  }

  try {
    const rows = await db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.unsubscribeToken, token))
      .limit(1);

    const sub = rows[0];
    if (!sub) return { locale: "en", ok: true };

    if (sub.status !== "unsubscribed") {
      await db
        .update(newsletterSubscribers)
        .set({ status: "unsubscribed", updatedAt: new Date() })
        .where(eq(newsletterSubscribers.id, sub.id));
    }

    return {
      locale: isValidLocale(sub.locale) ? sub.locale : "en",
      ok: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    console.error(
      "[Newsletter] Unsubscribe error:",
      msg.replace(/(postgres(?:ql)?:\/\/)([^@\s]+)@/gi, "$1***@")
    );
    return { locale: "en", ok: false };
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const { locale, ok } = await processUnsubscribe(token);
  const copy = ok
    ? UNSUB_COPY[locale] ?? UNSUB_COPY.en
    : {
        title: "Temporary Error",
        desc: "We could not process your unsubscribe request right now. Please try clicking the link again in a moment.",
        back: "Back to AI Founder Radar →",
      };
  const homeUrl = `${getSiteUrl()}/${locale}`;

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(copy.title)} — AI Founder Radar</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;">
  <div style="max-width:440px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:28px;text-align:center;">
    <div style="font-size:12px;font-weight:700;color:#2563EB;margin-bottom:8px;">AI FOUNDER RADAR</div>
    <h1 style="margin:0 0 10px;font-size:20px;color:#0F172A;">${escapeHtml(copy.title)}</h1>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(copy.desc)}</p>
    <a href="${escapeHtml(homeUrl)}" style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">${escapeHtml(copy.back)}</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: ok ? 200 : 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// 支持 Gmail / Yahoo RFC 8058 List-Unsubscribe-Post 一键退订请求
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const { ok } = await processUnsubscribe(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
