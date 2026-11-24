import { isSafePublicHttpUrl } from "@/lib/collectors/sources";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let activeCount = 0;
let lastLaunchAt = 0;
const waitQueue: Array<() => void> = [];

function getJinaConcurrency(): number {
  return process.env.JINA_API_KEY?.trim() ? 5 : 2;
}

function getJinaMinSpacingMs(): number {
  return process.env.JINA_API_KEY?.trim() ? 120 : 500;
}

async function acquireJinaSlot(): Promise<void> {
  const maxConcurrency = getJinaConcurrency();
  if (activeCount >= maxConcurrency) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  activeCount += 1;

  const spacingMs = getJinaMinSpacingMs();
  const waitMs = Math.max(0, lastLaunchAt + spacingMs - Date.now());
  lastLaunchAt = Date.now() + waitMs;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

function releaseJinaSlot(): void {
  activeCount = Math.max(0, activeCount - 1);
  const next = waitQueue.shift();
  if (next) next();
}

export async function fetchViaJinaMarkdown(
  targetUrl: string,
  timeoutMs = 14_000
): Promise<Response | null> {
  if (!isSafePublicHttpUrl(targetUrl)) {
    return null;
  }

  const jinaApiKey = process.env.JINA_API_KEY?.trim();
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "X-Return-Format": "markdown",
  };
  if (jinaApiKey) {
    headers.Authorization = `Bearer ${jinaApiKey}`;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    await acquireJinaSlot();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      releaseJinaSlot();

      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        await res.body?.cancel().catch(() => undefined);
        await sleep(3000);
        continue;
      }
      return res;
    } catch {
      clearTimeout(timer);
      releaseJinaSlot();
      if (attempt === 0) {
        await sleep(1500);
        continue;
      }
      return null;
    }
  }

  return null;
}
