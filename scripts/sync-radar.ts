import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabaseConfigured } from "../src/db";
import { dailyStats, signalItems } from "../src/db/schema";
import {
  distillRawItem,
  generateDailyEditorialSummary,
  translateExistingSignalRow,
} from "../src/lib/ai-distiller";
import { sendDailyNewsletterDigests } from "../src/lib/newsletter";
import {
  fetchAppStoreTopGrossing,
  fetchGitHubTrending,
  fetchTrustMrr,
} from "../src/lib/collectors/extra-sources";
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
  RadarDataset,
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

function redactUrlCredentials(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "";
    }
    return u.toString();
  } catch {
    return raw.replace(/\/\/[^/@]+@/, "//***@");
  }
}

function formatSafeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(
    /(postgres(?:ql)?:\/\/)([^@\s]+)@/gi,
    "$1***@"
  );
}

async function enrichLocalDatasetFile() {
  const jsonPath = resolve(process.cwd(), "src/data/local-signals.json");
  const dataset = JSON.parse(readFileSync(jsonPath, "utf8")) as RadarDataset;

  const pendingItems = dataset.items.filter((it) => {
    const t = it.translations ?? {};
    return !t.en?.title || !t.ja?.title || !t["zh-TW"]?.title;
  });

  if (pendingItems.length > 0) {
    console.log(
      `📦 正在为本地降级样本 (local-signals.json) 补全 ${pendingItems.length} 条四语种翻译...`
    );
    for (let i = 0; i < dataset.items.length; i++) {
      const item = dataset.items[i];
      const t = item.translations ?? {};
      if (t.en?.title && t.ja?.title && t["zh-TW"]?.title) continue;

      item.translations = await translateExistingSignalRow(
        {
          titleZh: item.titleZh,
          titleOrig: item.titleOrig,
          whatItIs: item.whatItIs,
          businessSignal: item.businessSignal,
          indieTakeaway: item.indieTakeaway,
          metricsBadge: item.metricsBadge,
          tags: item.tags,
          sourcePlatform: item.sourcePlatform,
          existingTranslations: item.translations,
        },
        i
      );
      console.log(
        `  ✓ [本地样本 ${i + 1}/${dataset.items.length}] ${item.id} -> ${(item.translations.en?.title ?? "").slice(0, 40)}`
      );
    }
  }

  for (const ov of dataset.overviews) {
    const st = ov.summaryTranslations ?? {};
    if (!st.en || !st.ja || !st["zh-TW"]) {
      const dayItems = dataset.items
        .filter((it) => it.dateKey === ov.dateKey)
        .map((it) => ({ ...it, title: it.titleZh }) as SignalItem);
      const { summaryTranslations } =
        await generateDailyEditorialSummary(dayItems);
      ov.summaryTranslations = summaryTranslations;
      console.log(`  ✓ [本地样本总评] ${ov.dateKey} 四语种已更新`);
    }
  }

  writeFileSync(jsonPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
}

async function backfillMissingTranslations(
  db: NonNullable<ReturnType<typeof getDb>>
) {
  const allRows = await db
    .select()
    .from(signalItems)
    .orderBy(desc(signalItems.createdAt))
    .limit(200);

  const missingRows = allRows.filter((row) => {
    const t = row.translations ?? {};
    return !t.en?.title || !t.ja?.title || !t["zh-TW"]?.title;
  });

  if (missingRows.length > 0) {
    console.log(
      `🌐 检测到库内有 ${missingRows.length} 条历史记录缺少完整英/繁/日多语字段，正在自动补全...`
    );
    for (let i = 0; i < missingRows.length; i++) {
      const row = missingRows[i];
      const translations = await translateExistingSignalRow(
        {
          titleZh: row.titleZh,
          titleOrig: row.titleOrig,
          whatItIs: row.whatItIs,
          businessSignal: row.businessSignal,
          indieTakeaway: row.indieTakeaway,
          metricsBadge: row.metricsBadge,
          tags: row.tags ?? [],
          sourcePlatform: row.sourcePlatform,
          existingTranslations: row.translations,
        },
        i
      );

      await db
        .update(signalItems)
        .set({ translations })
        .where(eq(signalItems.id, row.id));

      console.log(
        `  ✓ [多语补全 ${i + 1}/${missingRows.length}] ${row.titleZh.slice(0, 28)} -> EN: ${(translations.en?.title ?? "").slice(0, 36)}`
      );
    }
  }

  // 检查 daily_stats 表是否缺少多语种风向总结
  const statsList = await db
    .select()
    .from(dailyStats)
    .orderBy(desc(dailyStats.dateKey))
    .limit(30);

  for (const stat of statsList) {
    const st = stat.summaryTranslations ?? {};
    if (!st.en || !st.ja || !st["zh-TW"]) {
      const dayRows = await db
        .select()
        .from(signalItems)
        .where(eq(signalItems.dateKey, stat.dateKey))
        .orderBy(desc(signalItems.score));

      const dayItems: SignalItem[] = dayRows.map((row) => ({
        id: row.id,
        dateKey: row.dateKey,
        title: row.titleZh,
        titleZh: row.titleZh,
        titleOrig: row.titleOrig,
        category: row.category as SignalCategory,
        whatItIs: row.whatItIs,
        businessSignal: row.businessSignal,
        indieTakeaway: row.indieTakeaway,
        metricsBadge: row.metricsBadge,
        metricType: row.metricType as MetricType,
        tags: row.tags ?? [],
        translations: row.translations,
        score: row.score,
        isTopPick: row.isTopPick,
        sourcePlatform: row.sourcePlatform as SourcePlatform,
        sourceSublabel: row.sourceSublabel,
        sourceUrl: row.sourceUrl,
        publishedAt: row.publishedAt.toISOString(),
      }));

      const { summaryNote, summaryTranslations } =
        await generateDailyEditorialSummary(dayItems);

      await db
        .update(dailyStats)
        .set({
          summaryNote: stat.summaryNote || summaryNote,
          summaryTranslations,
          updatedAt: new Date(),
        })
        .where(eq(dailyStats.dateKey, stat.dateKey));

      console.log(`  ✓ [总评多语补全] ${stat.dateKey} 四语种主编速览已更新`);
    }
  }
}

async function main() {
  const backfillOnly = process.argv.includes("--backfill-only");
  const enrichLocal = process.argv.includes("--enrich-local");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  const db = hasDatabaseConfigured() ? getDb() : null;

  if (enrichLocal) {
    await enrichLocalDatasetFile();
  }

  if (backfillOnly) {
    if (!db) {
      console.log("ℹ️ 未配置 DATABASE_URL，跳过云端回填。");
      process.exit(0);
    }
    console.log("🌐 [IndieRadar] 启动云端历史记录四语种（简/繁/英/日）补全...");
    await backfillMissingTranslations(db);
    console.log("✅ 云端多语言数据回填全部完成！");
    process.exit(0);
  }

  console.log(
    `🚀 [IndieRadar] 开始同步 ${today} 海外商业信号（简/繁/英/日四语种）${
      process.env.HTTPS_PROXY
        ? ` (代理: ${redactUrlCredentials(process.env.HTTPS_PROXY)})`
        : ""
    }...`
  );

  const historicalUrls = new Set<string>();
  const todayExistingByUrl = new Map<string, SignalItem>();

  if (db) {
    try {
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
            title: row.titleZh,
            titleZh: row.titleZh,
            titleOrig: row.titleOrig,
            category: row.category as SignalCategory,
            whatItIs: row.whatItIs,
            businessSignal: row.businessSignal,
            indieTakeaway: row.indieTakeaway,
            metricsBadge: row.metricsBadge,
            metricType: row.metricType as MetricType,
            tags: row.tags ?? [],
            translations: row.translations,
            score: row.score,
            isTopPick: row.isTopPick,
            sourcePlatform: row.sourcePlatform as SourcePlatform,
            sourceSublabel: row.sourceSublabel,
            sourceUrl: row.sourceUrl,
            publishedAt: row.publishedAt.toISOString(),
          });
        } else {
          historicalUrls.add(row.sourceUrl);
        }
      }
    } catch (err) {
      console.warn("⚠️ 读取已存在 URL 缓存时跳过:", formatSafeError(err));
    }
  }

  resetScannedCandidatesCount();

  const [
    phItems,
    hnItems,
    ihItems,
    acqItems,
    trustItems,
    appStoreItems,
    githubItems,
    redditItems,
  ] = await Promise.all([
    fetchProductHuntFeed(4, historicalUrls),
    fetchHackerNewsShowHN(4, historicalUrls),
    fetchIndieHackers(4, historicalUrls),
    fetchAcquireListings(4, historicalUrls),
    fetchTrustMrr(10, historicalUrls),
    fetchAppStoreTopGrossing(10, historicalUrls),
    fetchGitHubTrending(10, 4, historicalUrls),
    fetchRedditSubreddits(
      ["SaaS", "microsaas", "SomebodyMakeThis"],
      2,
      historicalUrls
    ),
  ]);

  const allRaw = [
    ...phItems,
    ...hnItems,
    ...ihItems,
    ...acquireOrEmpty(acqItems),
    ...trustItems,
    ...appStoreItems,
    ...githubItems,
    ...redditItems,
  ];
  const rawScannedTotal = Math.max(getScannedCandidatesCount(), allRaw.length);

  console.log(
    `📡 已扫描 ${rawScannedTotal} 条海外一手动态，初筛命中 ${allRaw.length} 条 ` +
      `(PH: ${phItems.length}, ShowHN: ${hnItems.length}, IH: ${ihItems.length}, ` +
      `Acquire: ${acqItems.length}, TrustMRR: ${trustItems.length}, ` +
      `AppStore: ${appStoreItems.length}, GitHub: ${githubItems.length}, Reddit: ${redditItems.length})`
  );

  const uniqueMap = new Map<string, (typeof allRaw)[number]>();
  for (const item of allRaw) {
    if (!uniqueMap.has(item.url)) {
      uniqueMap.set(item.url, item);
    }
  }

  const deduped = Array.from(uniqueMap.values()).slice(0, 65);
  const newlyDistilled: SignalItem[] = [];
  let llmCallIndex = 0;

  for (let i = 0; i < deduped.length; i++) {
    const raw = deduped[i];
    const cachedToday = todayExistingByUrl.get(raw.url);
    if (cachedToday) {
      console.log(
        `  ↺ [${i + 1}/${deduped.length}] 复用今日已入库记录 (${raw.sourcePlatform}): ${cachedToday.titleZh.slice(0, 38)}`
      );
      continue;
    }

    const item = await distillRawItem(raw, today, llmCallIndex++);
    if (item.score < 6.3) {
      console.log(
        `  ⊘ [${i + 1}/${deduped.length}] 低分玩具/水贴已过滤 (${item.score.toFixed(1)}): ${raw.title.slice(0, 42)}`
      );
      continue;
    }

    newlyDistilled.push(item);
    console.log(
      `  ✓ [${i + 1}/${deduped.length}] [${item.sourcePlatform} · ${item.score.toFixed(1)}] ${item.titleZh.slice(0, 36)}`
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
          translations: item.translations ?? {},
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
            translations: sql`excluded.translations`,
            score: sql`excluded.score`,
            isTopPick: sql`excluded.is_top_pick`,
          },
        });
    }

    // 顺手补全库内早期缺少多语种字段的历史记录
    await backfillMissingTranslations(db);

    const todayAllRows = await db
      .select()
      .from(signalItems)
      .where(eq(signalItems.dateKey, today))
      .orderBy(desc(signalItems.score));

    const todayAllItems: SignalItem[] = todayAllRows.map((row) => ({
      id: row.id,
      dateKey: row.dateKey,
      title: row.titleZh,
      titleZh: row.titleZh,
      titleOrig: row.titleOrig,
      category: row.category as SignalCategory,
      whatItIs: row.whatItIs,
      businessSignal: row.businessSignal,
      indieTakeaway: row.indieTakeaway,
      metricsBadge: row.metricsBadge,
      metricType: row.metricType as MetricType,
      tags: row.tags ?? [],
      translations: row.translations,
      score: row.score,
      isTopPick: row.isTopPick,
      sourcePlatform: row.sourcePlatform as SourcePlatform,
      sourceSublabel: row.sourceSublabel,
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt.toISOString(),
    }));

    const { summaryNote, summaryTranslations } =
      await generateDailyEditorialSummary(todayAllItems);

    await db
      .insert(dailyStats)
      .values({
        dateKey: today,
        scannedCount: rawScannedTotal,
        selectedCount: todayAllItems.length,
        estimatedReadMinutes: Math.max(4, Math.ceil(todayAllItems.length / 3.5)),
        summaryNote,
        summaryTranslations,
      })
      .onConflictDoUpdate({
        target: dailyStats.dateKey,
        set: {
          scannedCount: rawScannedTotal,
          selectedCount: todayAllItems.length,
          estimatedReadMinutes: Math.max(
            4,
            Math.ceil(todayAllItems.length / 3.5)
          ),
          summaryNote,
          summaryTranslations,
          updatedAt: new Date(),
        },
      });

    console.log(
      `✅ 已成功同步至 Supabase PostgreSQL！（今日累计精选 ${todayAllItems.length} 条，本次新增 ${newlyDistilled.length} 条，四语种齐全）`
    );

    // 每日早报邮件推送（配置 RESEND_API_KEY 后自动生效，按订阅者语言发送 Top 5）
    await sendDailyNewsletterDigests({
      db,
      dateKey: today,
      allItems: todayAllItems,
      summaryNote,
      summaryTranslations,
    });

    // 自动向 IndexNow (Bing / Yandex / Naver / Seznam) 主动推送今日四语种新链接加速收录
    await pingIndexNow(today);
  } else {
    console.log(
      `ℹ️ 当前未配置 DATABASE_URL，本次抓取已完成验证（新增四语种提炼 ${newlyDistilled.length} 条）。`
    );
  }

  process.exit(0);
}

const INDEXNOW_KEY = "8f4c2e91b7d34a60c5e81239fa047b6d";

async function pingIndexNow(dateKey: string) {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://radar.aibuildon.com"
  ).replace(/\/$/, "");

  try {
    const host = new URL(siteUrl).hostname;
    if (host === "localhost" || host.endsWith(".vercel.app")) return;

    const locales = ["en", "zh", "zh-TW", "ja"];
    const urlList = [
      ...locales.map((loc) => `${siteUrl}/${loc}`),
      ...locales.map((loc) => `${siteUrl}/${loc}/daily/${dateKey}`),
    ];

    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${siteUrl}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok || res.status === 202) {
      console.log(
        `🔍 已通过 IndexNow 自动向 Bing 等搜索引擎推送 ${urlList.length} 条最新多语种 URL！`
      );
    }
  } catch {
    // IndexNow 推送失败不影响主流程
  }
}

function acquireOrEmpty<T>(arr: T[]): T[] {
  return Array.isArray(arr) ? arr : [];
}

main().catch((err) => {
  console.error("❌ 同步任务异常:", formatSafeError(err));
  process.exit(1);
});
