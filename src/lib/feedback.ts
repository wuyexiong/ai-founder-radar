export const FEEDBACK_TYPES = [
  "suggestion",
  "bug",
  "source",
  "other",
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_MIN_LENGTH = 4;
export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_MAX_CONTACT_LENGTH = 160;
export const FEEDBACK_MAX_PATH_LENGTH = 240;
export const FEEDBACK_RATE_WINDOW_MS = 10 * 60 * 1000;
export const MAX_FEEDBACK_PER_WINDOW = 8;

const ipBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetFeedbackRateLimitForTests(): void {
  ipBuckets.clear();
}

export function checkFeedbackMemoryRateLimit(bucketKey: string): boolean {
  const now = Date.now();
  if (ipBuckets.size > 2000) {
    for (const [k, v] of ipBuckets) {
      if (v.resetAt <= now) ipBuckets.delete(k);
    }
  }
  const existing = ipBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    ipBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + FEEDBACK_RATE_WINDOW_MS,
    });
    return true;
  }
  if (existing.count >= MAX_FEEDBACK_PER_WINDOW) {
    return false;
  }
  existing.count += 1;
  return true;
}

export function isValidFeedbackType(raw: unknown): raw is FeedbackType {
  return (
    typeof raw === "string" &&
    (FEEDBACK_TYPES as readonly string[]).includes(raw)
  );
}

export function sanitizeFeedbackMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (
    cleaned.length < FEEDBACK_MIN_LENGTH ||
    cleaned.length > FEEDBACK_MAX_LENGTH
  ) {
    return null;
  }
  return cleaned;
}

export function sanitizeFeedbackContact(
  raw: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false };
  }
  const cleaned = raw.replace(/[\r\n\0]/g, " ").trim();
  if (!cleaned) {
    return { ok: true, value: null };
  }
  if (cleaned.length > FEEDBACK_MAX_CONTACT_LENGTH) {
    return { ok: false };
  }
  return { ok: true, value: cleaned };
}

export function sanitizeFeedbackPagePath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.replace(/[\r\n\0\t]/g, "").trim();
  if (!trimmed) return "/";

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed.slice(0, FEEDBACK_MAX_PATH_LENGTH);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const combined = `${parsed.pathname || "/"}${parsed.search || ""}`;
      return combined.startsWith("/") && !combined.startsWith("//")
        ? combined.slice(0, FEEDBACK_MAX_PATH_LENGTH)
        : "/";
    }
  } catch {
    // ignore malformed URL and fall back to root path
  }

  return "/";
}
