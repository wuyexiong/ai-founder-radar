import { ImageResponse } from "next/og";

export const alt =
  "IndieRadar — Daily Micro-SaaS Launches, Verified MRR & Pain Point Signals";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
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
          color: "#F8FAFC",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top Brand Row */}
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
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                backgroundColor: "#2563EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                fontWeight: 800,
                color: "#FFFFFF",
              }}
            >
              IR
            </div>
            <span
              style={{
                fontSize: "32px",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              IndieRadar
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              fontSize: "18px",
              color: "#94A3B8",
              border: "1px solid #1E293B",
              backgroundColor: "#111827",
              padding: "8px 18px",
              borderRadius: "999px",
            }}
          >
            EN · ZH-CN · ZH-TW · JA
          </div>
        </div>

        {/* Center Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div
            style={{
              fontSize: "62px",
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: "-0.03em",
              color: "#F8FAFC",
            }}
          >
            5-Minute Daily Micro-SaaS, Verified MRR & Pain Point Radar
          </div>
          <div
            style={{
              fontSize: "26px",
              lineHeight: 1.45,
              color: "#94A3B8",
            }}
          >
            Distilled from Product Hunt, Show HN, Indie Hackers, Acquire &
            Reddit into actionable founder playbooks.
          </div>
        </div>

        {/* Bottom Signal Pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #1F2937",
            paddingTop: "32px",
          }}
        >
          <div style={{ display: "flex", gap: "16px" }}>
            <div
              style={{
                padding: "10px 20px",
                borderRadius: "999px",
                backgroundColor: "rgba(16, 185, 129, 0.16)",
                border: "1px solid rgba(52, 211, 153, 0.35)",
                color: "#34D399",
                fontSize: "20px",
                fontWeight: 700,
              }}
            >
              $ Verified MRR & Revenue
            </div>
            <div
              style={{
                padding: "10px 20px",
                borderRadius: "999px",
                backgroundColor: "rgba(249, 115, 22, 0.16)",
                border: "1px solid rgba(251, 146, 60, 0.35)",
                color: "#FB923C",
                fontSize: "20px",
                fontWeight: 700,
              }}
            >
              New SaaS Launches
            </div>
            <div
              style={{
                padding: "10px 20px",
                borderRadius: "999px",
                backgroundColor: "rgba(37, 99, 235, 0.18)",
                border: "1px solid rgba(96, 165, 250, 0.35)",
                color: "#60A5FA",
                fontSize: "20px",
                fontWeight: 700,
              }}
            >
              User Pain Points
            </div>
          </div>

          <div
            style={{
              fontSize: "20px",
              color: "#64748B",
              fontWeight: 600,
            }}
          >
            Updated Daily
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
