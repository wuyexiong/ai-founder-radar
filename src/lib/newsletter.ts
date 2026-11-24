import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { getDb } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { getSiteUrl, isValidLocale, type Locale } from "@/i18n/config";
import { toSafeHttpUrl } from "@/lib/utils";
import { deriveTraditionalFields, toTraditionalTw } from "@/lib/zh-convert";
import type {
  LocalizedSignalFields,
  SignalItem,
  SummaryTranslations,
} from "@/types/signal";

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const DEFAULT_FROM = "AI Founder Radar <digest@radar.aibuildon.com>";

export const RESEND_BATCH_SIZE = 100;
export const CONFIRM_RESEND_COOLDOWN_MS = 15 * 60 * 1000;
export const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
export const SUBSCRIBE_RATE_WINDOW_MS = 10 * 60 * 1000;
export const SUBSCRIBE_MAX_ATTEMPTS_PER_WINDOW = 6;

const ipBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetSubscribeRateLimitForTests(): void {
  ipBuckets.clear();
}

export function checkMemoryIpRateLimit(bucketKey: string): boolean {
  const now = Date.now();
  if (ipBuckets.size > 2000) {
    for (const [k, v] of ipBuckets) {
      if (v.resetAt <= now) ipBuckets.delete(k);
    }
  }
  const existing = ipBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    ipBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + SUBSCRIBE_RATE_WINDOW_MS,
    });
    return true;
  }
  if (existing.count >= SUBSCRIBE_MAX_ATTEMPTS_PER_WINDOW) {
    return false;
  }
  existing.count += 1;
  return true;
}

export function normalizeAndValidateEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return null;
  if (/[\r\n\0]/.test(trimmed)) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  const domainPart = trimmed.split("@")[1] ?? "";
  if (!domainPart.includes(".") || domainPart.endsWith(".")) return null;
  return trimmed;
}

export function extractTrustedClientIp(headers: Headers): string {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first && first.length <= 128) {
      return first;
    }
  }
  return "unknown";
}

export function hashClientIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const normalized = ip.trim().toLowerCase();
  if (!normalized || normalized === "unknown") return null;
  const salt =
    process.env.REVALIDATE_SECRET?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "afr-default-ip-salt";
  return createHash("sha256")
    .update(`afr-nl-ip-v1:${salt}:${normalized}`)
    .digest("hex")
    .slice(0, 32);
}

export function hasResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  return Boolean(key && key.startsWith("re_"));
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildUnsubscribeUrl(token: string): string {
  return `${getSiteUrl()}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function buildConfirmUrl(token: string): string {
  return `${getSiteUrl()}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        headers: {
          "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      } satisfies ResendEmailPayload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(
        `[Newsletter] Resend HTTP ${res.status}: ${errBody.slice(0, 180)}`
      );
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.warn(`[Newsletter] Resend send failed: ${msg}`);
    return false;
  }
}

async function sendResendBatchEmails(
  batchPayload: ResendEmailPayload[]
): Promise<boolean> {
  if (batchPayload.length === 0) return true;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batchPayload),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(
        `[Newsletter] Resend batch HTTP ${res.status}: ${errBody.slice(0, 180)}`
      );
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.warn(`[Newsletter] Resend batch send failed: ${msg}`);
    return false;
  }
}

const CONFIRM_EMAIL_COPY: Record<
  Locale,
  {
    subject: string;
    heading: string;
    intro: string;
    cta: string;
    ignoreNote: string;
    unsubText: string;
  }
