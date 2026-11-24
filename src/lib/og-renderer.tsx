import React from "react";
import { ImageResponse } from "next/og";
import { LOCALES, type Locale } from "@/i18n/config";
import type { SignalItem } from "@/types/signal";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export const OG_CONTENT_TYPE = "image/png";

export const OG_LOCALE_BADGES: Record<Locale, string> = {
  en: "EN",
  zh: "ZH-CN",
  "zh-TW": "ZH-TW",
  ja: "JA",
};

export type OgCardKind = "default" | "home" | "daily" | "topic" | "source";

/**
 * 100% 离线 Satori 安全文本净化器：
 * - 将常见符号与中/日文指标单位映射为标准金融终端英文缩写
 * - 严格剥离所有非可打印 ASCII 字符（`[^\x20-\x7E]`），杜绝 `next/og` 在离线构建期触发 Google Fonts / Twemoji 外网请求或渲染方块乱码
 */
export function sanitizeOgText(
  raw: string | undefined | null,
  maxLength = 120
): string {
  if (!raw) return "";

  const normalized = raw
    .replace(/（/g, " (")
    .replace(/）/g, ") ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/·|•/g, "|")
    .replace(/今日|本日/g, "today")
    .replace(/\/日/g, "/d")
    .replace(/\/月/g, "/mo")
    .replace(/\/年/g, "/yr")
    .replace(/月入\s*/g, "")
    .replace(/年入\s*/g, "")
    .replace(/票|赞|讚/g, " upvotes")
    .replace(/评论|評論|コメント/g, " comments")
    .replace(/星/g, " stars")
    .replace(/[★☆]/g, "*")
    .replace(/[▲↑]/g, "+")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export interface OgSummaryStats {
  signalCount: number;
  avgScoreText: string;
  peakScoreText: string;
  topMetricBadge: string;
  topSignalHeadline: string;
  isStarMetric: boolean;
  isRevenueMetric: boolean;
}

export function summarizeOgMetrics(items: SignalItem[]): OgSummaryStats {
  if (items.length === 0) {
    return {
      signalCount: 0,
      avgScoreText: "8.8",
      peakScoreText: "9.4",
      topMetricBadge: "$ Verified MRR & SaaS Signals",
      topSignalHeadline:
        "Curated from TrustMRR, Product Hunt, Show HN, GitHub, Acquire & Reddit",
      isStarMetric: false,
      isRevenueMetric: true,
    };
  }

  const sorted = [...items].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const avg =
    items.reduce((acc, item) => acc + item.score, 0) / items.length;

  const rawBadge = top.metricsBadge || "";
  const isStarMetric =
    rawBadge.includes("★") ||
    /\bstars?\b/i.test(rawBadge) ||
    top.sourcePlatform === "github";
  const isRevenueMetric =
    top.metricType === "revenue" ||
    top.category === "revenue" ||
    rawBadge.includes("$") ||
    /\b(mrr|arr)\b/i.test(rawBadge);

  const cleanBadge =
    sanitizeOgText(rawBadge.replace(/^[★☆]\s*/, ""), 42) ||
    (isRevenueMetric ? "Verified Revenue" : "High Signal");

  const cleanTopHeadline =
    sanitizeOgText(top.titleOrig || top.title, 88) ||
    "High-Conviction Indie SaaS Commercial Signal";

  return {
    signalCount: items.length,
    avgScoreText: avg.toFixed(1),
    peakScoreText: top.score.toFixed(1),
    topMetricBadge: cleanBadge,
    topSignalHeadline: cleanTopHeadline,
    isStarMetric,
    isRevenueMetric,
  };
}

export interface RenderRadarOgParams {
  kind: OgCardKind;
  locale?: Locale;
  dateLabel?: string;
  headline: string;
  subheadline?: string;
  items?: SignalItem[];
}

function getKindBadgeText(kind: OgCardKind): string {
  switch (kind) {
    case "home":
    case "daily":
      return "DAILY BRIEFING";
    case "topic":
      return "NICHE HUB";
    case "source":
      return "SOURCE HUB";
    default:
      return "SIGNAL TERMINAL";
  }
}

export function renderRadarOgImage(params: RenderRadarOgParams): ImageResponse {
  const kindBadge = getKindBadgeText(params.kind);
  const safeDate = sanitizeOgText(params.dateLabel, 28);
  const safeHeadline =
    sanitizeOgText(params.headline, 86) ||
    "5-Minute Daily Micro-SaaS, Verified MRR & Pain Point Radar";
  const stats = summarizeOgMetrics(params.items ?? []);
  const safeSubheadline =
    sanitizeOgText(params.subheadline, 128) ||
    stats.topSignalHeadline;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#090D16",
          backgroundImage:
            "radial-gradient(circle at 88% 14%, rgba(37, 99, 235, 0.22), transparent 46%), radial-gradient(circle at 12% 88%, rgba(16, 185, 129, 0.14), transparent 42%)",
          color: "#F8FAFC",
          padding: "54px 64px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top Terminal Bar: Brand + Active Locale Pill Matrix */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "46px",
                height: "46px",
                borderRadius: "12px",
                backgroundColor: "#2563EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "19px",
                fontWeight: 800,
                color: "#FFFFFF",
              }}
            >
              AFR
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "#F8FAFC",
                }}
              >
                AI Founder Radar
              </span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#64748B",
                  letterSpacing: "0.06em",
                }}
              >
                RADAR.AIBUILDON.COM
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid #1E293B",
              backgroundColor: "#0F172A",
              padding: "6px 8px",
              borderRadius: "999px",
            }}
          >
            {LOCALES.map((loc) => {
              const isActive = params.locale === loc;
              return (
                <div
                  key={loc}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 14px",
                    borderRadius: "999px",
                    fontSize: "15px",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    backgroundColor: isActive ? "#2563EB" : "transparent",
                    color: isActive ? "#FFFFFF" : "#64748B",
                    border: isActive
                      ? "1px solid #60A5FA"
                      : "1px solid transparent",
                  }}
                >
                  {OG_LOCALE_BADGES[loc]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Section: Route Type Kicker + Headline + Top #1 Signal Spotlight */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(37, 99, 235, 0.2)",
                border: "1px solid rgba(96, 165, 250, 0.4)",
                color: "#93C5FD",
                fontSize: "15px",
                fontWeight: 800,
                letterSpacing: "0.08em",
              }}
            >
              {kindBadge}
            </div>
            {safeDate && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  backgroundColor: "#111827",
                  border: "1px solid #1F2937",
                  color: "#CBD5E1",
                  fontSize: "15px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                {safeDate}
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: safeHeadline.length > 58 ? "46px" : "54px",
              fontWeight: 800,
              lineHeight: 1.14,
              letterSpacing: "-0.025em",
              color: "#F8FAFC",
            }}
          >
            {safeHeadline}
          </div>

          <div
            style={{
              fontSize: "22px",
              lineHeight: 1.4,
              color: "#94A3B8",
            }}
          >
            {safeSubheadline}
          </div>
        </div>

        {/* Bottom Financial Terminal Telemetry Strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #1E293B",
            paddingTop: "26px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Top 1 Signal Metric Capsule ($MRR / Stars / Traction) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 20px",
                borderRadius: "999px",
                backgroundColor: stats.isRevenueMetric
                  ? "rgba(16, 185, 129, 0.16)"
                  : "rgba(245, 158, 11, 0.16)",
                border: stats.isRevenueMetric
                  ? "1px solid rgba(52, 211, 153, 0.4)"
                  : "1px solid rgba(251, 191, 36, 0.4)",
                color: stats.isRevenueMetric ? "#34D399" : "#FBBF24",
                fontSize: "19px",
                fontWeight: 800,
              }}
            >
              {stats.isStarMetric && (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              )}
              <span>
                {stats.signalCount > 0
                  ? `TOP #1: ${stats.topMetricBadge}`
                  : stats.topMetricBadge}
              </span>
            </div>

            {stats.signalCount > 0 ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 18px",
                    borderRadius: "999px",
                    backgroundColor: "#111827",
                    border: "1px solid #1F2937",
                    color: "#E2E8F0",
                    fontSize: "18px",
                    fontWeight: 700,
                  }}
                >
                  {`${stats.signalCount} Curated Signals`}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 18px",
                    borderRadius: "999px",
                    backgroundColor: "#111827",
                    border: "1px solid #1F2937",
                    color: "#93C5FD",
                    fontSize: "18px",
                    fontWeight: 700,
                  }}
                >
                  {`Avg ${stats.avgScoreText} | Peak ${stats.peakScoreText}`}
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 18px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(37, 99, 235, 0.16)",
                  border: "1px solid rgba(96, 165, 250, 0.35)",
                  color: "#60A5FA",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                Launches | MRR | Pain Points
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: "17px",
              color: "#64748B",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            UPDATED DAILY
          </div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
    }
  );
}
