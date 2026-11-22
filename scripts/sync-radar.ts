import { config } from "dotenv";
import { getDb, hasDatabaseConfigured } from "../src/db";
import { dailyStats, signalItems } from "../src/db/schema";
import { distillRawItem } from "../src/lib/ai-distiller";
import {
  fetchHackerNewsShowHN,
  fetchProductHuntFeed,
  fetchRedditSubreddits,
} from "../src/lib/collectors/sources";

config({ path: ".env.local" });

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`🚀 [IndieRadar] 开始同步 ${today} 海外商业信号...`);

  const [phItems, hnItems, redditItems] = await Promise.all([
    fetchProductHuntFeed(6),
    fetchHackerNewsShowHN(6),
    fetchRedditSubreddits(["microsaas", "SaaS", "SomebodyMakeThis"], 4),
  ]);

  const allRaw = [...phItems, ...hnItems, ...redditItems];
  console.log(`📡 已拉取原始一手信号共 ${allRaw.length} 条，开始执行去重与 AI 商业透镜提炼...`);

  const uniqueMap = new Map<string, (typeof allRaw)[number]>();
  for (const item of allRaw) {
    if (!uniqueMap.has(item.url)) {
      uniqueMap.set(item.url, item);
    }
  }

  const deduped = Array.from(uniqueMap.values()).slice(0, 15);
  const distilled = [];
  for (let i = 0; i < deduped.length; i++) {
    const item = await distillRawItem(deduped[i], today, i);
    distilled.push(item);
    console.log(`  ✓ [${i + 1}/${deduped.length}] ${item.titleZh.slice(0, 38)}...`);
  }

  if (hasDatabaseConfigured()) {
    const db = getDb()!;
    for (const item of distilled) {
      await db
        .insert(signalItems)
        .values({
          id: item.id,
          dateKey: item.dateKey,
          titleZh: item.titleZh,
          titleOrig: item.titleOrig,
          category: item.category,
          whatItIs: item.whatItIs,
          businessSignal: item.businessSignal,
          indieTakeaway: item.indieTakeaway,
          metricsBadge: item.metricsBadge,
          metricType: item.metricType,
          tags: item.tags,
          score: item.score,
          isTopPick: item.isTopPick,
          sourcePlatform: item.sourcePlatform,
          sourceSublabel: item.sourceSublabel,
          sourceUrl: item.sourceUrl,
          publishedAt: new Date(item.publishedAt),
        })
        .onConflictDoNothing();
    }

    await db
      .insert(dailyStats)
      .values({
        dateKey: today,
        scannedCount: allRaw.length,
        selectedCount: distilled.length,
        estimatedReadMinutes: Math.max(3, Math.ceil(distilled.length / 3)),
        summaryNote: `已自动扫描 Product Hunt、Show HN 与 Reddit 创业版块共 ${allRaw.length} 条信号，精选 ${distilled.length} 条入库。`,
      })
      .onConflictDoUpdate({
        target: dailyStats.dateKey,
        set: {
          scannedCount: allRaw.length,
          selectedCount: distilled.length,
          updatedAt: new Date(),
        },
      });

    console.log(`✅ 已成功写入 Supabase PostgreSQL 数据库！`);
  } else {
    console.log(
      `ℹ️ 当前未配置 DATABASE_URL，本次抓取已完成验证（共提炼 ${distilled.length} 条）。阶段 2 填入 DATABASE_URL 后将自动写入云端数据库！`
    );
  }
}

main().catch((err) => {
  console.error("❌ 同步任务异常:", err);
  process.exit(1);
});
