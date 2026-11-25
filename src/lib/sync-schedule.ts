export const HOURLY_RECONCILE_CRON = "23 * * * *";
export const MORNING_PRIMARY_CRON = "23 23 * * *";
export const MORNING_BACKUP_CRON = "17 0 * * *";
export const MORNING_LATE_BACKUP_CRON = "13 1 * * *";
export const US_NIGHT_PDT_CRON = "33 6 * * *";
export const US_NIGHT_PST_CRON = "33 7 * * *";
export const MORNING_CATCHUP_BJT_HOURS = [8, 9, 10] as const;
export const MIN_HEALTHY_DAILY_SIGNALS = 10;

export function getShanghaiDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function getZonedHour(timeZone: string, date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

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
 * Evaluates whether a scheduled GitHub Actions cron invocation should run:
 * - Supports hourly state-reconciliation (`23 * * * *`) with strict quota protection:
 *   1) 07:xx Asia/Shanghai -> primary morning edition
 *   2) 23:xx America/Los_Angeles -> US late-night incremental supplement (auto-DST)
 *   3) 08/09/10 Asia/Shanghai -> bounded morning self-healing catch-up (skips if site/DB already live)
 *   4) All other hours -> 0-cost immediate skip
 * - Also preserves deterministic evaluation for explicit legacy cron slots.
 */
export function evaluateScheduleGate(params: {
  eventName?: string;
  scheduleCron?: string;
  gateApproved?: boolean;
  alreadyLiveOnSite?: boolean;
  now?: Date;
}): ScheduleGateDecision {
  const now = params.now ?? new Date();
  const eventName = (params.eventName ?? "").trim();
  const scheduleCron = (params.scheduleCron ?? "").trim();
  const usPacificOffsetHours = getUsPacificUtcOffsetHours(now);

  if (eventName === "schedule") {
    if (params.gateApproved) {
      return {
        shouldRun: true,
        reason: `已通过前置门禁放行 (${scheduleCron || HOURLY_RECONCILE_CRON})`,
        usPacificOffsetHours,
        isUsNightSupplement: getZonedHour("America/Los_Angeles", now) === 23,
        isMorningBackup: false,
      };
    }

    if (scheduleCron === HOURLY_RECONCILE_CRON) {
      const bjtHour = getZonedHour("Asia/Shanghai", now);
      const ptHour = getZonedHour("America/Los_Angeles", now);

      if (bjtHour === 7) {
        return {
          shouldRun: true,
          reason: "命中早盘主发刊窗口 (BJT 07:23)",
          usPacificOffsetHours,
          isUsNightSupplement: false,
          isMorningBackup: false,
        };
      }

      if (ptHour === 23) {
        return {
          shouldRun: true,
          reason: `命中美西深夜收官增量补采窗口 (23:23 PT, UTC${usPacificOffsetHours})`,
          usPacificOffsetHours,
          isUsNightSupplement: true,
          isMorningBackup: false,
        };
      }

      if (
        (MORNING_CATCHUP_BJT_HOURS as readonly number[]).includes(bjtHour)
      ) {
        if (params.alreadyLiveOnSite) {
          return {
            shouldRun: false,
            reason: `线上今日归档已就绪 (BJT ${bjtHour}:23)，0 消耗直接跳过`,
            usPacificOffsetHours,
            isUsNightSupplement: false,
            isMorningBackup: true,
          };
        }
        return {
          shouldRun: true,
          reason: `命中早盘自愈兜底窗口 (BJT ${bjtHour}:23)，启动幂等补跑检查`,
          usPacificOffsetHours,
          isUsNightSupplement: false,
          isMorningBackup: true,
        };
      }

      return {
        shouldRun: false,
        reason: `非发刊静默小时 (BJT ${bjtHour}:23, PT ${ptHour}:23)，0 消耗跳过`,
        usPacificOffsetHours,
        isUsNightSupplement: false,
        isMorningBackup: false,
      };
    }

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

    if (
      scheduleCron === MORNING_BACKUP_CRON ||
      scheduleCron === MORNING_LATE_BACKUP_CRON
    ) {
      return {
        shouldRun: true,
        reason: `早盘兜底防丢包调度 (${scheduleCron})`,
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
        ? `常规主调度 (${scheduleCron || HOURLY_RECONCILE_CRON})`
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
