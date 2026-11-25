"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import type { Locale } from "@/i18n/config";
import { getCardLensLabels, getDictionary } from "@/i18n/dictionaries";
import { trackRadarEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  copyCanvasImageToClipboard,
  downloadCanvasPng,
  renderXShareCardToCanvas,
  type XCardTheme,
} from "@/lib/x-card-canvas";
import {
  buildXIntentUrl,
  buildXShareBundle,
  measureXTextWeight,
  X_SHARE_MODES,
  type XShareMode,
} from "@/lib/x-share";
import type { SignalItem, SourcePlatform } from "@/types/signal";

const X_CARD_THEME_STORAGE_KEY = "afr-x-card-theme";

const PLATFORM_DISPLAY_LABELS: Record<SourcePlatform, string> = {
  producthunt: "Product Hunt",
  hackernews: "Hacker News",
  indiehackers: "Indie Hackers",
  acquire: "Acquire.com",
  reddit: "Reddit",
  github: "GitHub",
  trustmrr: "TrustMRR",
  appstore: "App Store",
};

export function XBrandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy textarea copy
  }

  if (typeof document !== "undefined") {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

function resolveClientOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://radar.aibuildon.com";
}

function extractHostDisplay(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "radar.aibuildon.com";
  }
}

export interface XShareModalProps {
  open: boolean;
  onClose: () => void;
  item: SignalItem;
  locale: Locale;
  placement?: "card" | "detail";
}

