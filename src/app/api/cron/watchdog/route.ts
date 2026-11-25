import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabaseConfigured } from "@/db";
import { dailyStats } from "@/db/schema";
import { LOCALES } from "@/i18n/config";
import {
  isAuthorizedRevalidateToken,
  SIGNALS_CORPUS_CACHE_TAG,
} from "@/lib/revalidate";
import { clearSignalsRepoMemoryCache } from "@/lib/signals-repo";
import {
  getShanghaiDateKey,
  MIN_HEALTHY_DAILY_SIGNALS,
} from "@/lib/sync-schedule";

const DEFAULT_GITHUB_REPOSITORY = "wuyexiong/ai-founder-radar";
const GITHUB_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const WORKFLOW_FILE = "radar-cron.yml";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function resolveAuthorizedWatchdogRequest(authHeader: string | null): {
  configured: boolean;
  authorized: boolean;
} {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const revalidateSecret = process.env.REVALIDATE_SECRET?.trim();

  if (!cronSecret && !revalidateSecret) {
    return { configured: false, authorized: false };
  }

  const authorized =
    (Boolean(cronSecret) &&
      isAuthorizedRevalidateToken(authHeader, cronSecret)) ||
    (Boolean(revalidateSecret) &&
      isAuthorizedRevalidateToken(authHeader, revalidateSecret));

  return { configured: true, authorized };
}

function resolveSafeGitHubRepo(): string {
  const raw = process.env.GITHUB_REPOSITORY?.trim();
  if (raw && GITHUB_REPO_RE.test(raw)) {
    return raw;
  }
  return DEFAULT_GITHUB_REPOSITORY;
}

async function handleWatchdog(request: NextRequest) {
  const auth = resolveAuthorizedWatchdogRequest(
    request.headers.get("authorization")
  );

  if (!auth.configured) {
    return NextResponse.json(
      { ok: false, code: "WATCHDOG_NOT_CONFIGURED" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const db = getDb();
  if (!db || !hasDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, code: "DB_NOT_CONFIGURED" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const today = getShanghaiDateKey();
  let selectedCount = 0;

  try {
    const rows = await db
      .select({ selectedCount: dailyStats.selectedCount })
      .from(dailyStats)
      .where(eq(dailyStats.dateKey, today))
      .limit(1);
    selectedCount = rows[0]?.selectedCount ?? 0;
  } catch {
    return NextResponse.json(
      { ok: false, code: "DB_QUERY_FAILED", dateKey: today },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const isDryRunDispatch =
    request.nextUrl.searchParams.get("dryRun") === "1" ||
    request.nextUrl.searchParams.get("dryRun") === "true";

  if (selectedCount >= MIN_HEALTHY_DAILY_SIGNALS && !isDryRunDispatch) {
    clearSignalsRepoMemoryCache();
    try {
      revalidateTag(SIGNALS_CORPUS_CACHE_TAG);
      for (const loc of LOCALES) {
        revalidatePath(`/${loc}`);
      }
    } catch {
      // Standalone test runtime without Next.js incrementalCache store
    }

    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        dateKey: today,
        selectedCount,
        dispatched: false,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const dispatchToken = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!dispatchToken) {
    return NextResponse.json(
      {
        ok: false,
        status: "stale_missing_dispatch_token",
        code: "DISPATCH_TOKEN_NOT_CONFIGURED",
        dateKey: today,
        selectedCount,
        dispatched: false,
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const repo = resolveSafeGitHubRepo();
  const dispatchUrl = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const dispatchPayload = isDryRunDispatch
    ? { ref: "main", inputs: { reconcile_only: "true" } }
    : { ref: "main" };

  try {
    const res = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dispatchToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "ai-founder-radar-watchdog",
      },
      body: JSON.stringify(dispatchPayload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "dispatch_failed",
          code: "GITHUB_DISPATCH_HTTP_ERROR",
          upstreamStatus: res.status,
          dateKey: today,
          selectedCount,
          dispatched: false,
        },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        status: "dispatched_recovery",
        dateKey: today,
        selectedCount,
        dispatched: true,
        repository: repo,
        workflow: WORKFLOW_FILE,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "dispatch_failed",
        code: "GITHUB_DISPATCH_NETWORK_ERROR",
        dateKey: today,
        selectedCount,
        dispatched: false,
      },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleWatchdog(request);
}

export async function POST(request: NextRequest) {
  return handleWatchdog(request);
}
