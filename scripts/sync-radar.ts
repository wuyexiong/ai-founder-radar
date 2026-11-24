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
import { buildIndexNowUrlList } from "../src/lib/revalidate";
import {
  buildIncrementalSyncPlan,
  computeMergedScannedCount,
  evaluateScheduleGate,
} from "../src/lib/sync-schedule";
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

      const translated = await translateExistingSignalRow(
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
      if (translated.changed) {
        item.translations = translated.translations;
      }
      console.log(
        `  ${translated.translatedByLlm ? "✓" : "⚠️"} [本地样本 ${i + 1}/${dataset.items.length}] ${item.id} -> ${(item.translations?.en?.title ?? "未完成").slice(0, 40)}`
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
      const result = await translateExistingSignalRow(
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

      if (result.changed) {
        await db
          .update(signalItems)
          .set({ translations: result.translations })
          .where(eq(signalItems.id, row.id));
      }

      if (result.translatedByLlm) {
        console.log(
          `  ✓ [多语补全 ${i + 1}/${missingRows.length}] ${row.titleZh.slice(0, 28)} -> EN: ${(result.translations.en?.title ?? "").slice(0, 36)}`
        );
      } else {
        console.warn(
          `  ⚠️ [多语补全跳过 ${i + 1}/${missingRows.length}] LLM 未返回有效英/日翻译，保留原状态待下次重试: ${row.titleZh.slice(0, 28)}`
        );
      }
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
  const scheduleGate = evaluateScheduleGate({
    eventName: process.env.GITHUB_EVENT_NAME,
    scheduleCron: process.env.GITHUB_SCHEDULE_CRON,
  });

  if (!backfillOnly && !enrichLocal && !scheduleGate.shouldRun) {
    console.log(`⏭️ [AI Founder Radar] ${scheduleGate.reason}`);
    process.exit(0);
  }

  const skipIfTodaySynced =
    process.argv.includes("--skip-if-synced") ||
    process.env.SKIP_IF_TODAY_SYNCED?.trim().toLowerCase() === "true";
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
    console.log("🌐 [AI Founder Radar] 启动云端历史记录四语种（简/繁/英/日）补全...");
    await backfillMissingTranslations(db);
    console.log("✅ 云端多语言数据回填全部完成！");
    process.exit(0);
  }

  if (skipIfTodaySynced && db) {
    try {
      const existingDaily = await db
        .select({ selectedCount: dailyStats.selectedCount })
        .from(dailyStats)
        .where(eq(dailyStats.dateKey, today))
        .limit(1);

      const count = existingDaily[0]?.selectedCount ?? 0;
      if (count >= 10) {
        console.log(
          `⏭️ [AI Founder Radar] 兜底调度检测到今日 (${today}) 已成功同步 ${count} 条商业信号，直接跳过（0 抓取 / 0 LLM 消耗）。`
        );
        process.exit(0);
      }
      console.log(
        `🔄 [AI Founder Radar] 兜底调度检测到今日 (${today}) 尚未完成同步（当前 ${count} 条），自动触发补跑...`
      );
    } catch (err) {
      console.warn(
        "⚠️ 检查今日同步状态失败，继续执行完整同步:",
        formatSafeError(err)
      );
    }
  }

  console.log(
    `🚀 [AI Founder Radar] 开始同步 ${today} 海外商业信号（简/繁/英/日四语种）${
      process.env.HTTPS_PROXY
        ? ` (代理: ${redactUrlCredentials(process.env.HTTPS_PROXY)})`
        : ""
    }...`
  );

  const historicalUrls = new Set<string>();
  const todayExistingByUrl = new Map<string, SignalItem>();
  let existingTodayStat: typeof dailyStats.$inferSelect | undefined;

  if (db) {
    try {
      // 全量轻量读取所有历史 URL 用于跨日防重（避免 500 条截断后重复消耗 LLM 额度）
      const [allUrlRows, todayRows, todayStatRows] = await Promise.all([
        db
          .select({
            sourceUrl: signalItems.sourceUrl,
            dateKey: signalItems.dateKey,
          })
          .from(signalItems),
        db
          .select()
          .from(signalItems)
          .where(eq(signalItems.dateKey, today)),
        db
          .select()
          .from(dailyStats)
          .where(eq(dailyStats.dateKey, today))
          .limit(1),
      ]);

      existingTodayStat = todayStatRows[0];

      for (const row of allUrlRows) {
        if (row.dateKey !== today) {
          historicalUrls.add(row.sourceUrl);
        }
      }

      for (const row of todayRows) {
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
      }
    } catch (err) {
      console.warn("⚠️ 读取已存在 URL 缓存时跳过:", formatSafeError(err));
    }
  }

  const syncPlan = buildIncrementalSyncPlan({
    historicalUrls,
    todayRows: Array.from(todayExistingByUrl.values()),
    defaultAppStoreLimit: 10,
  });

  if (syncPlan.isSupplementRun) {
    console.log(
      `🔄 [增量补采模式] 今日已收录 ${syncPlan.todayExistingCount} 条信号（自动并入去重池释放抓取配额${
        syncPlan.appStoreLimit === 0
          ? `；今日已有 ${syncPlan.todayAppStoreCount} 条 App Store 记录，跳过静态榜顺延翻页`
          : ""
      }）。`
    );
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
    fetchProductHuntFeed(4, syncPlan.collectorExcludeUrls),
    fetchHackerNewsShowHN(4, syncPlan.collectorExcludeUrls),
    fetchIndieHackers(4, syncPlan.collectorExcludeUrls),
    fetchAcquireListings(4, syncPlan.collectorExcludeUrls),
    fetchTrustMrr(10, syncPlan.collectorExcludeUrls),
    syncPlan.appStoreLimit > 0
      ? fetchAppStoreTopGrossing(
          syncPlan.appStoreLimit,
          syncPlan.collectorExcludeUrls
        )
      : Promise.resolve([]),
    fetchGitHubTrending(10, 4, syncPlan.collectorExcludeUrls),
    fetchRedditSubreddits(
      ["SaaS", "microsaas", "SomebodyMakeThis"],
      2,
      syncPlan.collectorExcludeUrls
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
  let llmAttempted = 0;
  let llmFailed = 0;

  if (rawScannedTotal === 0) {
    console.error("❌ 所有 8 个上游信源扫描结果均为 0，疑似网络中断或全线上游异常！");
    process.exit(1);
  }

  for (let i = 0; i < deduped.length; i++) {
    const raw = deduped[i];
    const cachedToday = todayExistingByUrl.get(raw.url);
    if (cachedToday) {
      console.log(
        `  ↺ [${i + 1}/${deduped.length}] 复用今日已入库记录 (${raw.sourcePlatform}): ${cachedToday.titleZh.slice(0, 38)}`
      );
      continue;
    }

    llmAttempted++;
    const { item, usedLlm } = await distillRawItem(raw, today, llmCallIndex++);
    if (!usedLlm) {
      llmFailed++;
      console.warn(
        `  ⚠️ [${i + 1}/${deduped.length}] LLM 提炼失败，拒绝写入未提炼占位数据: ${raw.title.slice(0, 42)}`
      );
      continue;
    }

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

  if (llmAttempted > 0 && llmFailed === llmAttempted && newlyDistilled.length === 0) {
    console.error(
      `❌ 本次共尝试提炼 ${llmAttempted} 条候选信号，全部遭遇 LLM 失败（密钥失效、配额耗尽或接口超时），终止入库以防脏数据！`
    );
    process.exit(1);
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

    if (todayAllItems.length === 0) {
      console.warn(
        `⚠️ 今日 (${today}) 尚无达到精选分数线 (>= 6.3) 的商业信号，跳过 daily_stats 看板更新。`
      );
      process.exit(0);
    }

    const hasCompleteExistingSummary = Boolean(
      existingTodayStat?.summaryNote &&
        existingTodayStat.summaryTranslations?.en &&
        existingTodayStat.summaryTranslations?.ja &&
        existingTodayStat.summaryTranslations?.["zh-TW"]
    );

    const { summaryNote, summaryTranslations } =
      newlyDistilled.length === 0 && hasCompleteExistingSummary
        ? {
            summaryNote: existingTodayStat!.summaryNote,
            summaryTranslations: existingTodayStat!.summaryTranslations!,
          }
        : await generateDailyEditorialSummary(todayAllItems);

    const mergedScannedCount = computeMergedScannedCount({
      previousScannedCount: existingTodayStat?.scannedCount,
      currentScannedCount: rawScannedTotal,
      newlyDistilledCount: newlyDistilled.length,
    });

    await db
      .insert(dailyStats)
      .values({
        dateKey: today,
        scannedCount: mergedScannedCount,
        selectedCount: todayAllItems.length,
        estimatedReadMinutes: Math.max(4, Math.ceil(todayAllItems.length / 3.5)),
        summaryNote,
        summaryTranslations,
      })
      .onConflictDoUpdate({
        target: dailyStats.dateKey,
        set: {
          scannedCount: mergedScannedCount,
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
      `✅ 已成功同步至 Supabase PostgreSQL！（今日累计扫描 ${mergedScannedCount} 条、精选 ${todayAllItems.length} 条，本次新增 ${newlyDistilled.length} 条，四语种齐全）`
    );

    const shouldRefreshWebAndSearch =
      newlyDistilled.length > 0 || !existingTodayStat;

    if (shouldRefreshWebAndSearch) {
      const recentDateRows = await db
        .select({ dateKey: dailyStats.dateKey })
        .from(dailyStats)
        .orderBy(desc(dailyStats.dateKey))
        .limit(2);
      const previousDateKey = recentDateRows.find(
        (r) => r.dateKey !== today
      )?.dateKey;

      // 主动触发 Vercel On-Demand Revalidation，确保首页、昨日归档页日期箭头与 sitemap 秒级生效
      await triggerOnDemandRevalidate(today, previousDateKey);
    } else {
      console.log(
        "ℹ️ 本次补采无新增入库条目，保留现有线上缓存与 IndexNow 状态。"
      );
    }

    // 每日早报邮件推送（配置 RESEND_API_KEY 后自动生效；按 lastSentDate 防重，下午补采不会向已发订阅者重复群发）
    await sendDailyNewsletterDigests({
      db,
      dateKey: today,
      allItems: todayAllItems,
      summaryNote,
      summaryTranslations,
    });

    if (shouldRefreshWebAndSearch) {
      // 自动向 IndexNow (Bing / Yandex / Naver / Seznam) 主动推送今日四语种首页、归档页及命中的常青专题/信源页
      await pingIndexNow(
        today,
        newlyDistilled.length > 0 ? newlyDistilled : todayAllItems
      );
    }
  } else {
    console.log(
      `ℹ️ 当前未配置 DATABASE_URL，本次抓取已完成验证（新增四语种提炼 ${newlyDistilled.length} 条）。`
    );
  }

  process.exit(0);
}

const INDEXNOW_KEY = "8f4c2e91b7d34a60c5e81239fa047b6d";

async function triggerOnDemandRevalidate(
  dateKey: string,
  previousDateKey?: string
) {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (!secret) {
    console.log(
      "ℹ️ 未配置 REVALIDATE_SECRET，跳过主动缓存刷新（线上首页将按 ISR 周期自动更新）。"
    );
    return;
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://radar.aibuildon.com"
  ).replace(/\/$/, "");

  try {
    const res = await fetch(`${siteUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dateKey, previousDateKey }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      console.log(
        `⚡ 已触发线上按需缓存刷新 (${siteUrl}/api/revalidate)，首页与归档日期切换已即时生效！`
      );
      // 顺手预热四语种首页，确保首位访问用户即命中最新 Edge 缓存
      const locales = ["en", "zh", "zh-TW", "ja"];
      await Promise.allSettled(
        locales.map((loc) =>
          fetch(`${siteUrl}/${loc}`, {
            method: "GET",
            signal: AbortSignal.timeout(10_000),
          })
        )
      );
    } else {
      console.warn(`⚠️ 主动缓存刷新返回 HTTP ${res.status}，将回退至 ISR 自动刷新。`);
    }
  } catch (err) {
    console.warn("⚠️ 主动缓存刷新请求失败（不影响主流程）:", formatSafeError(err));
  }
}

async function pingIndexNow(dateKey: string, syncedItems: SignalItem[] = []) {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://radar.aibuildon.com"
  ).replace(/\/$/, "");

  try {
    const host = new URL(siteUrl).hostname;
    if (host === "localhost" || host.endsWith(".vercel.app")) return;

    const urlList = buildIndexNowUrlList({
      siteUrl,
      dateKey,
      items: syncedItems,
    });

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