> = {
  en: {
    subject: "Confirm your subscription — AI Founder Radar",
    heading: "Confirm your email to activate the 8 AM digest",
    intro:
      "Click the button below within 48 hours to confirm your email and receive the daily Top 5 verified Micro-SaaS launches, real MRR breakdowns, and high-intent user pain points.",
    cta: "Confirm Subscription →",
    ignoreNote:
      "If you did not request this subscription, simply ignore this email — you will never receive further messages without confirming.",
    unsubText: "One-click unsubscribe",
  },
  zh: {
    subject: "请确认订阅 AI Founder Radar — 每日 5 分钟出海搞钱早报",
    heading: "点击下方按钮，激活每日早 8 点精选早报",
    intro:
      "收到你的早报订阅请求。请在 48 小时内点击下方按钮确认邮箱归属，激活每日 Top 5 海外新产品、真实 MRR 营收拆解与高付费意愿痛点推送。",
    cta: "确认激活早报订阅 →",
    ignoreNote:
      "如果这不是你本人的操作，请直接忽略此邮件——未点击确认前我们绝不会向你发送任何早报。",
    unsubText: "一键退订",
  },
  "zh-TW": {
    subject: "請確認訂閱 AI Founder Radar — 每日 5 分鐘出海變現早報",
    heading: "點擊下方按鈕，啟用每日早 8 點精選早報",
    intro:
      "收到你的早報訂閱請求。請於 48 小時內點擊下方按鈕確認信箱歸屬，啟用每日 Top 5 海外新產品、真實 MRR 營收拆解與痛點推送。",
    cta: "確認啟用早報訂閱 →",
    ignoreNote:
      "若非你本人操作，請直接忽略此信件——未點擊確認前我們絕不會向你發送任何早報。",
    unsubText: "取消訂閱",
  },
  ja: {
    subject: "【要確認】AI Founder Radar 日刊メルマガの購読確認",
    heading: "下のボタンをクリックして毎朝8時の配信を有効化してください",
    intro:
      "AI Founder Radar への購読リクエストを受け付けました。48時間以内に下のボタンをクリックしてメールアドレスを確認し、海外Micro-SaaS・リアルMRR事例 Top 5 の日刊配信を開始してください。",
    cta: "購読を確認して有効化する →",
    ignoreNote:
      "お心当たりがない場合はこのまま破棄してください。確認リンクをクリックしない限りメールは配信されません。",
    unsubText: "配信停止",
  },
};

export async function sendConfirmationEmail(params: {
  email: string;
  locale: Locale;
  confirmToken: string;
  unsubscribeToken: string;
}): Promise<boolean> {
  if (!hasResendConfigured()) return false;

  const copy = CONFIRM_EMAIL_COPY[params.locale] ?? CONFIRM_EMAIL_COPY.en;
  const confirmUrl = buildConfirmUrl(params.confirmToken);
  const unsubUrl = buildUnsubscribeUrl(params.unsubscribeToken);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 16px;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:28px;">
    <div style="font-size:13px;font-weight:700;color:#2563EB;letter-spacing:0.02em;margin-bottom:8px;">AI FOUNDER RADAR</div>
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;color:#0F172A;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#334155;">${escapeHtml(copy.intro)}</p>
    <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#2563EB;color:#FFFFFF;text-decoration:none;font-size:13.5px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(copy.cta)}</a>
    <p style="margin:20px 0 0;font-size:12.5px;line-height:1.6;color:#64748B;">${escapeHtml(copy.ignoreNote)}</p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 14px;" />
    <div style="font-size:12px;color:#94A3B8;">
      AI Founder Radar · <a href="${escapeHtml(unsubUrl)}" style="color:#64748B;text-decoration:underline;">${escapeHtml(copy.unsubText)}</a>
    </div>
  </div>
</body>
</html>`;

  const text = `${copy.heading}\n\n${copy.intro}\n\n${copy.cta}: ${confirmUrl}\n\n${copy.ignoreNote}\n\n---\n${copy.unsubText}: ${unsubUrl}`;

  return sendResendEmail({
    to: params.email,
    subject: copy.subject,
    html,
    text,
    unsubscribeUrl: unsubUrl,
  });
}

const WELCOME_COPY: Record<
  Locale,
  {
    subject: string;
    heading: string;
    intro: string;
    cta: string;
    unsubText: string;
  }
> = {
  en: {
    subject: "Welcome to AI Founder Radar — Daily 5-Min Indie & MRR Digest",
    heading: "You're on the AI Founder Radar list!",
    intro:
      "Every morning around 8:00 AM (UTC+8), you'll receive the Top 5 verified Micro-SaaS launches, real MRR breakdowns, and high-intent user pain points.",
    cta: "Read Today's Radar →",
    unsubText: "One-click unsubscribe",
  },
  zh: {
    subject: "欢迎订阅 AI Founder Radar — 每日 5 分钟出海搞钱与 MRR 灵感早报",
    heading: "订阅成功！欢迎加入 AI Founder Radar",
    intro:
      "每天早上 8 点左右，我们将为你精选推送 5 条经过交叉验证的海外新产品、真实 MRR 营收拆解与高付费意愿痛点灵感。",
    cta: "立即查看今日精选看板 →",
    unsubText: "一键退订早报",
  },
  "zh-TW": {
    subject: "歡迎訂閱 AI Founder Radar — 每日 5 分鐘出海變現與 MRR 靈感早報",
    heading: "訂閱成功！歡迎加入 AI Founder Radar",
    intro:
      "每天早上 8 點左右，我們將為你精選推送 5 則經過驗證的海外新產品、真實 MRR 營收拆解與高付費意願痛點靈感。",
    cta: "立即查看今日精選看板 →",
    unsubText: "一鍵取消訂閱",
  },
  ja: {
    subject: "AI Founder Radar ご購読ありがとうございます — 毎日5分の海外SaaS・MRRダイジェスト",
    heading: "ご登録ありがとうございます！",
    intro:
      "毎朝8時頃、厳選された海外Micro-SaaSの最新ローンチ、リアルなMRR収益事例、ユーザーの課題シグナル Top 5 をお届けします。",
    cta: "本日のレーダーを見る →",
    unsubText: "配信停止はこちら",
  },
};

export async function sendWelcomeEmail(params: {
  email: string;
  locale: Locale;
  unsubscribeToken: string;
}): Promise<boolean> {
  if (!hasResendConfigured()) return false;

  const copy = WELCOME_COPY[params.locale] ?? WELCOME_COPY.en;
  const siteUrl = getSiteUrl();
  const boardUrl = `${siteUrl}/${params.locale}`;
  const unsubUrl = buildUnsubscribeUrl(params.unsubscribeToken);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 16px;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:28px;">
    <div style="font-size:13px;font-weight:700;color:#2563EB;letter-spacing:0.02em;margin-bottom:8px;">AI FOUNDER RADAR</div>
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;color:#0F172A;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#334155;">${escapeHtml(copy.intro)}</p>
    <a href="${escapeHtml(boardUrl)}" style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">${escapeHtml(copy.cta)}</a>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:26px 0 14px;" />
    <div style="font-size:12px;color:#94A3B8;">
      AI Founder Radar · <a href="${escapeHtml(unsubUrl)}" style="color:#64748B;text-decoration:underline;">${escapeHtml(copy.unsubText)}</a>
    </div>
  </div>
</body>
</html>`;

  const text = `${copy.heading}\n\n${copy.intro}\n\n${copy.cta}: ${boardUrl}\n\n---\n${copy.unsubText}: ${unsubUrl}`;

  return sendResendEmail({
    to: params.email,
    subject: copy.subject,
    html,
    text,
    unsubscribeUrl: unsubUrl,
  });
}

