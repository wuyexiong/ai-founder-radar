import { execFileSync, spawnSync } from "node:child_process";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { getDb, hasDatabaseConfigured } from "../src/db";
import { dailyStats, signalItems } from "../src/db/schema";
import {
  distillRawItem,
  generateDailyEditorialSummary,
} from "../src/lib/ai-distiller";
import {
  fetchHackerNewsShowHN,
  fetchProductHuntFeed,
  fetchRedditSubreddits,
} from "../src/lib/collectors/sources";

// Node --use-env-proxy 需在进程启动前存在 HTTPS_PROXY 环境变量才会初始化代理连接池
if (
  process.platform === "darwin" &&
  !process.env.HTTPS_PROXY &&
  !process.env._INDIE_RADAR_PROXY_READY
) {
  try {
    const scutilOut = execFileSync("scutil", ["--proxy"], { encoding: "utf8" });
    const enabled = scutilOut.match(/HTTPEnable\s*:\s*1/);
    const host = scutilOut.match(/HTTPProxy\s*:\s*([^\s]+)/)?.[1];
    const port = scutilOut.match(/HTTPPort\s*:\s*(\d+)/)?.[1];
    if (enabled && host && port) {
      const proxyUrl = `http://${host}:${port}`;
      const child = spawnSync(process.execPath, process.execArgv.concat(process.argv.slice(1)), {
        stdio: "inherit",
        env: {
          ...process.env,
          HTTP_PROXY: proxyUrl,
          HTTPS_PROXY: proxyUrl,
          NO_PROXY: "127.0.0.1,localhost,.supabase.com,.supabase.co",
          _INDIE_RADAR_PROXY_READY: "1",
        },
      });
      process.exit(child.status ?? 0);
    }
  } catch {
    // ignore and proceed directly
  }
}

config({ path: ".env.local" });

async function main() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());
  console.log(
    `🚀 [IndieRadar] 开始同步 ${today} 海外商业信号${
      process.env.HTTPS_PROXY ? ` (代理: ${process.env.HTTPS_PROXY})` : ""
    }...`
  );

  const [phItems, hnItems, redditItems] = await Promise.all([
    fetchProductHuntFeed(5),
    fetchHackerNewsShowHN(5),
    fetchRedditSubreddits(["microsaas", "SaaS", "SomebodyMakeThis"], 3),
  ]);

  const allRaw = [...phItems, ...hnItems, ...redditItems];
  console.log(
    `📡 已拉取原始一手信号共 ${allRaw.length} 条 (PH: ${phItems.length}, HN: ${hnItems.length}, Reddit: ${redditItems.length})，开始执行去重与 AI 商业透镜提炼...`
  );

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
    console.log(`  ✓ [${i + 1}/${deduped.length}] ${item.titleZh.slice(0, 42)}`);
  }

  if (hasDatabaseConfigured()) {
    const db = getDb()!;
    // 清理早期未配置代理时的占位降级记录
    await db.execute(
      sql`DELETE FROM signal_items WHERE business_signal LIKE '%自动生成深度%'`
    );

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
        .onConflictDoUpdate({
          target: signalItems.sourceUrl,
          set: {
            titleZh: sql`excluded.title_zh`,
            category: sql`excluded.category`,
            whatItIs: sql`excluded.what_it_is`,
            businessSignal: sql`excluded.business_signal`,
            indieTakeaway: sql`excluded.indie_takeaway`,
            metricsBadge: sql`excluded.metrics_badge`,
            metricType: sql`excluded.metric_type`,
            tags: sql`excluded.tags`,
            score: sql`excluded.score`,
            isTopPick: sql`excluded.is_top_pick`,
          },
        });
    }

    const summaryNote = await generateDailyEditorialSummary(distilled);

    await db
      .insert(dailyStats)
      .values({
        dateKey: today,
        scannedCount: allRaw.length,
        selectedCount: distilled.length,
        estimatedReadMinutes: Math.max(3, Math.ceil(distilled.length / 3)),
        summaryNote,
      })
      .onConflictDoUpdate({
        target: dailyStats.dateKey,
        set: {
          scannedCount: allRaw.length,
          selectedCount: distilled.length,
          summaryNote,
          updatedAt: new Date(),
        },
      });

    console.log(`✅ 已成功写入 Supabase PostgreSQL 数据库！`);
  } else {
    console.log(
      `ℹ️ 当前未配置 DATABASE_URL，本次抓取已完成验证（共提炼 ${distilled.length} 条）。`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 同步任务异常:", err);
  process.exit(1);
});
