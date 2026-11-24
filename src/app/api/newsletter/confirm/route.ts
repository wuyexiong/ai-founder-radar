import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabaseConfigured } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import {
  detectPreferredLocale,
  getSiteUrl,
  HTML_LANG_MAP,
  isValidLocale,
  LOCALE_COOKIE,
  type Locale,
} from "@/i18n/config";
import { CONFIRM_TOKEN_TTL_MS } from "@/lib/newsletter";

const SAFE_TOKEN_RE = /^[a-f0-9]{32,64}$/i;

type ConfirmOutcome = "confirmed" | "invalid_or_expired" | "server_error";

const CONFIRM_PAGE_COPY: Record<
  Locale,
  Record<
    ConfirmOutcome,
    { badge: string; title: string; desc: string; cta: string }
  >
> = {
  en: {
    confirmed: {
      badge: "SUBSCRIPTION ACTIVE",
      title: "Subscription Confirmed!",
      desc: "Your email is verified and active. Starting tomorrow around 8:00 AM (UTC+8), you'll receive the Top 5 verified Micro-SaaS launches & MRR signals.",
      cta: "Explore Today's Radar →",
    },
    invalid_or_expired: {
      badge: "LINK EXPIRED OR INVALID",
      title: "Confirmation Link Invalid or Expired",
      desc: "This confirmation link has expired (valid for 48 hours) or is no longer valid. Please submit your email again on the homepage to receive a fresh link.",
      cta: "Back to AI Founder Radar →",
    },
    server_error: {
      badge: "TEMPORARY ERROR",
      title: "Temporary Verification Error",
      desc: "We could not verify your subscription right now. Please try clicking the confirmation link again in a moment.",
      cta: "Back to AI Founder Radar →",
    },
  },
  zh: {
    confirmed: {
      badge: "订阅已激活",
      title: "早报订阅已确认激活！",
      desc: "你的邮箱已完成验证。从明早 8 点起，我们将每日为你推送 Top 5 经过交叉验证的海外新产品、真实 MRR 营收拆解与痛点信号。",
      cta: "立即浏览今日商业雷达 →",
    },
    invalid_or_expired: {
      badge: "链接无效或已过期",
      title: "确认链接无效或已超过有效期",
      desc: "该确认链接可能已超过 48 小时有效期或已失效。请返回首页重新输入邮箱获取最新确认邮件。",
      cta: "返回 AI Founder Radar 首页 →",
    },
    server_error: {
      badge: "服务暂时繁忙",
      title: "暂时无法完成确认",
      desc: "当前数据库连接繁忙，请稍后重新点击邮件中的确认链接再试。",
      cta: "返回 AI Founder Radar 首页 →",
    },
  },
  "zh-TW": {
    confirmed: {
      badge: "訂閱已啟用",
      title: "早報訂閱已確認啟用！",
      desc: "你的信箱已完成驗證。從明早 8 點起，我們將每日為你推送 Top 5 經過驗證的海外新產品、真實 MRR 營收拆解與痛點信號。",
      cta: "立即瀏覽今日商業雷達 →",
    },
    invalid_or_expired: {
      badge: "連結無效或已過期",
      title: "確認連結無效或已超過有效期限",
      desc: "此確認連結可能已超過 48 小時有效期限或已失效。請返回首頁重新輸入信箱以取得最新確認信。",
      cta: "返回 AI Founder Radar 首頁 →",
    },
    server_error: {
      badge: "服務暫時繁忙",
      title: "暫時無法完成確認",
      desc: "目前資料庫連線繁忙，請稍後重新點擊信件中的確認連結再試。",
      cta: "返回 AI Founder Radar 首頁 →",
    },
  },
  ja: {
    confirmed: {
      badge: "購読有効化完了",
      title: "メルマガ購読が確認・有効化されました！",
      desc: "メールアドレスの確認が完了しました。明朝8時頃より、厳選された海外Micro-SaaSローンチ＆リアルMRR事例 Top 5 をお届けします。",
      cta: "本日のレーダーを見る →",
    },
    invalid_or_expired: {
      badge: "リンク無効・期限切れ",
      title: "確認リンクが無効または有効期限切れです",
      desc: "この確認リンクは有効期限（48時間）を過ぎているか無効です。トップページから再度メールアドレスをご登録ください。",
      cta: "AI Founder Radar トップへ戻る →",
    },
    server_error: {
      badge: "一時的なエラー",
      title: "現在確認処理を完了できません",
      desc: "一時的な接続エラーが発生しました。しばらくしてからメール内の確認リンクを再度クリックしてください。",
      cta: "AI Founder Radar トップへ戻る →",
    },
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

async function processConfirmation(
  token: string | null,
  fallbackLocale: Locale
): Promise<{ locale: Locale; outcome: ConfirmOutcome }> {
  if (!token || !SAFE_TOKEN_RE.test(token)) {
    return { locale: fallbackLocale, outcome: "invalid_or_expired" };
  }

  const db = getDb();
  if (!db || !hasDatabaseConfigured()) {
    return { locale: fallbackLocale, outcome: "server_error" };
  }

  try {
    const rows = await db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.confirmToken, token))
      .limit(1);

    const sub = rows[0];
    if (!sub) {
      return { locale: fallbackLocale, outcome: "invalid_or_expired" };
    }

    const subLocale: Locale = isValidLocale(sub.locale)
      ? sub.locale
      : fallbackLocale;

    // 幂等兼容邮件安全网关预抓取或用户双击确认链接
    if (sub.status === "active") {
      return { locale: subLocale, outcome: "confirmed" };
    }

    if (sub.status !== "pending") {
      return { locale: subLocale, outcome: "invalid_or_expired" };
    }

    const now = new Date();
    if (
      sub.confirmSentAt &&
      now.getTime() - sub.confirmSentAt.getTime() > CONFIRM_TOKEN_TTL_MS
    ) {
      return { locale: subLocale, outcome: "invalid_or_expired" };
    }

    await db
      .update(newsletterSubscribers)
      .set({
        status: "active",
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(newsletterSubscribers.id, sub.id));

    return { locale: subLocale, outcome: "confirmed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    console.error(
      "[Newsletter] Confirm error:",
      msg.replace(/(postgres(?:ql)?:\/\/)([^@\s]+)@/gi, "$1***@")
    );
    return { locale: fallbackLocale, outcome: "server_error" };
  }
}

export async function GET(request: NextRequest) {
  const fallbackLocale = detectPreferredLocale(
    request.headers.get("accept-language"),
    request.cookies.get(LOCALE_COOKIE)?.value
  );
  const token = request.nextUrl.searchParams.get("token");
  const { locale, outcome } = await processConfirmation(token, fallbackLocale);

  const copy =
    CONFIRM_PAGE_COPY[locale]?.[outcome] ?? CONFIRM_PAGE_COPY.en[outcome];
  const homeUrl = `${getSiteUrl()}/${locale}`;
  const htmlLang = HTML_LANG_MAP[locale] ?? "en";

  const badgeStyle =
    outcome === "confirmed"
      ? "background:#ECFDF5;color:#059669;border:1px solid #A7F3D0;"
      : outcome === "invalid_or_expired"
        ? "background:#FFFBEB;color:#D97706;border:1px solid #FDE68A;"
        : "background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;";

  const status =
    outcome === "confirmed" ? 200 : outcome === "invalid_or_expired" ? 400 : 503;

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(htmlLang)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(copy.title)} — AI Founder Radar</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;">
  <div style="max-width:460px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:28px;text-align:center;">
    <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.04em;padding:3px 10px;border-radius:999px;margin-bottom:12px;${badgeStyle}">${escapeHtml(copy.badge)}</div>
    <h1 style="margin:0 0 10px;font-size:20px;color:#0F172A;">${escapeHtml(copy.title)}</h1>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#475569;">${escapeHtml(copy.desc)}</p>
    <a href="${escapeHtml(homeUrl)}" style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">${escapeHtml(copy.cta)}</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
