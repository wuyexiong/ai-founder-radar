import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F172A",
          borderRadius: "36px",
          position: "relative",
        }}
      >
        <div
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "999px",
            border: "6px solid rgba(59, 130, 246, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "999px",
              border: "6px solid rgba(96, 165, 250, 0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "999px",
                backgroundColor: "#34D399",
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