function localizeCardForDigest(
  item: SignalItem,
  locale: Locale
): LocalizedSignalFields {
  const base: LocalizedSignalFields = {
    title: item.titleZh,
    whatItIs: item.whatItIs,
    businessSignal: item.businessSignal,
    indieTakeaway: item.indieTakeaway,
    metricsBadge: item.metricsBadge,
    tags: item.tags,
  };

  if (locale === "zh") return base;
  if (locale === "zh-TW") {
    return item.translations?.["zh-TW"] ?? deriveTraditionalFields(base);
  }
  if (locale === "en") {
    return (
      item.translations?.en ?? {
        ...base,
        title: item.titleOrig || item.titleZh,
      }
    );
  }
  return (
    item.translations?.ja ?? {
      ...base,
      title: item.titleOrig || item.titleZh,
    }
  );
}

function localizeSummaryForDigest(
  summaryZh: string,
  translations: SummaryTranslations | undefined,
  locale: Locale,
  totalCount: number
): string {
  if (locale === "zh") return summaryZh;
  if (locale === "zh-TW") {
    return translations?.["zh-TW"] || toTraditionalTw(summaryZh);
  }
  if (locale === "en") {
    return (
      translations?.en ||
      `Curated ${totalCount} verified Micro-SaaS launches, real MRR case studies, and high-intent user pain points.`
    );
  }
  return (
    translations?.ja ||
    `本日は海外の最新プロダクト、リアルなMRR収益事例、ユーザーの課題シグナルから厳選した ${totalCount} 件をお届けします。`
  );
}

const DIGEST_LABELS: Record<
  Locale,
  {
    subject: (date: string, topTitle: string) => string;
    heading: (date: string) => string;
    whatLabel: string;
    moneyLabel: string;
    playbookLabel: string;
    sourceLink: string;
    viewAllCta: (count: number) => string;
    unsubText: string;
  }
