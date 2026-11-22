import { createHash } from "node:crypto";
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
请将输入的海外英文产品/帖子提炼成结构化中文商业情报 JSON（不要输出 Markdown 代码块，不要输出思考过程，仅输出合法 JSON 对象）：
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

function extractJsonObject(rawText: string): DistilledOutput | null {
  const cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as DistilledOutput;
}

interface LocalMlxEndpoint {
  baseUrl: string;
  modelId: string;
}

let cachedRapidMlx: LocalMlxEndpoint | null | undefined = undefined;

// 对齐 ~/.oh-my-zsh/custom/mlx-models.zsh 端口注册表：
// 8080: qwen35-27b (Opus-Distilled 主模型)
// 8082: qwen36-35b (Qwen3.6-35B-A3B)
// 8083: qwen38-27b (Qwen3.8-27B)
// 8081: qwen35-9b  (Qwen3.5-9B 轻量级)
const DEFAULT_MLX_URLS = [
  "http://127.0.0.1:8080/v1",
  "http://127.0.0.1:8082/v1",
  "http://127.0.0.1:8083/v1",
  "http://127.0.0.1:8081/v1",
  "http://127.0.0.1:8000/v1",
];

async function detectLocalRapidMlx(customUrl?: string): Promise<LocalMlxEndpoint | null> {
  if (cachedRapidMlx !== undefined) return cachedRapidMlx;

  const candidates = customUrl ? [customUrl] : DEFAULT_MLX_URLS;

  for (const baseUrl of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as { data?: Array<{ id: string }> };
      const modelId = data?.data?.[0]?.id;
      if (modelId) {
        console.log(`⚡ 自动连上本机 MLX 服务 (${baseUrl}) -> 模型: [${modelId}]`);
        cachedRapidMlx = { baseUrl, modelId };
        return cachedRapidMlx;
      }
    } catch {
      // 该端口未启动，继续检测下一个注册端口
    }
  }

  cachedRapidMlx = null;
  return null;
}

async function callGemini(raw: RawFetchedItem, apiKey: string): Promise<DistilledOutput | null> {
  const customModel = process.env.GEMINI_MODEL?.trim();
  // 优先采用每日免费额度高达 500 RPD / 15 RPM 的 Flash-Lite 双模型池（合计 1,000 次/天）
  const candidateModels = customModel
    ? [customModel]
    : ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];

  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
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

      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        await sleep(5000);
        continue;
      }

      if (!res.ok) break;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return extractJsonObject(text);
    }
  }

  return null;
}

async function callOpenAICompatible(
  raw: RawFetchedItem,
  apiKey: string,
  baseUrl: string,
  model: string,
  isLocalMlx = false
): Promise<DistilledOutput | null> {
  const bodyPayload: Record<string, unknown> = {
    model,
    temperature: 0.25,
    max_tokens: 700,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `来源：${raw.sourceSublabel}\n标题：${raw.title}\n摘要：${raw.summary}\n原始热度：${raw.rawMetric}`,
      },
    ],
  };

  if (!isLocalMlx) {
    bodyPayload.response_format = { type: "json_object" };
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return text ? extractJsonObject(text) : null;
}

export async function distillRawItem(
  raw: RawFetchedItem,
  dateKey: string,
  index: number
): Promise<SignalItem> {
  const customMlxUrl = process.env.RAPID_MLX_URL?.trim() || undefined;
  const explicitRapidModel = process.env.RAPID_MLX_MODEL?.trim();
  const ollamaModel = process.env.OLLAMA_MODEL?.trim();
  const ollamaHost = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1";
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const llmKey = process.env.LLM_API_KEY?.trim();
  const llmBaseUrl = process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com/v1";
  const llmModel = process.env.LLM_MODEL?.trim() || "deepseek-chat";

  let distilled: DistilledOutput | null = null;

  try {
    // 优先级 1：自动扫描 mlx-models.zsh 的 8080~8083 端口，有任一模型在线即优先使用
    const detectedMlx = await detectLocalRapidMlx(customMlxUrl);

    if (detectedMlx) {
      distilled = await callOpenAICompatible(
        raw,
        "not-needed",
        detectedMlx.baseUrl,
        explicitRapidModel || detectedMlx.modelId,
        true
      );
    } else if (ollamaModel) {
      distilled = await callOpenAICompatible(raw, "ollama", ollamaHost, ollamaModel, true);
    } else if (geminiKey) {
      // 优先级 2：本地未开启 MLX 服务时（或云端 GitHub Actions 环境），自动走免费 Gemini Flash
      if (index > 0) await sleep(4200);
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
      businessSignal: `来自 ${raw.sourceSublabel} 一手社区信号（开启 qwen-serve 或配置 API Key 后自动生成深度拆解）。`,
      indieTakeaway: "点击右下角查看原帖评论区真实用户反馈，验证细分场景需求。",
      metricsBadge: raw.rawMetric,
      metricType: isPain ? "pain" : isRevenue ? "revenue" : "heat",
      tags: [`#${raw.sourcePlatform}`, `#${raw.sourceSublabel.replace(/[^a-zA-Z0-9]/g, "")}`],
      score: 7.8,
    };
  }

  const urlHash = createHash("sha256").update(raw.url).digest("hex").slice(0, 12);

  return {
    id: `sig-${urlHash}`,
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

export async function generateDailyEditorialSummary(
  items: SignalItem[]
): Promise<string> {
  const defaultSummary = `今日共精选 ${items.length} 条海外新品、真实营收与用户痛点信号，点击卡片标签可按细分赛道快速筛选。`;
  if (items.length === 0) return defaultSummary;

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) return defaultSummary;

  const digestTitles = items
    .slice(0, 10)
    .map((it, idx) => `${idx + 1}. [${it.category}] ${it.titleZh} (${it.metricsBadge})`)
    .join("\n");

  // 每天仅调用 1 次高阶 3.8-flash（20 RPD 仅耗 1 次）生成主编级全局风向洞察，失败回退 3.5-flash-lite
  for (const modelName of ["gemini-3.8-flash", "gemini-3.5-flash-lite"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `你是出海独立开发主编。请根据今日精选标题列表，用 2 句话（不超过 85 字，纯文本不要换行或加粗）高度概括今天海外产品与搞钱赛道的重点风向：\n${digestTitles}`,
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0.3 },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text.replace(/\s+/g, " ");
    } catch {
      // ignore and try fallback
    }
  }

  return defaultSummary;
}
