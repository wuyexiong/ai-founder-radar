export const MORNING_PRIMARY_CRON = "23 23 * * *";
export const MORNING_BACKUP_CRON = "17 0 * * *";
export const US_NIGHT_PDT_CRON = "33 6 * * *";
export const US_NIGHT_PST_CRON = "33 7 * * *";

export interface ScheduleGateDecision {
  shouldRun: boolean;
  reason: string;
  usPacificOffsetHours: -7 | -8;
  isUsNightSupplement: boolean;
  isMorningBackup: boolean;
}

/**
 * Resolves the active UTC offset (-7 for PDT, -8 for PST) in America/Los_Angeles
 * at the given instant using ICU timeZoneName formatting.
 */
export function getUsPacificUtcOffsetHours(date: Date = new Date()): -7 | -8 {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const tzToken =
      parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
    if (tzToken.includes("-7")) {
      return -7;
    }
    return -8;
  } catch {
    return -8;
  }
}

/**
 * Evaluates whether a scheduled GitHub Actions cron invocation should run,
 * ensuring the US late-night supplement fires once per day around 23:33~23:50 PT
 * across both PDT (UTC-7) and PST (UTC-8) without crossing midnight reset twice.
 */
export function evaluateScheduleGate(params: {
  eventName?: string;
  scheduleCron?: string;
  now?: Date;
}): ScheduleGateDecision {
  const eventName = (params.eventName ?? "").trim();
  const scheduleCron = (params.scheduleCron ?? "").trim();
  const usPacificOffsetHours = getUsPacificUtcOffsetHours(params.now);

  if (eventName === "schedule") {
    if (scheduleCron === US_NIGHT_PDT_CRON) {
      if (usPacificOffsetHours === -7) {
        return {
          shouldRun: true,
          reason:
            "美西当前为夏令时 (PDT, UTC-7)，执行 23:33 PT 深夜全量增量补采",
          usPacificOffsetHours,
          isUsNightSupplement: true,
          isMorningBackup: false,
        };
      }
      return {
        shouldRun: false,
        reason:
          "美西当前为冬令时 (PST, UTC-8)，跳过夏令时槽位 (33 6 * * *)，交由 33 7 * * * 执行",
        usPacificOffsetHours,
        isUsNightSupplement: true,
        isMorningBackup: false,
      };
    }

    if (scheduleCron === US_NIGHT_PST_CRON) {
      if (usPacificOffsetHours === -8) {
        return {
          shouldRun: true,
          reason:
            "美西当前为冬令时 (PST, UTC-8)，执行 23:33 PT 深夜全量增量补采",
          usPacificOffsetHours,
          isUsNightSupplement: true,
          isMorningBackup: false,
        };
      }
      return {
        shouldRun: false,
        reason:
          "美西当前为夏令时 (PDT, UTC-7)，已由 33 6 * * * 完成补采，跳过冬令时槽位 (33 7 * * *)",
        usPacificOffsetHours,
        isUsNightSupplement: true,
        isMorningBackup: false,
      };
    }

    if (scheduleCron === MORNING_BACKUP_CRON) {
      return {
        shouldRun: true,
        reason: "早盘兜底防丢包调度 (17 0 * * *)",
        usPacificOffsetHours,
        isUsNightSupplement: false,
        isMorningBackup: true,
      };
    }
  }

  return {
    shouldRun: true,
    reason:
      eventName === "schedule"
        ? `常规主调度 (${scheduleCron || MORNING_PRIMARY_CRON})`
        : "手动或本地直接触发同步",
    usPacificOffsetHours,
    isUsNightSupplement: false,
    isMorningBackup: false,
  };
}

export interface IncrementalSyncPlan {
  collectorExcludeUrls: Set<string>;
  appStoreLimit: number;
  todayExistingCount: number;
  todayAppStoreCount: number;
  isSupplementRun: boolean;
}

/**
 * Builds per-run deduplication & source quota plan:
 * 1. Merges historical URLs + today's already-ingested URLs into `collectorExcludeUrls`
 *    so afternoon/late-night supplement runs spend 100% of collector quotas on newly
 *    emerged signals rather than re-fetching morning items.
 * 2. Caps static App Store Top Grossing charts to once per day once today already has
 *    App Store entries, avoiding pagination down into ranks #11-#20 on supplement runs.
 */
export function buildIncrementalSyncPlan(params: {
  historicalUrls: Iterable<string>;
  todayRows: ReadonlyArray<{ sourceUrl: string; sourcePlatform: string }>;
  defaultAppStoreLimit?: number;
}): IncrementalSyncPlan {
  const defaultAppStoreLimit = params.defaultAppStoreLimit ?? 10;
  const collectorExcludeUrls = new Set<string>(params.historicalUrls);
  let todayAppStoreCount = 0;

  for (const row of params.todayRows) {
    if (row.sourceUrl) {
      collectorExcludeUrls.add(row.sourceUrl);
    }
    if (row.sourcePlatform === "appstore") {
      todayAppStoreCount += 1;
    }
  }

  const todayExistingCount = params.todayRows.length;
  const isSupplementRun = todayExistingCount > 0;
  const appStoreLimit = todayAppStoreCount > 0 ? 0 : defaultAppStoreLimit;

  return {
    collectorExcludeUrls,
    appStoreLimit,
    todayExistingCount,
    todayAppStoreCount,
    isSupplementRun,
  };
}

/**
 * Accumulates daily `scannedCount` when a supplement run contributes new signals,
 * without inflating the counter on repeated zero-addition manual runs.
 */
export function computeMergedScannedCount(params: {
  previousScannedCount?: number | null;
  currentScannedCount: number;
  newlyDistilledCount: number;
}): number {
  const prev = params.previousScannedCount ?? 0;
  const curr = Math.max(0, params.currentScannedCount);
  if (prev <= 0) {
    return curr;
  }
  if (params.newlyDistilledCount > 0) {
    return prev + curr;
  }
  return Math.max(prev, curr);
}