> = {
  en: {
    subject: (date, topTitle) => `⚡ [${date}] ${topTitle} | AI Founder Radar`,
    heading: (date) => `${date} · Top 5 Indie & MRR Signals`,
    whatLabel: "📌 What it is:",
    moneyLabel: "💵 Monetization:",
    playbookLabel: "💡 Indie Playbook:",
    sourceLink: "Original post ↗",
    viewAllCta: (count) => `View all ${count} signals on Web →`,
    unsubText: "Unsubscribe",
  },
  zh: {
    subject: (date, topTitle) => `⚡ [${date} 早报] ${topTitle} | AI Founder Radar`,
    heading: (date) => `${date} · 每日出海搞钱精选 Top 5`,
    whatLabel: "📌 是什么：",
    moneyLabel: "💵 怎么赚：",
    playbookLabel: "💡 抄作业：",
    sourceLink: "看原帖 ↗",
    viewAllCta: (count) => `前往网页端刷完今日全部 ${count} 条信号 →`,
    unsubText: "一键退订",
  },
  "zh-TW": {
    subject: (date, topTitle) => `⚡ [${date} 早報] ${topTitle} | AI Founder Radar`,
    heading: (date) => `${date} · 每日出海變現精選 Top 5`,
    whatLabel: "📌 是什麼：",
    moneyLabel: "💵 怎麼賺：",
    playbookLabel: "💡 抄作業：",
    sourceLink: "看原帖 ↗",
    viewAllCta: (count) => `前往網頁版看今日全部 ${count} 則信號 →`,
    unsubText: "取消訂閱",
  },
  ja: {
    subject: (date, topTitle) => `⚡ [${date}] ${topTitle} | AI Founder Radar`,
    heading: (date) => `${date} · 本日の厳選ビジネスシグナル Top 5`,
    whatLabel: "📌 概要：",
    moneyLabel: "💵 収益モデル：",
    playbookLabel: "💡 個人開発のヒント：",
    sourceLink: "元記事 ↗",
    viewAllCta: (count) => `Web版で本日の全 ${count} 件を見る →`,
    unsubText: "配信停止",
  },
};

