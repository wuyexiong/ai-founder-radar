"use client";

import React, { useState } from "react";
import { Mail } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { trackRadarEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type NewsletterPlacement = "sidebar" | "inline" | "detail";

type SubscribeUiStatus =
  | "idle"
  | "submitting"
  | "confirm_required"
  | "pending_mailer"
  | "subscribed"
  | "already"
  | "rate_limited"
  | "error"
  | "local_demo";

export function NewsletterSubscribeCard({
  dict,
  locale,
  placement = "sidebar",
}: {
  dict: Dictionary["sidebar"];
  locale: Locale;
  placement?: NewsletterPlacement;
}) {
  const [emailInput, setEmailInput] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<SubscribeUiStatus>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed || status === "submitting") return;

    setStatus("submitting");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          locale,
          website: honeypot,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        status?: string;
        code?: string;
      } | null;

      if (res.ok && data?.ok) {
        const nextStatus: SubscribeUiStatus =
          data.status === "already_subscribed"
            ? "already"
            : data.status === "confirmation_required"
              ? "confirm_required"
              : data.status === "pending_mailer"
                ? "pending_mailer"
                : "subscribed";
        setStatus(nextStatus);
        setEmailInput("");
        trackRadarEvent("newsletter_submit", {
          locale,
          placement,
          result: nextStatus,
        });
      } else if (res.status === 429 || data?.code === "RATE_LIMITED") {
        setStatus("rate_limited");
        trackRadarEvent("newsletter_submit", {
          locale,
          placement,
          result: "rate_limited",
        });
      } else if (data?.code === "DB_NOT_CONFIGURED") {
        setStatus("local_demo");
      } else {
        setStatus("error");
        trackRadarEvent("newsletter_submit", {
          locale,
          placement,
          result: "error",
        });
      }
    } catch {
      setStatus("error");
      trackRadarEvent("newsletter_submit", {
        locale,
        placement,
        result: "error",
      });
    }
  };

  const isCompletedState =
    status === "confirm_required" ||
    status === "pending_mailer" ||
    status === "subscribed" ||
    status === "already";

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        placement === "detail"
          ? "rounded-2xl border-blue-200/90 bg-gradient-to-br from-blue-50/75 via-white to-white p-5 sm:p-6 dark:border-blue-500/30 dark:from-blue-950/25 dark:via-[#111827] dark:to-[#111827]"
          : placement === "inline"
            ? "border-blue-200/90 bg-gradient-to-br from-blue-50/70 to-white dark:border-blue-500/30 dark:from-blue-950/25 dark:to-[#111827]"
            : "border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#111827]"
      )}
    >
      <div
        className={cn(
          placement === "detail" &&
            !isCompletedState &&
            "sm:flex sm:items-center sm:justify-between sm:gap-6"
        )}
      >
        <div className={cn(placement === "detail" ? "sm:max-w-lg" : "")}>
          <h2
            className={cn(
              "mb-1 flex items-center gap-1.5 font-bold text-slate-900 dark:text-white",
              placement === "detail" ? "text-sm sm:text-[15px]" : "text-xs"
            )}
          >
            <Mail className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>{dict.newsletterTitle}</span>
          </h2>
          <p
            className={cn(
              "text-xs text-slate-500 dark:text-slate-400",
              placement === "detail" && !isCompletedState
                ? "mb-3 sm:mb-0"
                : "mb-2.5"
            )}
          >
            {dict.newsletterDesc}
          </p>
        </div>

        {isCompletedState ? (
          <div
            role="status"
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium",
              status === "confirm_required"
                ? "border border-blue-200/80 bg-blue-50/90 text-blue-800 dark:border-blue-500/35 dark:bg-blue-950/45 dark:text-blue-200"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            )}
          >
            {status === "already"
              ? dict.newsletterAlready
              : status === "confirm_required"
                ? dict.newsletterCheckInbox
                : status === "pending_mailer"
                  ? dict.newsletterPendingMailer
                  : dict.newsletterSuccess}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className={cn(
              "space-y-1.5",
              placement === "detail" && "sm:w-80 sm:shrink-0"
            )}
          >
            {/* 防刷蜜罐输入框（屏幕阅读器与视觉均隐藏） */}
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
            <div className="flex gap-1.5">
              <input
                type="email"
                required
                disabled={status === "submitting"}
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (
                    status === "error" ||
                    status === "rate_limited" ||
                    status === "local_demo"
                  ) {
                    setStatus("idle");
                  }
                }}
                placeholder="you@example.com"
                className={cn(
                  "flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900",
                  placement === "detail" ? "h-9" : "h-8"
                )}
              />
              <button
                type="submit"
                disabled={status === "submitting"}
                className={cn(
                  "shrink-0 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer",
                  placement === "detail" ? "h-9 px-3.5" : "h-8"
                )}
              >
                {status === "submitting"
                  ? dict.newsletterSubmitting
                  : dict.newsletterCta}
              </button>
            </div>
            {status === "rate_limited" && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {dict.newsletterRateLimited}
              </p>
            )}
            {status === "error" && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                {dict.newsletterError}
              </p>
            )}
            {status === "local_demo" && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {dict.newsletterLocalDemo}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
