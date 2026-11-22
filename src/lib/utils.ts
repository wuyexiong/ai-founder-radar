import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const now = Date.now();
  const diffMinutes = Math.max(1, Math.floor((now - target) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m 前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h 前`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d 前`;
}
