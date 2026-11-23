import { execFileSync, spawnSync } from "node:child_process";
import { config } from "dotenv";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabaseConfigured } from "../src/db";
import { dailyStats, signalItems } from "../src/db/schema";
import {
  distillRawItem,
  generateDailyEditorialSummary,
} from "../src/lib/ai-distiller";
import {
  fetchAcquireListings,
  fetchHackerNewsShowHN,
  fetchIndieHackers,
  fetchProductHuntFeed,
  fetchRedditSubreddits,
  getScannedCandidatesCount,
  resetScannedCandidatesCount,
} from "../src/lib/collectors/sources";
import type {
  MetricType,
  SignalCategory,
  SignalItem,
  SourcePlatform,
} from "../src/types/signal";

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
      const child = spawnSync(
        process.execPath,
        process.execArgv.concat(process.argv.slice(1)),
        {
          stdio: "inherit",
          env: {
            ...process.env,
            HTTP_PROXY: proxyUrl,
            HTTPS_PROXY: proxyUrl,
            NO_PROXY: "127.0.0.1,localhost,.supabase.com,.supabase.co",
            _INDIE_RADAR_PROXY_READY: "1",
          },
        }
      );
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

  const db = hasDatabaseConfigured() ? getDb() : null;
  const historicalUrls = new Set<string>();
  const todayExistingByUrl = new Map<string, SignalItem>();

  if (db) {
    try {
      // 清理早期占位降级记录
      await db.execute(
        sql`DELETE FROM signal_items WHERE business_signal LIKE '%自动生成深度%'`
      );

      const recentRows = await db
        .select()
        .from(signalItems)
        .orderBy(desc(signalItems.createdAt))
        .limit(500);

      for (const row of recentRows) {
        if (row.dateKey === today) {
          todayExistingByUrl.set(row.sourceUrl, {
            id: row.id,
            dateKey: row.dateKey,
            titleZh: row.titleZh,
            titleOrig: row.titleOrig,
            category: row.category as SignalCategory,
            whatItIs: row.whatItIs,
            businessSignal: row.businessSignal,
            indieTakeaway: row.indieTakeaway,
            metricsBadge: row.metricsBadge,
            metricType: row.metricType as MetricType,
            tags: row.tags ?? [],
            score: row.score,
            isTopPick: row.isTopPick,
            sourcePlatform: row.sourcePlatform as SourcePlatform,
            sourceSublabel: row.sourceSublabel,
            sourceUrl: row.sourceUrl,
            publishedAt: row.publishedAt.toISOString(),
          });
        } else {
          // 历史日期已入库的 URL（如常青案例/挂牌）加入排除集，优先拉取全新条目
          historicalUrls.add(row.sourceUrl);
        }
      }
    } catch (err) {
      console.warn("⚠️ 读取已存在 URL 缓存时跳过:", err);
    }
  }

  resetScannedCandidatesCount();

  const [phItems, hnItems, ihItems, acqItems, redditItems] =
    await Promise.all([
      fetchProductHuntFeed(4, historicalUrls),
      fetchHackerNewsShowHN(4, historicalUrls),
      fetchIndieHackers(4, historicalUrls),
      fetchAcquireListings(3, historicalUrls),
      fetchRedditSubreddits(["SaaS", "microsaas", "SomebodyMakeThis"], 2, historicalUrls),
    ]);

  const allRaw = [
    ...phItems,
    ...hnItems,
    ...ihItems,
    ...acquireOrEmpty(acqItems),
    ...redditItems,
  ];
  const rawScannedTotal = Math.max(getScannedCandidatesCount(), allRaw.length);

  console.log(
    `📡 已扫描 ${rawScannedTotal} 条海外一手动态，初筛命中 ${allRaw.length} 条 ` +
      `(PH: ${phItems.length}, ShowHN: ${hnItems.length}, IH: ${ihItems.length}, ` +
      `Acquire: ${acqItems.length}, Reddit: ${redditItems.length})`
  );

  const uniqueMap = new Map<string, (typeof allRaw)[number]>();
  for (const item of allRaw) {
    if (!uniqueMap.has(item.url)) {
      uniqueMap.set(item.url, item);
    }
  }

  const deduped = Array.from(uniqueMap.values()).slice(0, 22);
  const newlyDistilled: SignalItem[] = [];
  let llmCallIndex = 0;

  for (let i = 0; i < deduped.length; i++) {
    const raw = deduped[i];
    const cachedToday = todayExistingByUrl.get(raw.url);
    if (cachedToday) {
      console.log(
        `  ↺ [${i + 1}/${deduped.length}] 复用今日已提炼记录 (${raw.sourcePlatform}): ${cachedToday.titleZh.slice(0, 38)}`
      );
      continue;
    }

    const item = await distillRawItem(raw, today, llmCallIndex++);
    // 剔除低于 6.3 分的纯玩具 Demo / 低质水贴，确保看板高信噪比
    if (item.score < 6.3) {
      console.log(
        `  ⊘ [${i + 1}/${deduped.length}] 低分玩具/水贴已过滤 (${item.score.toFixed(1)}): ${raw.title.slice(0, 42)}`
      );
      continue;
    }

    newlyDistilled.push(item);
    console.log(
      `  ✓ [${i + 1}/${deduped.length}] [${item.sourcePlatform} · ${item.score.toFixed(1)}] ${item.titleZh.slice(0, 40)}`
    );
  }

  if (db) {
    for (const item of newlyDistilled) {
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

    // 汇总今日库内全部有效卡片（含增量写入）统一生成主编总评与统计指标
    const todayAllRows = await db
      .select()
      .from(signalItems)
      .where(eq(signalItems.dateKey, today))
      .orderBy(desc(signalItems.score));

    const todayAllItems: SignalItem[] = todayAllRows.map((row) => ({
      id: row.id,
      dateKey: row.dateKey,
      titleZh: row.titleZh,
      titleOrig: row.titleOrig,
      category: row.category as SignalCategory,
      whatItIs: row.whatItIs,
      businessSignal: row.businessSignal,
      indieTakeaway: row.indieTakeaway,
      metricsBadge: row.metricsBadge,
      metricType: row.metricType as MetricType,
      tags: row.tags ?? [],
      score: row.score,
      isTopPick: row.isTopPick,
      sourcePlatform: row.sourcePlatform as SourcePlatform,
      sourceSublabel: row.sourceSublabel,
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt.toISOString(),
    }));

    const summaryNote = await generateDailyEditorialSummary(todayAllItems);

    await db
      .insert(dailyStats)
      .values({
        dateKey: today,
        scannedCount: rawScannedTotal,
        selectedCount: todayAllItems.length,
        estimatedReadMinutes: Math.max(4, Math.ceil(todayAllItems.length / 3.5)),
        summaryNote,
      })
      .onConflictDoUpdate({
        target: dailyStats.dateKey,
        set: {
          scannedCount: rawScannedTotal,
          selectedCount: todayAllItems.length,
          estimatedReadMinutes: Math.max(4, Math.ceil(todayAllItems.length / 3.5)),
          summaryNote,
          updatedAt: new Date(),
        },
      });

    console.log(
      `✅ 已成功同步至 Supabase PostgreSQL！（今日累计精选 ${todayAllItems.length} 条，本次新增 ${newlyDistilled.length} 条）`
    );
  } else {
    console.log(
      `ℹ️ 当前未配置 DATABASE_URL，本次抓取已完成验证（新增提炼 ${newlyDistilled.length} 条）。`
    );
  }

  process.exit(0);
}

function acquireOrEmpty<T>(arr: T[]): T[] {
  return Array.isArray(arr) ? arr : [];
}

main().catch((err) => {
  console.error("❌ 同步任务异常:", err);
  process.exit(1);
});
