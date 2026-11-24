import { NextResponse, type NextRequest } from "next/server";
import {
  detectPreferredLocale,
  isPlausibleArchiveDate,
  isValidLocale,
  LOCALE_COOKIE,
} from "@/i18n/config";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  // 1. 根路径 "/"（含旧版 /?date=YYYY-MM-DD 链接）：按 Cookie -> Accept-Language -> 默认 /en 跳转
  if (!firstSegment) {
    const preferred = detectPreferredLocale(
      request.headers.get("accept-language"),
      request.cookies.get(LOCALE_COOKIE)?.value
    );
    const legacyDate = searchParams.get("date");
    const targetPath =
      legacyDate && isPlausibleArchiveDate(legacyDate)
        ? `/${preferred}/daily/${legacyDate}`
        : `/${preferred}`;

    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    url.searchParams.delete("date");

    const response = NextResponse.redirect(url, 307);
    response.headers.set("Vary", "Accept-Language, Cookie");
    return response;
  }

  // 2. 兼容无语言前缀的 /daily/YYYY-MM-DD
  if (firstSegment === "daily") {
    const preferred = detectPreferredLocale(
      request.headers.get("accept-language"),
      request.cookies.get(LOCALE_COOKIE)?.value
    );
    const url = request.nextUrl.clone();
    url.pathname = `/${preferred}${pathname}`;
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Vary", "Accept-Language, Cookie");
    return response;
  }

  // 3. 兼容 /[locale]?date=YYYY-MM-DD 跳转至独立静态归档路由
  if (isValidLocale(firstSegment)) {
    const legacyDate = searchParams.get("date");
    if (segments.length === 1 && legacyDate && isPlausibleArchiveDate(legacyDate)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/daily/${legacyDate}`;
      url.searchParams.delete("date");
      return NextResponse.redirect(url, 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
