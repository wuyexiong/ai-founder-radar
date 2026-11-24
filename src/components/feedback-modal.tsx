"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  Bug,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Radio,
  X,
} from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { trackRadarEvent } from "@/lib/analytics";
import {
  FEEDBACK_MAX_CONTACT_LENGTH,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_TYPES,
  type FeedbackType,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

type FeedbackSubmitStatus =
  | "idle"
  | "submitting"
  | "submitted"
  | "too_short"
  | "rate_limited"
  | "local_demo"
  | "error";

const TYPE_ICONS: Record<FeedbackType, React.ReactNode> = {
  suggestion: <Lightbulb className="h-3.5 w-3.5 text-amber-500" />,
  bug: <Bug className="h-3.5 w-3.5 text-rose-500" />,
  source: <Radio className="h-3.5 w-3.5 text-emerald-500" />,
  other: <MessageCircle className="h-3.5 w-3.5 text-blue-500" />,
};

export function FeedbackModal({
  open,
  onClose,
  locale,
  dict,
}: {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  dict: Dictionary["feedback"];
}) {
  const titleId = useId();
  const messageId = useId();
  const contactId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [type, setType] = useState<FeedbackType>("suggestion");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<FeedbackSubmitStatus>("idle");

  useEffect(() => {
    if (!open) return;

    const focusTimer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "submitting") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, status]);

  if (!open) return null;

  const resetFormForAnother = () => {
    setMessage("");
    setStatus("idle");
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 30);
  };

  const handleClose = () => {
    if (status === "submitting") return;
    if (status === "submitted") {
      setMessage("");
      setStatus("idle");
    }
    onClose();
  };

  const submitFeedback = async () => {
    if (status === "submitting") return;

    const trimmed = message.trim();
    if (trimmed.length < FEEDBACK_MIN_LENGTH) {
      setStatus("too_short");
      textareaRef.current?.focus();
      return;
    }

    setStatus("submitting");
    const pagePath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : `/${locale}`;

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: trimmed,
          contact: contact.trim() || undefined,
          pagePath,
          locale,
          website: honeypot,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
      } | null;

      if (res.ok && data?.ok) {
        setStatus("submitted");
        trackRadarEvent("feedback_submit", {
          locale,
          type,
          has_contact: Boolean(contact.trim()),
          result: "submitted",
        });
      } else if (res.status === 429 || data?.code === "RATE_LIMITED") {
        setStatus("rate_limited");
        trackRadarEvent("feedback_submit", {
          locale,
          type,
          result: "rate_limited",
        });
      } else if (data?.code === "DB_NOT_CONFIGURED") {
        setStatus("local_demo");
      } else if (data?.code === "INVALID_MESSAGE") {
        setStatus("too_short");
      } else {
        setStatus("error");
        trackRadarEvent("feedback_submit", {
          locale,
          type,
          result: "error",
        });
      }
    } catch {
      setStatus("error");
      trackRadarEvent("feedback_submit", {
        locale,
        type,
        result: "error",
      });
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitFeedback();
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submitFeedback();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-slate-200/95 bg-white p-5 shadow-2xl shadow-slate-950/20 sm:p-6 dark:border-slate-800 dark:bg-[#111827] dark:shadow-black/50"
      >
        {/* 弹窗头部 */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id={titleId}
              className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900 dark:text-white"
            >
              <MessageSquarePlus className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>{dict.modalTitle}</span>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {dict.modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={status === "submitting"}
            aria-label={dict.closeCta}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === "submitted" ? (
          <div className="mt-5 rounded-xl border border-emerald-200/90 bg-emerald-50/75 p-5 text-center dark:border-emerald-500/30 dark:bg-emerald-950/25">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">
              {dict.successTitle}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {dict.successDesc}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={resetFormForAnother}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {dict.sendAnotherCta}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-8 items-center rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {dict.closeCta}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="mt-4 space-y-3.5">
            {/* 防刷蜜罐字段 */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="hidden"
            />

            {/* 反馈类型胶囊 */}
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {dict.typeLabel}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_TYPES.map((itemType) => {
                  const active = type === itemType;
                  return (
                    <button
                      key={itemType}
                      type="button"
                      disabled={status === "submitting"}
                      onClick={() => setType(itemType)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                        active
                          ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-600 dark:text-white"
                          : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-slate-600"
                      )}
                    >
                      {TYPE_ICONS[itemType]}
                      <span>{dict.types[itemType]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 具体内容输入区 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label
                  htmlFor={messageId}
                  className="font-semibold text-slate-700 dark:text-slate-300"
                >
                  {dict.messageLabel}
                </label>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {message.length}/{FEEDBACK_MAX_LENGTH}
                </span>
              </div>
              <textarea
                id={messageId}
                ref={textareaRef}
                rows={4}
                required
                maxLength={FEEDBACK_MAX_LENGTH}
                disabled={status === "submitting"}
                value={message}
                onKeyDown={handleTextareaKeyDown}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (status !== "idle") {
                    setStatus("idle");
                  }
                }}
                placeholder={dict.messagePlaceholders[type]}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:bg-slate-900"
              />
            </div>

            {/* 可选联系方式 */}
            <div>
              <label
                htmlFor={contactId}
                className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {dict.contactLabel}
              </label>
              <input
                id={contactId}
                type="text"
                maxLength={FEEDBACK_MAX_CONTACT_LENGTH}
                disabled={status === "submitting"}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={dict.contactPlaceholder}
                className="h-8.5 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:bg-slate-900"
              />
            </div>

            {/* 状态错误提示 */}
            {status === "too_short" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {dict.tooShortError}
              </p>
            )}
            {status === "rate_limited" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {dict.rateLimitedError}
              </p>
            )}
            {status === "local_demo" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {dict.localDemoError}
              </p>
            )}
            {status === "error" && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {dict.submitError}
              </p>
            )}

            {/* 底部操作栏 */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="hidden text-[11px] text-slate-400 sm:inline dark:text-slate-500">
                {dict.shortcutHint}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={status === "submitting"}
                  onClick={handleClose}
                  className="inline-flex h-8.5 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {dict.cancelCta}
                </button>
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 cursor-pointer dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  {status === "submitting" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {status === "submitting"
                      ? dict.submittingCta
                      : dict.submitCta}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
