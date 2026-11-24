/**
 * Offline Test Environment Guard
 * - Purges all external API keys, database URLs, and proxy vars so tests never touch live infra.
 * - Replaces globalThis.fetch with a fail-fast interceptor unless a test explicitly installs a mock.
 */

export const CLEARED_ENV_KEYS = [
  "DATABASE_URL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "RAPID_MLX_URL",
  "RAPID_MLX_MODEL",
  "OLLAMA_MODEL",
  "OLLAMA_BASE_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "JINA_API_KEY",
  "REVALIDATE_SECRET",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
] as const;

export interface RecordedFetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string | null;
}

export type MockFetchHandler = (
  url: string,
  init: RequestInit | undefined,
  call: RecordedFetchCall
) => Promise<Response> | Response;

function extractHeadersRecord(headers?: HeadersInit): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) return record;
  const h = new Headers(headers);
  h.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function resolveRequestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export const failFastFetch: typeof globalThis.fetch = async (
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  const url = resolveRequestUrl(input);
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");
  throw new Error(
    `[env-guard] Blocked unmocked external fetch in offline test suite: ${method} ${url}`
  );
};

export function sanitizeTestEnv(): void {
  for (const key of CLEARED_ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CI = "true";
}

export function installFailFastFetch(): void {
  globalThis.fetch = failFastFetch;
}

export function resetOfflineTestGuard(): void {
  sanitizeTestEnv();
  installFailFastFetch();
}

export function installFetchMock(handler: MockFetchHandler): {
  calls: RecordedFetchCall[];
  restore: () => void;
} {
  const calls: RecordedFetchCall[] = [];

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = resolveRequestUrl(input);
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const headers = extractHeadersRecord(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    const bodyText =
      typeof init?.body === "string"
        ? init.body
        : init?.body
          ? String(init.body)
          : null;

    const call: RecordedFetchCall = { url, method, headers, bodyText };
    calls.push(call);
    return await handler(url, init, call);
  };

  return {
    calls,
    restore: () => {
      installFailFastFetch();
    },
  };
}

export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T> | T
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, val] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, prev] of previous.entries()) {
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  }
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

export function textResponse(
  body: string,
  status = 200,
  contentType = "text/plain; charset=utf-8",
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      ...extraHeaders,
    },
  });
}

// Activate immediately upon import
resetOfflineTestGuard();