export function buildDigestContent(params: {
  locale: Locale;
  dateKey: string;
  totalCount: number;
  topItems: SignalItem[];
  summaryZh: string;
  summaryTranslations?: SummaryTranslations;
  unsubscribeToken: string;
}) {
  const { locale, dateKey, totalCount, topItems } = params;
  const labels = DIGEST_LABELS[locale] ?? DIGEST_LABELS.en;
  const siteUrl = getSiteUrl();
  const archiveUrl = `${siteUrl}/${locale}/daily/${dateKey}?utm_source=daily_digest&utm_medium=email`;
  const unsubUrl = buildUnsubscribeUrl(params.unsubscribeToken);
  const localizedCards = topItems.map((item) => ({
    raw: item,
    loc: localizeCardForDigest(item, locale),
  }));

  const summary = localizeSummaryForDigest(
    params.summaryZh,
    params.summaryTranslations,
    locale,
    totalCount
  );
  const leadTitle = localizedCards[0]?.loc.title ?? "Daily Signals";
  const subject = labels.subject(dateKey, leadTitle);

  const cardsHtml = localizedCards
    .map(({ raw, loc }, idx) => {
      const safeSource = toSafeHttpUrl(raw.sourceUrl);
      const sourceHref = safeSource === "#" ? archiveUrl : safeSource;
      const badge = loc.metricsBadge || raw.metricsBadge;
      return `
      <div style="margin-bottom:16px;padding:16px;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;">
        <div style="font-size:12px;color:#059669;font-weight:700;margin-bottom:4px;">#${idx + 1} · ${escapeHtml(badge)} · Score ${raw.score.toFixed(1)}</div>
        <div style="font-size:16px;font-weight:700;color:#0F172A;line-height:1.4;margin-bottom:10px;">${escapeHtml(loc.title)}</div>
        <div style="background:#F8FAFC;border-left:3px solid #2563EB;padding:10px 12px;border-radius:6px;font-size:13px;line-height:1.6;color:#334155;">
          <div style="margin-bottom:4px;"><strong>${escapeHtml(labels.whatLabel)}</strong> ${escapeHtml(loc.whatItIs)}</div>
          <div style="margin-bottom:4px;"><strong>${escapeHtml(labels.moneyLabel)}</strong> ${escapeHtml(loc.businessSignal)}</div>
          <div><strong>${escapeHtml(labels.playbookLabel)}</strong> ${escapeHtml(loc.indieTakeaway)}</div>
        </div>
        <div style="margin-top:10px;text-align:right;">
          <a href="${escapeHtml(sourceHref)}" style="font-size:12px;color:#2563EB;text-decoration:none;font-weight:600;">${escapeHtml(labels.sourceLink)}</a>
        </div>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 12px;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#2563EB;letter-spacing:0.03em;">AI FOUNDER RADAR</div>
      <h1 style="margin:4px 0 8px;font-size:20px;color:#0F172A;">${escapeHtml(labels.heading(dateKey))}</h1>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">${escapeHtml(summary)}</p>
    </div>
    ${cardsHtml}
    <div style="text-align:center;margin:22px 0;">
      <a href="${escapeHtml(archiveUrl)}" style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(labels.viewAllCta(totalCount))}</a>
    </div>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0 12px;" />
    <div style="text-align:center;font-size:12px;color:#94A3B8;">
      <a href="${escapeHtml(siteUrl)}" style="color:#64748B;text-decoration:none;">AI Founder Radar</a> ·
      <a href="${escapeHtml(unsubUrl)}" style="color:#64748B;text-decoration:underline;">${escapeHtml(labels.unsubText)}</a>
    </div>
  </div>
</body>
</html>`;

  const textLines = [
    labels.heading(dateKey),
    summary,
    "",
    ...localizedCards.map(
      ({ raw, loc }, idx) =>
        `#${idx + 1} [${loc.metricsBadge}] ${loc.title}\n${labels.whatLabel} ${loc.whatItIs}\n${labels.moneyLabel} ${loc.businessSignal}\n${labels.playbookLabel} ${loc.indieTakeaway}\n${raw.sourceUrl}`
    ),
    "",
    `${labels.viewAllCta(totalCount)}: ${archiveUrl}`,
    `${labels.unsubText}: ${unsubUrl}`,
  ];

  return {
    subject,
    html,
    text: textLines.join("\n\n"),
    unsubscribeUrl: unsubUrl,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendDailyNewsletterDigests(params: {
  db: NonNullable<ReturnType<typeof getDb>>;
  dateKey: string;
  allItems: SignalItem[];
  summaryNote: string;
  summaryTranslations?: SummaryTranslations;
  rateLimitDelayMs?: number;
  batchSize?: number;
}): Promise<void> {
  const { db, dateKey, allItems, summaryNote, summaryTranslations } = params;
  const rateLimitDelayMs = params.rateLimitDelayMs ?? 550;
  const batchSize = Math.min(
    RESEND_BATCH_SIZE,
    Math.max(1, Math.floor(params.batchSize ?? RESEND_BATCH_SIZE))
  );

  if (!hasResendConfigured()) {
    console.log(
      "ℹ️ 未配置 RESEND_API_KEY，跳过每日邮件早报群发（订阅邮箱均已安全保存在 newsletter_subscribers 表）。"
    );
    return;
  }

  if (allItems.length === 0) {
    console.log("ℹ️ 今日无新增有效商业信号，跳过邮件早报群发。");
    return;
  }

  // 严格仅向已完成 Double Opt-in 激活 (status === 'active') 的订阅者推送，pending 与 unsubscribed 绝不触发群发
  const activeSubscribers = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "active"));

  const pending = activeSubscribers.filter(
    (sub) => sub.lastSentDate !== dateKey
  );

  if (pending.length === 0) {
    console.log(
      `📬 邮件早报检查完成（活跃已确认订阅者 ${activeSubscribers.length} 人，今日均已发送或暂无订阅者）。`
    );
    return;
  }

  const topItems = [...allItems].sort((a, b) => b.score - a.score).slice(0, 5);
  const fromAddress = getFromAddress();
  let sentCount = 0;

  console.log(
    `📬 开始通过 Resend Batch API 向 ${pending.length} 位活跃订阅者发送 ${dateKey} 早报（每批最多 ${batchSize} 封）...`
  );

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const chunk = pending.slice(offset, offset + batchSize);
    const batchPayload: ResendEmailPayload[] = chunk.map((sub) => {
      const subLocale: Locale = isValidLocale(sub.locale) ? sub.locale : "en";
      const mail = buildDigestContent({
        locale: subLocale,
        dateKey,
        totalCount: allItems.length,
        topItems,
        summaryZh: summaryNote,
        summaryTranslations,
        unsubscribeToken: sub.unsubscribeToken,
      });

      return {
        from: fromAddress,
        to: [sub.email],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {
          "List-Unsubscribe": `<${mail.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    const ok = await sendResendBatchEmails(batchPayload);
    if (ok) {
      sentCount += chunk.length;
      await db
        .update(newsletterSubscribers)
        .set({ lastSentDate: dateKey, updatedAt: new Date() })
        .where(
          inArray(
            newsletterSubscribers.id,
            chunk.map((s) => s.id)
          )
        );
    }

    if (offset + batchSize < pending.length && rateLimitDelayMs > 0) {
      await sleep(rateLimitDelayMs);
    }
  }

  console.log(
    `✅ 每日邮件早报发送完成（成功 ${sentCount}/${pending.length} 封）。`
  );
}
