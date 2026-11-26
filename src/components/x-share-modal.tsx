"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Moon,
  RotateCcw,
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

  useEffect(() => {
    if (!open) return;
    setMode("no_link_post");
    setCustomDrafts({});
    setTextCopied(false);
    setImageStatus("idle");
    setPost1Acted(false);
  }, [open, item.id, locale]);

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
      }, 2400);
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
    }, 2000);
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
    }, 1800);
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

  const modalNode = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-5 backdrop-blur-xs"
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
        className="flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-black/25 dark:border-zinc-800 dark:bg-[#111215] dark:shadow-black/70"
      >
        {/* 极简顶栏：标题 + 卡片明暗切换 + 关闭 */}
        <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-slate-200/75 px-5 dark:border-zinc-800/90">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900 dark:text-zinc-100"
          >
            <XBrandIcon className="h-3.5 w-3.5 text-slate-900 dark:text-zinc-100" />
            <span>{xDict.modalTitle}</span>
          </h2>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200/90 bg-slate-100/80 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => handleSelectTheme("terminal_dark")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  cardTheme === "terminal_dark"
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <Moon className="h-3 w-3" />
                <span>{xDict.themeDark}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTheme("editorial_light")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  cardTheme === "editorial_light"
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <Sun className="h-3 w-3" />
                <span>{xDict.themeLight}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={xDict.closeCta}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:text-zinc-500 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 主体双栏：左卡片预览 + 右清爽文案编辑 */}
        <div className="grid grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1.12fr_1fr] lg:items-stretch">
          {/* 左栏：16:9 社论卡片预览 + 图片操作 */}
          <div className="flex flex-col justify-between gap-3">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200/85 bg-[#0C0D10] shadow-xs dark:border-zinc-800">
              <canvas
                ref={canvasRef}
                aria-label={xDict.cardPreviewLabel}
                className="block h-full w-full"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyImage}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-colors cursor-pointer",
                  imageStatus === "copied"
                    ? "bg-emerald-600 text-white"
                    : imageStatus === "downloaded"
                      ? "bg-slate-800 text-white dark:bg-zinc-700"
                      : "border border-slate-200/90 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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
                aria-label={xDict.downloadImageCta}
                title={xDict.downloadImageCta}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{xDict.downloadImageCta}</span>
              </button>
            </div>
          </div>

          {/* 右栏：极简分段切换 + 一体化编辑器 + 发帖动作 */}
          <div className="flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label={xDict.modalTitle}
                className="grid flex-1 grid-cols-3 gap-1 rounded-lg border border-slate-200/85 bg-slate-100/75 p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
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
                        "h-7.5 rounded-md px-2 text-xs font-medium transition-colors cursor-pointer truncate",
                        active
                          ? "bg-white text-slate-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      )}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>

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
                  title={xDict.resetDraftCta}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden sm:inline">{xDict.resetDraftCta}</span>
                </button>
              )}
            </div>

            {/* 一体化文案编辑框（底部内嵌简短提示与字数统计，零多余边框胶囊） */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50 transition-colors focus-within:border-slate-400 focus-within:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus-within:border-zinc-600 dark:focus-within:bg-zinc-900">
              <label htmlFor={editorId} className="sr-only">
                {xDict.editorLabel}
              </label>
              <textarea
                id={editorId}
                rows={8}
                value={activeText}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setCustomDrafts((prev) => ({ ...prev, [mode]: nextVal }));
                  if (textCopied) setTextCopied(false);
                }}
                className="w-full flex-1 resize-none bg-transparent px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-900 focus:outline-none dark:text-zinc-100"
              />
              <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 px-3.5 py-2 text-[11px] dark:border-zinc-800/80">
                <span className="truncate text-slate-400 dark:text-zinc-500">
                  {mode === "no_link_post" && post1Acted ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("reply_cta");
                        setTextCopied(false);
                      }}
                      className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 cursor-pointer dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <span>{xDict.nextStepReplyCta}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : (
                    modeMeta.tip
                  )}
                </span>

                <span
                  className={cn(
                    "shrink-0 font-mono tabular-nums",
                    !metrics.overFreeLimit
                      ? "text-slate-400 dark:text-zinc-500"
                      : mode === "quick_intent"
                        ? "font-semibold text-amber-600 dark:text-amber-400"
                        : "text-slate-500 dark:text-zinc-400"
                  )}
                >
                  {`${metrics.weighted} / 280`}
                </span>
              </div>
            </div>

            {/* 主操作行：复制文案 + 打开 X 发帖 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition-colors cursor-pointer",
                  textCopied
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-slate-200/90 bg-white text-slate-800 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                <XBrandIcon className="h-3.5 w-3.5" />
                <span>{xDict.postOnXCta}</span>
                <ExternalLink className="h-3 w-3 opacity-70" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modalNode;
  return createPortal(modalNode, document.body);
}
