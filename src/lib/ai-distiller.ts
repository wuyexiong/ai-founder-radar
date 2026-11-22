import type { RawFetchedItem } from "@/lib/collectors/sources";
import type { MetricType, SignalCategory, SignalItem } from "@/types/signal";

interface DistilledOutput {
  titleZh: string;
  category: SignalCategory;
  whatItIs: string;
  businessSignal: string;
  indieTakeaway: string;
  metricsBadge: string;
  metricType: MetricType;
  tags: string[];
  score: number;
}

const SYSTEM_PROMPT = `你是一位资深出海独立开发者（Indie Hacker）与商业分析师。
请将输入的海外英文产品/帖子提炼成结构化中文商业情报 JSON（不要输出 Markdown 代码块，仅输出合法 JSON 对象）：
{
  "titleZh": "直白有吸引力的中文标题（突出做什么+结果/痛点，禁机翻腔，32字内）",
  "category": "launch | revenue | pain_point | ai_trend 四选一",
  "whatItIs": "1句话讲清它解决谁的什么具体问题（45字内）",
  "businessSignal": "提取变现模式、定价、MRR金额、获客方式或社区付费意愿强度（55字内）",
  "indieTakeaway": "1句话犀利点评：独立开发者可切入的抄作业方向或避坑提示（55字内）",
  "metricsBadge": "简短高亮指标，如 $8k MRR 或 ▲ 320 HN 或 💬 85 痛点讨论",
  "metricType": "revenue | heat | pain 三选一",
  "tags": ["#标签1", "#标签2", "#标签3"],
  "score": 8.5
}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(raw: RawFetchedItem, apiKey: string): Promise<DistilledOutput | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${SYSTEM_PROMPT}\n\n输入信号：\n来源：${raw.sourceSublabel}\n标题：${raw.title}\n摘要：${raw.summary}\n原始热度：${raw.rawMetric}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      }),
    });

    if (res.status === 429 && attempt < 2) {
      // 未绑卡免费层每分钟限频约 10~15 次，遇到 429 自动等待退避重试
      await sleep(6000 * (attempt + 1));
      continue;
    }

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? (JSON.parse(text) as DistilledOutput) : null;
  }

  return null;
}

async function callOpenAICompatible(
  raw: RawFetchedItem,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<DistilledOutput | null> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `来源：${raw.sourceSublabel}\n标题：${raw.title}\n摘要：${raw.summary}\n原始热度：${raw.rawMetric}`,
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return text ? (JSON.parse(text) as DistilledOutput) : null;
}

export async function distillRawItem(
  raw: RawFetchedItem,
  dateKey: string,
  index: number
): Promise<SignalItem> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const llmKey = process.env.LLM_API_KEY?.trim();
  const llmBaseUrl = process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com/v1";
  const llmModel = process.env.LLM_MODEL?.trim() || "deepseek-chat";

  let distilled: DistilledOutput | null = null;

  try {
    if (geminiKey) {
      if (index > 0) await sleep(4200); // 适配未绑卡免费层 RPM 限速，稳妥不触发 429
      distilled = await callGemini(raw, geminiKey);
    } else if (llmKey) {
      distilled = await callOpenAICompatible(raw, llmKey, llmBaseUrl, llmModel);
    }
  } catch (err) {
    console.warn("[Distiller] LLM call failed, using heuristic fallback:", err);
  }

  if (!distilled) {
    const isPain = raw.sourceSublabel.includes("SomebodyMakeThis");
    const isRevenue = /\$\d+|mrr|arr|revenue/i.test(`${raw.title} ${raw.summary}`);
    distilled = {
      titleZh: raw.title,
      category: isPain ? "pain_point" : isRevenue ? "revenue" : "launch",
      whatItIs: raw.summary.slice(0, 90) || "海外社区新发布的热门产品或创业讨论帖。",
      businessSignal: `来自 ${raw.sourceSublabel} 一手社区信号（配置 API Key 后自动生成深度中文变现拆解）。`,
      indieTakeaway: "点击右下角查看原帖评论区真实用户反馈，验证细分场景需求。",
      metricsBadge: raw.rawMetric,
      metricType: isPain ? "pain" : isRevenue ? "revenue" : "heat",
      tags: [`#${raw.sourcePlatform}`, `#${raw.sourceSublabel.replace(/[^a-zA-Z0-9]/g, "")}`],
      score: 7.8,
    };
  }

  return {
    id: `sig-${dateKey.replace(/-/g, "")}-${String(index + 1).padStart(2, "0")}`,
    dateKey,
    titleZh: distilled.titleZh,
    titleOrig: raw.title,
    category: distilled.category,
    whatItIs: distilled.whatItIs,
    businessSignal: distilled.businessSignal,
    indieTakeaway: distilled.indieTakeaway,
    metricsBadge: distilled.metricsBadge,
    metricType: distilled.metricType,
    tags: distilled.tags,
    score: distilled.score,
    isTopPick: distilled.score >= 8.5,
    sourcePlatform: raw.sourcePlatform,
    sourceSublabel: raw.sourceSublabel,
    sourceUrl: raw.url,
    publishedAt: raw.publishedAt,
  };
}
