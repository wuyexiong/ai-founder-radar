import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  collectRevalidatePaths,
  isAuthorizedRevalidateToken,
  SIGNALS_CORPUS_CACHE_TAG,
} from "@/lib/revalidate";
import { clearSignalsRepoMemoryCache } from "@/lib/signals-repo";

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, code: "REVALIDATE_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (
    !isAuthorizedRevalidateToken(request.headers.get("authorization"), secret)
  ) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // 空 body 同样合法，默认刷新四语种首页、归档模板与 sitemap
  }

  const dateKey = typeof body.dateKey === "string" ? body.dateKey : undefined;
  const previousDateKey =
    typeof body.previousDateKey === "string" ? body.previousDateKey : undefined;

  const paths = collectRevalidatePaths(dateKey, previousDateKey);
  clearSignalsRepoMemoryCache();
  revalidateTag(SIGNALS_CORPUS_CACHE_TAG);
  for (const p of paths) {
    revalidatePath(p);
  }
  // 同时失效所有历史归档页与程序化 SEO 专题模板，确保新信号与日期箭头立即生效
  revalidatePath("/[locale]/daily/[date]", "page");
  revalidatePath("/[locale]/topic/[tag]", "page");
  revalidatePath("/[locale]/source/[platform]", "page");

  return NextResponse.json(
    {
      ok: true,
      revalidatedTag: SIGNALS_CORPUS_CACHE_TAG,
      revalidated: [
        ...paths,
        "/[locale]/daily/[date]",
        "/[locale]/topic/[tag]",
        "/[locale]/source/[platform]",
      ],
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
