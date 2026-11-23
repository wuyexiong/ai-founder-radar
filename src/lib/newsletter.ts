import { eq } from "drizzle-orm";
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

function buildUnsubscribeUrl(token: string): string {
  return `${getSiteUrl()}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
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
      }),
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
  locale: Locale
): string {
  if (locale === "zh") return summaryZh;
  if (locale === "zh-TW") {
    return translations?.["zh-TW"] || toTraditionalTw(summaryZh);
  }
  if (locale === "en") return translations?.en || summaryZh;
  return translations?.ja || summaryZh;
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

function buildDigestContent(params: {
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
  const archiveUrl = `${siteUrl}/${locale}/daily/${dateKey}`;
  const unsubUrl = buildUnsubscribeUrl(params.unsubscribeToken);
  const localizedCards = topItems.map((item) => ({
    raw: item,
    loc: localizeCardForDigest(item, locale),
  }));

  const summary = localizeSummaryForDigest(
    params.summaryZh,
    params.summaryTranslations,
    locale
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
}): Promise<void> {
  const { db, dateKey, allItems, summaryNote, summaryTranslations } = params;

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

  const activeSubscribers = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "active"));

  const pending = activeSubscribers.filter(
    (sub) => sub.lastSentDate !== dateKey
  );

  if (pending.length === 0) {
    console.log(
      `📬 邮件早报检查完成（活跃订阅者 ${activeSubscribers.length} 人，今日均已发送或暂无订阅者）。`
    );
    return;
  }

  const topItems = [...allItems].sort((a, b) => b.score - a.score).slice(0, 5);
  let sentCount = 0;

  console.log(`📬 开始向 ${pending.length} 位活跃订阅者发送 ${dateKey} 早报...`);

  for (let i = 0; i < pending.length; i++) {
    const sub = pending[i];
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

    const ok = await sendResendEmail({
      to: sub.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      unsubscribeUrl: mail.unsubscribeUrl,
    });

    if (ok) {
      sentCount++;
      await db
        .update(newsletterSubscribers)
        .set({ lastSentDate: dateKey, updatedAt: new Date() })
        .where(eq(newsletterSubscribers.id, sub.id));
    }

    // 遵守 Resend 免费套餐 2 req/s 速率限制
    if (i < pending.length - 1) {
      await sleep(550);
    }
  }

  console.log(
    `✅ 每日邮件早报发送完成（成功 ${sentCount}/${pending.length} 封）。`
  );
}