export function XShareModal({
  open,
  onClose,
  item,
  locale,
  placement = "card",
}: XShareModalProps) {
  const titleId = useId();
  const editorId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dict = useMemo(() => getDictionary(locale), [locale]);
  const xDict = dict.xShare;
  const lens = useMemo(
    () => getCardLensLabels(dict.card, item.category),
    [dict.card, item.category]
  );

  const [mode, setMode] = useState<XShareMode>("no_link_post");
  const [cardTheme, setCardTheme] = useState<XCardTheme>("terminal_dark");
  const [customDrafts, setCustomDrafts] = useState<
    Partial<Record<XShareMode, string>>
  >({});
  const [textCopied, setTextCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<
    "idle" | "copied" | "downloaded"
  >("idle");
  const [post1Acted, setPost1Acted] = useState(false);

  const origin = useMemo(() => resolveClientOrigin(), []);
  const siteHost = useMemo(() => extractHostDisplay(origin), [origin]);
  const bundle = useMemo(
    () =>
      buildXShareBundle({
        item,
        locale,
        lens,
        siteUrl: origin,
      }),
    [item, locale, lens, origin]
  );

  // 读取用户偏好的卡片配图风格
  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem(X_CARD_THEME_STORAGE_KEY);
      if (stored === "editorial_light" || stored === "terminal_dark") {
        setCardTheme(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, [open]);

  // 切换卡片或重新打开时重置编辑态
  useEffect(() => {
    if (!open) return;
    setMode("no_link_post");
    setCustomDrafts({});
    setTextCopied(false);
    setImageStatus("idle");
    setPost1Acted(false);
  }, [open, item.id, locale]);

  // 锁定页面滚动并支持 Escape 关闭
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
      if (imgTimerRef.current) clearTimeout(imgTimerRef.current);
    };
  }, [open, onClose]);

  // 实时渲染 16:9 高清 Canvas 商业拆解卡片
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const categoryLabel =
      dict.card.categories[item.category] ?? dict.card.categories.launch;
    const platformLabel =
      PLATFORM_DISPLAY_LABELS[item.sourcePlatform] ?? item.sourcePlatform;

    renderXShareCardToCanvas(canvasRef.current, {
      item,
      locale,
      platformLabel,
      categoryLabel,
      lens,
      theme: cardTheme,
      siteHost,
      xHandle: bundle.xHandle,
    });
  }, [
    open,
    item,
    locale,
    dict.card.categories,
    lens,
    cardTheme,
    siteHost,
    bundle.xHandle,
  ]);

  if (!open) return null;

  const activeText = customDrafts[mode] ?? bundle.drafts[mode];
  const isEdited =
    customDrafts[mode] !== undefined &&
    customDrafts[mode] !== bundle.drafts[mode];
  const metrics = measureXTextWeight(activeText);
  const modeMeta = xDict.modes[mode];
  const pngFilename = `afr-${item.id}-${cardTheme === "terminal_dark" ? "dark" : "light"}.png`;

  const handleSelectTheme = (nextTheme: XCardTheme) => {
    setCardTheme(nextTheme);
    setImageStatus("idle");
    try {
      localStorage.setItem(X_CARD_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // ignore storage errors
    }
  };

  const handleCopyImage = async () => {
    if (!canvasRef.current) return;
    const result = await copyCanvasImageToClipboard(
      canvasRef.current,
      pngFilename
    );
    if (result === "copied" || result === "downloaded") {
      setImageStatus(result);
      trackRadarEvent("signal_share_x", {
        signal_id: item.id,
        platform: item.sourcePlatform,
        category: item.category,
        locale,
        action: result === "copied" ? "copy_image" : "download_image",
        theme: cardTheme,
        placement,
      });
      if (imgTimerRef.current) clearTimeout(imgTimerRef.current);
      imgTimerRef.current = setTimeout(() => {
        setImageStatus("idle");
      }, 2600);
    }
  };

  const handleDownloadImage = () => {
    if (!canvasRef.current) return;
    downloadCanvasPng(canvasRef.current, pngFilename);
    setImageStatus("downloaded");
    trackRadarEvent("signal_share_x", {
      signal_id: item.id,
      platform: item.sourcePlatform,
      category: item.category,
      locale,
      action: "download_image",
      theme: cardTheme,
      placement,
    });
    if (imgTimerRef.current) clearTimeout(imgTimerRef.current);
    imgTimerRef.current = setTimeout(() => {
      setImageStatus("idle");
    }, 2200);
  };

  const handleCopyText = async () => {
    const ok = await copyTextSafe(activeText);
    if (!ok) return;

    setTextCopied(true);
    if (mode === "no_link_post") {
      setPost1Acted(true);
    }
    trackRadarEvent("signal_share_x", {
      signal_id: item.id,
      platform: item.sourcePlatform,
      category: item.category,
      locale,
      action: "copy_text",
      mode,
      placement,
    });
    if (textTimerRef.current) clearTimeout(textTimerRef.current);
    textTimerRef.current = setTimeout(() => {
      setTextCopied(false);
    }, 2000);
  };

  const handleOpenXIntent = () => {
    const url = buildXIntentUrl(activeText);
    if (mode === "no_link_post") {
      setPost1Acted(true);
    }
    trackRadarEvent("signal_share_x", {
      signal_id: item.id,
      platform: item.sourcePlatform,
      category: item.category,
      locale,
      action: "open_intent",
      mode,
      placement,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const charCountLabel = !metrics.overFreeLimit
    ? xDict.freeLimitOk(metrics.weighted)
    : mode === "quick_intent"
      ? xDict.overQuickLimitNote(metrics.weighted)
      : xDict.longPostNote(metrics.weighted);

  const charCountClass = !metrics.overFreeLimit
    ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-500/30"
    : mode === "quick_intent"
      ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/35"
      : "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/15 dark:border-blue-500/35";

  const modalNode = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-5 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200/95 bg-white shadow-2xl shadow-slate-950/25 dark:border-slate-800 dark:bg-[#0F172A] dark:shadow-black/60"
      >
        {/* 顶栏 */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4 sm:px-6 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900 dark:text-white"
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-950">
                <XBrandIcon className="h-3.5 w-3.5" />
              </span>
              <span>{xDict.modalTitle}</span>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {xDict.modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={xDict.closeCta}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 主内容双栏区 */}
        <div className="grid grid-cols-1 gap-5 overflow-y-auto p-5 sm:p-6 lg:grid-cols-[1.08fr_1fr]">
          {/* 左栏：16:9 原生高清配图工作室 */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <ImageIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                {xDict.cardPreviewLabel}
              </span>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-700/80 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleSelectTheme("terminal_dark")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                    cardTheme === "terminal_dark"
                      ? "bg-slate-900 text-white shadow-2xs dark:bg-blue-600"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  <Moon className="h-3 w-3" />
                  <span>{xDict.themeDark}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTheme("editorial_light")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                    cardTheme === "editorial_light"
                      ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-200 dark:text-slate-900"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  <Sun className="h-3 w-3" />
                  <span>{xDict.themeLight}</span>
                </button>
              </div>
            </div>

            {/* 16:9 Canvas 实时预览容器 */}
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200/90 bg-slate-950 shadow-sm dark:border-slate-800">
              <canvas
                ref={canvasRef}
                aria-label={xDict.cardPreviewLabel}
                className="block h-full w-full"
              />
            </div>

            {/* 图片操作按钮 */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyImage}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors cursor-pointer",
                  imageStatus === "copied"
                    ? "bg-emerald-600 text-white"
                    : imageStatus === "downloaded"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                )}
              >
                {imageStatus === "copied" ? (
                  <>
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>{xDict.copiedImageCta}</span>
                  </>
                ) : imageStatus === "downloaded" ? (
                  <>
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>{xDict.downloadedFallbackCta}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 shrink-0" />
                    <span>{xDict.copyImageCta}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadImage}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{xDict.downloadImageCta}</span>
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {xDict.imageHint}
            </p>
          </div>

          {/* 右栏：3 模式文案模板 + 实时字数权重 + 一键发帖 */}
          <div className="flex flex-col gap-3">
            {/* 模式切换 Tab */}
            <div
              role="tablist"
              aria-label={xDict.modalTitle}
              className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 p-1 dark:border-slate-800 dark:bg-slate-900/70"
            >
              {X_SHARE_MODES.map((m) => {
                const active = mode === m;
                const info = xDict.modes[m];
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setMode(m);
                      setTextCopied(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center transition-all cursor-pointer",
                      active
                        ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/90 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                  >
                    <span className="text-xs font-semibold leading-tight">
                      {info.label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-medium",
                        active
                          ? m === "no_link_post"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                            : m === "reply_cta"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          : "text-slate-400 dark:text-slate-500"
                      )}
                    >
                      {info.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 当前策略提示条 */}
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              {modeMeta.tip}
            </div>

            {/* 编辑器顶栏 */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <label
                htmlFor={editorId}
                className="font-semibold text-slate-700 dark:text-slate-200"
              >
                {xDict.editorLabel}
              </label>

              {isEdited && (
                <button
                  type="button"
                  onClick={() =>
                    setCustomDrafts((prev) => {
                      const next = { ...prev };
                      delete next[mode];
                      return next;
                    })
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{xDict.resetDraftCta}</span>
                </button>
              )}
            </div>

            {/* 可编辑文案框 */}
            <textarea
              id={editorId}
              rows={9}
              value={activeText}
              onChange={(e) => {
                const nextVal = e.target.value;
                setCustomDrafts((prev) => ({ ...prev, [mode]: nextVal }));
                if (textCopied) setTextCopied(false);
              }}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:bg-slate-900"
            />

            {/* 实时 X 权重字数 + 防限流外链检测胶囊 */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono font-semibold tabular-nums",
                  charCountClass
                )}
              >
                {charCountLabel}
              </span>

              {!metrics.hasUrl ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  <span>{xDict.noLinkSafeBadge}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-blue-200/80 bg-blue-50/80 px-2 py-0.5 font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300">
                  <span>{xDict.utmTrackedBadge}</span>
                </span>
              )}
            </div>

            {/* 主操作行：复制文案 + 直达 X 发帖 */}
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold transition-colors cursor-pointer",
                  textCopied
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                )}
              >
                {textCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{xDict.copiedTextCta}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{xDict.copyTextCta}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenXIntent}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                <XBrandIcon className="h-3.5 w-3.5" />
                <span>{xDict.postOnXCta}</span>
                <ExternalLink className="h-3 w-3 opacity-75" />
              </button>
            </div>

            {/* 1 楼完成后一键接力 2 楼引流回复 */}
            {mode === "no_link_post" && post1Acted && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200/90 bg-blue-50/75 px-3 py-2 text-xs dark:border-blue-500/35 dark:bg-blue-950/35">
                <span className="text-[11.5px] text-blue-900 dark:text-blue-200">
                  {xDict.nextStepReplyHint}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("reply_cta");
                    setTextCopied(false);
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-800 cursor-pointer dark:text-blue-300 dark:hover:text-blue-200"
                >
                  <span>{xDict.nextStepReplyCta}</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modalNode;
  return createPortal(modalNode, document.body);
}
