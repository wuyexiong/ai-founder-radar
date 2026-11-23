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
请将输入的海外英文产品/案例/待售挂牌/痛点帖提炼成结构化中文商业情报 JSON（不要输出 Markdown 代码块，不要输出思考过程，仅输出合法 JSON 对象）：
{
  "titleZh": "直白有吸引力的中文标题（突出产品形态+核心营收/痛点结果，禁机翻腔，32字内）",
  "category": "launch | revenue | pain_point | ai_trend 四选一（Acquire挂牌、带MRR/营收复盘帖归入 revenue；求推荐/吐槽难用归入 pain_point）",
  "whatItIs": "1句话讲清它解决谁的什么具体问题或痛点场景（45字内）",
  "businessSignal": "提取变现模式、定价、MRR/ARR/净利润、叫价倍数、获客渠道或付费意愿强度（55字内）",
  "indieTakeaway": "1句话犀利点评：独立开发者可切入的细分抄作业方向、本地化机会或避坑提示（55字内）",
  "metricsBadge": "简短高亮指标，如 ARR $73k、$31k/mo、▲ 320 HN 或 💬 38 痛点讨论（18字内）",
  "metricType": "revenue | heat | pain 三选一（含具体金额/MRR/ARR/利润一律选 revenue）",
  "tags": ["#标签1", "#标签2", "#标签3"],
  "score": 8.6
}
评分准则（1~10分）：有真实MRR/ARR/利润数据、清晰B2B定价或明确高频付费痛点给 8.5~9.5 分；有实用产品形态的新品给 7.5~8.4 分；无商业化场景的纯技术玩具/水贴给 5.5~6.4 分。`;

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

// 本地 Rapid-MLX 默认探测端口列表：
// 8080: qwen35-27b (主模型)
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
    // 优先级 1：自动探测本机 8080~8083 / 8000 端口的 Rapid-MLX 服务，在线即优先使用
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
    const isPain =
      raw.sourceSublabel.includes("SomebodyMakeThis") ||
      raw.sourceSublabel.includes("痛点");
    const isRevenue =
      raw.sourcePlatform === "acquire" ||
      /\$\d+|mrr|arr|revenue|profit|€|净利|年收|月收/i.test(
        `${raw.title} ${raw.summary} ${raw.rawMetric}`
      );
    distilled = {
      titleZh: raw.title.slice(0, 48),
      category: isPain ? "pain_point" : isRevenue ? "revenue" : "launch",
      whatItIs: raw.summary.slice(0, 90) || "海外社区新发布的热门产品或创业讨论帖。",
      businessSignal: `来自 ${raw.sourceSublabel} 一手社区信号（开启 qwen-serve 或配置 API Key 后自动生成深度拆解）。`,
      indieTakeaway: "点击右下角查看原帖真实数据与评论区反馈，验证细分场景需求。",
      metricsBadge: raw.rawMetric,
      metricType: isPain ? "pain" : isRevenue ? "revenue" : "heat",
      tags: [`#${raw.sourcePlatform}`, `#${raw.sourceSublabel.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "")}`],
      score: isRevenue ? 8.5 : 7.8,
    };
  }

  const validCategories: SignalCategory[] = [
    "launch",
    "revenue",
    "pain_point",
    "ai_trend",
  ];
  const validMetricTypes: MetricType[] = ["revenue", "heat", "pain"];
  const rawObj = distilled as unknown as Record<string, unknown>;

  const rawCategory = String(distilled.category ?? "").trim();
  const normalizedCategory: SignalCategory = validCategories.includes(
    rawCategory as SignalCategory
  )
    ? (rawCategory as SignalCategory)
    : raw.sourcePlatform === "acquire"
      ? "revenue"
      : raw.sourceSublabel.includes("SomebodyMakeThis")
        ? "pain_point"
        : "launch";

  const rawMetricType = String(
    distilled.metricType ?? rawObj.metric_type ?? ""
  ).trim();
  const normalizedMetricType: MetricType = validMetricTypes.includes(
    rawMetricType as MetricType
  )
    ? (rawMetricType as MetricType)
    : normalizedCategory === "revenue" ||
        /\$\d|mrr|arr|年收|月收|净利/i.test(
          `${distilled.metricsBadge ?? ""} ${raw.rawMetric}`
        )
      ? "revenue"
      : normalizedCategory === "pain_point"
        ? "pain"
        : "heat";

  const parsedScore = Number(distilled.score);
  const normalizedScore = Number.isFinite(parsedScore)
    ? Math.min(10, Math.max(1, parsedScore))
    : 7.8;

  const normalizedTags = Array.isArray(distilled.tags)
    ? distilled.tags
        .map((t) => String(t).trim())
        .filter(Boolean)
        .map((t) => (t.startsWith("#") ? t : `#${t}`))
        .slice(0, 4)
    : [`#${raw.sourcePlatform}`];

  const parsedPubTime = Date.parse(raw.publishedAt);
  const safePublishedAt = Number.isFinite(parsedPubTime)
    ? new Date(parsedPubTime).toISOString()
    : new Date().toISOString();

  const urlHash = createHash("sha256").update(raw.url).digest("hex").slice(0, 12);

  return {
    id: `sig-${urlHash}`,
    dateKey,
    titleZh: String(distilled.titleZh || raw.title).trim(),
    titleOrig: raw.title,
    category: normalizedCategory,
    whatItIs: String(
      distilled.whatItIs || raw.summary.slice(0, 90) || raw.title
    ).trim(),
    businessSignal: String(
      distilled.businessSignal || `来自 ${raw.sourceSublabel} 社区商业信号`
    ).trim(),
    indieTakeaway: String(
      distilled.indieTakeaway || "建议结合原帖评论与定价策略评估细分切入机会。"
    ).trim(),
    metricsBadge: String(distilled.metricsBadge || raw.rawMetric || "热门信号").trim(),
    metricType: normalizedMetricType,
    tags: normalizedTags.length > 0 ? normalizedTags : [`#${raw.sourcePlatform}`],
    score: normalizedScore,
    isTopPick: normalizedScore >= 8.5,
    sourcePlatform: raw.sourcePlatform,
    sourceSublabel: raw.sourceSublabel,
    sourceUrl: raw.url,
    publishedAt: safePublishedAt,
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
