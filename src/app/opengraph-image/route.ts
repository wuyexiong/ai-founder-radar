import { renderRadarOgImage } from "@/lib/og-renderer";

export const revalidate = 3600;

export async function GET() {
  const response = renderRadarOgImage({
    kind: "default",
    headline: "5-Minute Daily Micro-SaaS, Verified MRR & Pain Point Radar",
    subheadline:
      "Distilled from TrustMRR, App Store, Product Hunt, Show HN, GitHub, Indie Hackers, Acquire & Reddit into founder playbooks.",
  });
  response.headers.set(
    "Cache-Control",
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
  );
  return response;
}
