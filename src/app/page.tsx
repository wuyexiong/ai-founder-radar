import { RadarBoard } from "@/components/radar-board";
import { getRadarPayload } from "@/lib/signals-repo";

export const revalidate = 1800; // 每 30 分钟增量刷新缓存 (ISR)

interface HomePageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const payload = await getRadarPayload(params.date);

  return <RadarBoard payload={payload} />;
}
