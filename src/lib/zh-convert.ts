import * as OpenCC from "opencc-js";
import type { LocalizedSignalFields } from "@/types/signal";

let cachedTwConverter: ((text: string) => string) | null = null;

function getTwConverter(): (text: string) => string {
  if (!cachedTwConverter) {
    // cn -> twp：简体中文转台湾正体（含地道计算机与商业词汇转换，如 软件->軟體、信息->資訊、视频->影片）
    cachedTwConverter = OpenCC.Converter({ from: "cn", to: "twp" });
  }
  return cachedTwConverter;
}

export function toTraditionalTw(text: string): string {
  if (!text) return "";
  try {
    return getTwConverter()(text);
  } catch {
    return text;
  }
}

export function deriveTraditionalFields(
  zh: LocalizedSignalFields
): LocalizedSignalFields {
  const conv = getTwConverter();
  return {
    title: conv(zh.title),
    whatItIs: conv(zh.whatItIs),
    businessSignal: conv(zh.businessSignal),
    indieTakeaway: conv(zh.indieTakeaway),
    metricsBadge: zh.metricsBadge ? conv(zh.metricsBadge) : undefined,
    tags: (zh.tags ?? []).map((t) => conv(t)),
  };
}
