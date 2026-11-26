import type { Locale } from "@/i18n/config";
import type { CardLensLabels } from "@/i18n/dictionaries";
import { resolveSignalOriginInfo } from "@/lib/x-share";
import type { SignalCategory, SignalItem } from "@/types/signal";

export type XCardTheme = "terminal_dark" | "editorial_light";

export const X_CARD_WIDTH = 1200;
export const X_CARD_HEIGHT = 675;
export const X_CARD_DPR = 2;

const CJK_CHAR_RE =
  /[\u2e80-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

// 剥离彩色卡通 Emoji（保留 ★、▲、$、+、·、— 等纯排印几何字符）
const PICTOGRAPHIC_EMOJI_RE = /[\p{Extended_Pictographic}\ufe0f\u200d]+/gu;

const SYSTEM_SANS_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

const EDITORIAL_METRIC_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, "Inter", -apple-system, "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", sans-serif';

/**
 * 净化卡片配图上的文本，剔除所有彩色卡通 Emoji 与首尾冗余冒号，保持克制的社论研报排印质感
 */
export function stripEditorialEmojis(raw: string): string {
  return raw
    .replace(PICTOGRAPHIC_EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLensHeading(raw: string): string {
  return stripEditorialEmojis(raw)
    .replace(/[：:]+$/u, "")
    .trim()
    .toUpperCase();
}

/**
 * 将中/日/英混排文本拆分为适合自动换行的原子片段：
 * - 拉丁单词与数字（如 `$14.2k`、`QuickBooks`）保持完整，避免在单词中间断开
 * - CJK 字符按单字切分，保证中文/日文在画布边缘自然折行
 */
function tokenizeForCanvasWrap(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const tokens: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = "";
    }
  };

  for (const ch of Array.from(cleaned)) {
    if (ch === " ") {
      flush();
      tokens.push(" ");
    } else if (CJK_CHAR_RE.test(ch)) {
      flush();
      tokens.push(ch);
    } else {
      buffer += ch;
    }
  }
  flush();
  return tokens;
}

function clampSingleLineWithEllipsis(
  line: string,
  maxWidth: number,
  measureWidth: (s: string) => number
): string {
  const ellipsis = "…";
  const chars = Array.from(line.trimEnd());
  while (chars.length > 0) {
    const candidate = `${chars
      .join("")
      .replace(/[\s,;:—–\-/|([{（【「『、，；：]+$/u, "")}${ellipsis}`;
    if (measureWidth(candidate) <= maxWidth) {
      return candidate;
    }
    chars.pop();
  }
  return ellipsis;
}

/**
 * 纯函数多语种 Canvas 自动折行器（支持离线 Node 单测）：
 * 严格将任意中/繁/日/英混排长文折为 <= maxLines 行，并在超出时自然追加省略号。
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  maxLines: number,
  measureWidth: (s: string) => number
): string[] {
  const tokens = tokenizeForCanvasWrap(text);
  if (tokens.length === 0 || maxLines <= 0) return [];

  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token === " " && !current) continue;

    const candidate = current ? `${current}${token}` : token;
    if (measureWidth(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (!current) {
      let piece = "";
      for (const ch of Array.from(token)) {
        if (measureWidth(piece + ch) > maxWidth && piece) {
          lines.push(piece);
          piece = ch;
          if (lines.length >= maxLines) {
            truncated = true;
            break;
          }
        } else {
          piece += ch;
        }
      }
      if (truncated) break;
      current = piece;
      continue;
    }

    lines.push(current.trimEnd());
    if (lines.length >= maxLines) {
      truncated = true;
      current = "";
      break;
    }

    current = token === " " ? "" : token;
  }

  if (!truncated && current.trim()) {
    lines.push(current.trimEnd());
  }

  if (truncated && lines.length > 0) {
    const lastIdx = lines.length - 1;
    lines[lastIdx] = clampSingleLineWithEllipsis(
      lines[lastIdx]!,
      maxWidth,
      measureWidth
    );
  }

  return lines.slice(0, maxLines);
}

interface EditorialPalette {
  canvasBgTop: string;
  canvasBgBottom: string;
  outerHairline: string;
  hairline: string;
  hairlineStrong: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accentText: string;
  dotColor: string;
}

function getCategoryAccentColor(
  category: SignalCategory,
  metricType: SignalItem["metricType"],
  theme: XCardTheme
): string {
  const isLight = theme === "editorial_light";
  if (metricType === "revenue" || category === "revenue") {
    return isLight ? "#047857" : "#34D399";
  }
  if (metricType === "pain" || category === "pain_point") {
    return isLight ? "#1D4ED8" : "#60A5FA";
  }
  if (category === "ai_trend") {
    return isLight ? "#5B21B6" : "#A78BFA";
  }
  return isLight ? "#B45309" : "#FBBF24";
}

function getPlatformDotHex(
  platform: SignalItem["sourcePlatform"],
  theme: XCardTheme
): string {
  const isLight = theme === "editorial_light";
  switch (platform) {
    case "producthunt":
      return "#EA580C";
    case "hackernews":
      return "#D97706";
    case "indiehackers":
      return "#0284C7";
    case "acquire":
      return "#0D9488";
    case "reddit":
      return "#E11D48";
    case "github":
      return isLight ? "#18181B" : "#E4E4E7";
    case "trustmrr":
      return "#10B981";
    case "appstore":
      return "#2563EB";
  }
}

function getEditorialPalette(
  theme: XCardTheme,
  category: SignalCategory,
  metricType: SignalItem["metricType"],
  platform: SignalItem["sourcePlatform"]
): EditorialPalette {
  const accentText = getCategoryAccentColor(category, metricType, theme);
  const dotColor = getPlatformDotHex(platform, theme);

  if (theme === "editorial_light") {
    // 温润暖白社论纸感（参考 Readwise / Stripe Press / Monocle，告别刺眼冷蓝灰）
    return {
      canvasBgTop: "#FAF9F5",
      canvasBgBottom: "#F5F3EC",
      outerHairline: "#E5E2D9",
      hairline: "#E6E3DA",
      hairlineStrong: "#D5D0C5",
      primaryText: "#141518",
      secondaryText: "#3D4047",
      mutedText: "#767982",
      accentText,
      dotColor,
    };
  }

  // 纯粹黑曜石哑光炭黑（参考 Linear / Vercel，零蓝紫霓虹光晕）
  return {
    canvasBgTop: "#101115",
    canvasBgBottom: "#0B0C0E",
    outerHairline: "#1F2229",
    hairline: "#22252C",
    hairlineStrong: "#2E323C",
    primaryText: "#F4F5F7",
    secondaryText: "#B4B9C4",
    mutedText: "#6E7482",
    accentText,
    dotColor,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawMinimalRadarMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  theme: XCardTheme,
  hairlineColor: string
) {
  const isLight = theme === "editorial_light";
  ctx.save();
  drawRoundedRect(ctx, x, y, size, size, size * 0.24);
  ctx.fillStyle = isLight ? "#FFFFFF" : "#16181E";
  ctx.fill();
  ctx.strokeStyle = hairlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  const pad = size * 0.18;
  const scale = (size - pad * 2) / 24;
  ctx.translate(x + pad, y + pad);
  ctx.scale(scale, scale);

  if (typeof Path2D !== "undefined") {
    const dishPath = new Path2D(
      "M10.4849 13.5151L15.133 18.1632C15.5289 18.5591 15.7513 19.0961 15.7513 19.656C15.7513 20.3394 15.4206 20.9805 14.8637 21.3766C13.3774 22.4327 11.5993 23.0001 9.776 23.0001C8.3374 23.0001 6.9207 22.6467 5.6506 21.971C2.7875 20.4461 0.999 17.4661 1 14.2222C1 12.3996 1.5673 10.6222 2.6232 9.1367C3.0193 8.5796 3.6605 8.2487 4.344 8.2487C4.9038 8.2487 5.4407 8.471 5.8366 8.8668L10.4849 13.5151Z"
    );
    ctx.fillStyle = isLight ? "#141518" : "#F4F5F7";
    ctx.fill(dishPath);

    ctx.lineCap = "round";
    ctx.strokeStyle = isLight ? "#2563EB" : "#60A5FA";
    ctx.lineWidth = 2.2;
    ctx.stroke(new Path2D("M9.7778 14.2222L12.5 11.5"));

    ctx.strokeStyle = isLight ? "#059669" : "#34D399";
    ctx.lineWidth = 2.1;
    ctx.stroke(
      new Path2D(
        "M13.1111 6.4444C15.5657 6.4444 17.5556 8.4343 17.5556 10.8889M13.1111 2C18.0203 2 22 5.9797 22 10.8889"
      )
    );
  }
  ctx.restore();
}

function drawHorizontalHairline(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, Math.round(y) + 0.5);
  ctx.lineTo(x2, Math.round(y) + 0.5);
  ctx.stroke();
}

function drawVerticalHairline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y1: number,
  y2: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, y1);
  ctx.lineTo(Math.round(x) + 0.5, y2);
  ctx.stroke();
}

function buildEditorialProductAnchor(
  origin: ReturnType<typeof resolveSignalOriginInfo>,
  platformLabel: string
): string {
  if (origin.subjectName && origin.productHost) {
    const isSameStem =
      origin.subjectName === origin.subjectName.toLowerCase() &&
      origin.productHost.split(".")[0] === origin.subjectName.toLowerCase();
    return isSameStem
      ? origin.productHost
      : `${origin.subjectName}  ·  ${origin.productHost}`;
  }
  if (origin.productHost) return origin.productHost;
  if (origin.subjectName) return origin.subjectName;
  if (origin.sourceProvenance !== platformLabel) {
    return origin.sourceProvenance;
  }
  return "";
}

export interface RenderXCardParams {
  item: SignalItem;
  locale: Locale;
  platformLabel: string;
  categoryLabel: string;
  lens: CardLensLabels;
  theme: XCardTheme;
  siteHost: string;
  xHandle?: string | null;
}

/**
 * 极简社论研报风 16:9（1200×675 @2x）商业信号分享卡渲染器：
 * - 去套娃框、去满屏圆角胶囊、去霓虹光晕、去卡通 Emoji
 * - 纯粹哑光炭黑（Obsidian）与暖白纸感（Warm Paper）底色 + 1px 极细网格线（Hairline Grid）
 * - 超大号核心商业指标视觉焦点 + 原产品/原题锚点 + 宽松双栏研报拆解
 */
export function renderXShareCardToCanvas(
  canvas: HTMLCanvasElement,
  params: RenderXCardParams
): void {
  const {
    item,
    locale,
    platformLabel,
    categoryLabel,
    lens,
    theme,
    siteHost,
    xHandle,
  } = params;

  const dpr = X_CARD_DPR;
  canvas.width = X_CARD_WIDTH * dpr;
  canvas.height = X_CARD_HEIGHT * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "middle";

  const W = X_CARD_WIDTH;
  const H = X_CARD_HEIGHT;
  const palette = getEditorialPalette(
    theme,
    item.category,
    item.metricType,
    item.sourcePlatform
  );

  // 1. 全画布哑光微调纸感底色（无套娃外框、无蓝紫光晕）
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, palette.canvasBgTop);
  bgGrad.addColorStop(1, palette.canvasBgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 独立查看 PNG 时的极细收边线（贴入 X 时会被 X 原生圆角自然裁齐）
  ctx.strokeStyle = palette.outerHairline;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  const innerX = 76;
  const innerRight = W - 76;
  const innerW = innerRight - innerX;

  // 2. 顶部刊头栏（Masthead：信源圆点 + 平台 + 分类  |  日期 + 评分）
  const mastheadY = 52;
  ctx.fillStyle = palette.dotColor;
  ctx.beginPath();
  ctx.arc(innerX + 4.5, mastheadY, 4.5, 0, Math.PI * 2);
  ctx.fill();

  let mastX = innerX + 18;
  ctx.font = `700 15.5px ${SYSTEM_SANS_FONT}`;
  ctx.fillStyle = palette.primaryText;
  ctx.fillText(platformLabel, mastX, mastheadY);
  mastX += ctx.measureText(platformLabel).width;

  const cleanCategory = stripEditorialEmojis(categoryLabel);
  const cleanAge = item.ageBadge ? stripEditorialEmojis(item.ageBadge) : "";
  const mastMetaSuffix = cleanAge
    ? `   ·   ${cleanCategory}   ·   ${cleanAge}`
    : `   ·   ${cleanCategory}`;
  ctx.font = `500 15px ${SYSTEM_SANS_FONT}`;
  ctx.fillStyle = palette.mutedText;
  ctx.fillText(mastMetaSuffix, mastX, mastheadY);

  const scoreValue = `${item.score.toFixed(1)} / 10`;
  const datePart = `${item.dateKey}   ·   `;
  ctx.font = `600 14.5px ${EDITORIAL_METRIC_FONT}`;
  const scoreValW = ctx.measureText(scoreValue).width;
  ctx.fillStyle = palette.secondaryText;
  ctx.fillText(scoreValue, innerRight - scoreValW, mastheadY);

  ctx.font = `500 14.5px ${EDITORIAL_METRIC_FONT}`;
  const datePartW = ctx.measureText(datePart).width;
  ctx.fillStyle = palette.mutedText;
  ctx.fillText(datePart, innerRight - scoreValW - datePartW, mastheadY);

  drawHorizontalHairline(ctx, innerX, innerRight, 80, palette.hairline);

  // 3. 视觉焦点区：超大号核心商业指标 + 原产品域名/仓库锚点 + 英文原题
  const origin = resolveSignalOriginInfo(item, locale);
  const rawHeroMetric =
    stripEditorialEmojis(item.metricsBadge) || `${item.score.toFixed(1)}`;
  const heroCharLen = Array.from(rawHeroMetric).length;
  const heroFontSize = heroCharLen <= 11 ? 44 : heroCharLen <= 16 ? 38 : 32;
  const heroCenterY = 128;

  ctx.font = `800 ${heroFontSize}px ${EDITORIAL_METRIC_FONT}`;
  const maxHeroW = Math.floor(innerW * 0.48);
  const fittedHeroMetric =
    ctx.measureText(rawHeroMetric).width > maxHeroW
      ? clampSingleLineWithEllipsis(rawHeroMetric, maxHeroW, (s) =>
          ctx.measureText(s).width
        )
      : rawHeroMetric;
  ctx.fillStyle = palette.accentText;
  ctx.fillText(fittedHeroMetric, innerX, heroCenterY);
  const heroActualW = ctx.measureText(fittedHeroMetric).width;

  const productAnchor = buildEditorialProductAnchor(origin, platformLabel);
  if (productAnchor) {
    const divX = innerX + heroActualW + 28;
    const metaX = divX + 26;
    const metaAvailW = innerRight - metaX;

    if (metaAvailW >= 160) {
      drawVerticalHairline(
        ctx,
        divX,
        heroCenterY - 16,
        heroCenterY + 16,
        palette.hairlineStrong
      );

      ctx.font = `600 18px ${EDITORIAL_METRIC_FONT}`;
      const single =
        ctx.measureText(productAnchor).width > metaAvailW
          ? clampSingleLineWithEllipsis(productAnchor, metaAvailW, (s) =>
              ctx.measureText(s).width
            )
          : productAnchor;
      ctx.fillStyle = palette.primaryText;
      ctx.fillText(single, metaX, heroCenterY);
    }
  }

  // 4. 粗体社论主标题（最多 2 行，克制留白）
  const cleanTitle = stripEditorialEmojis(item.title);
  const titleTopY = 174;
  const isLongTitle = cleanTitle.length > 44;
  const titleFontSize = isLongTitle ? 33 : 37;
  const titleLineHeight = isLongTitle ? 46 : 50;

  ctx.font = `800 ${titleFontSize}px ${SYSTEM_SANS_FONT}`;
  const titleLines = wrapTextLines(cleanTitle, innerW, 2, (s) =>
    ctx.measureText(s).width
  );
  ctx.fillStyle = palette.primaryText;
  titleLines.forEach((line, idx) => {
    ctx.fillText(
      line,
      innerX,
      titleTopY + idx * titleLineHeight + titleLineHeight / 2
    );
  });

  const titleBottomY = titleTopY + titleLines.length * titleLineHeight;

  // 5. 左右双栏极细网格研报拆解（01 变现/商业面  |  02 破局/抄作业点，无边框套娃、无 Emoji）
  const gridTopY = Math.max(296, titleBottomY + 24);
  const footerTopY = 588;
  drawHorizontalHairline(ctx, innerX, innerRight, gridTopY, palette.hairline);

  const midX = W / 2;
  const colGutter = 38;
  const colW = midX - innerX - colGutter;

  drawVerticalHairline(
    ctx,
    midX,
    gridTopY + 26,
    footerTopY - 26,
    palette.hairline
  );

  const leftHeading = `01   ${cleanLensHeading(lens.monetization)}`;
  const rightHeading = `02   ${cleanLensHeading(lens.playbook)}`;
  const leftBody = stripEditorialEmojis(item.businessSignal);
  const rightBody = stripEditorialEmojis(item.indieTakeaway);

  const bodyFontSize = 20;
  const bodyLineHeight = 33;

  ctx.font = `400 ${bodyFontSize}px ${SYSTEM_SANS_FONT}`;
  const leftLines = wrapTextLines(leftBody, colW, 4, (s) =>
    ctx.measureText(s).width
  );

  ctx.font = `500 ${bodyFontSize}px ${SYSTEM_SANS_FONT}`;
  const rightLines = wrapTextLines(rightBody, colW, 4, (s) =>
    ctx.measureText(s).width
  );

  const maxColLines = Math.max(1, leftLines.length, rightLines.length);
  const blockContentH = 26 + maxColLines * bodyLineHeight;
  const gridAvailH = footerTopY - gridTopY;
  const colStartY =
    gridTopY + Math.max(28, Math.floor((gridAvailH - blockContentH) / 2));

  // 左栏：01 变现/商业面
  ctx.font = `700 13.5px ${EDITORIAL_METRIC_FONT}`;
  ctx.fillStyle = palette.mutedText;
  ctx.fillText(leftHeading, innerX, colStartY);

  ctx.font = `400 ${bodyFontSize}px ${SYSTEM_SANS_FONT}`;
  ctx.fillStyle = palette.secondaryText;
  leftLines.forEach((line, idx) => {
    ctx.fillText(
      line,
      innerX,
      colStartY + 34 + idx * bodyLineHeight
    );
  });

  // 右栏：02 破局/抄作业点
  const rightColX = midX + colGutter;
  ctx.font = `700 13.5px ${EDITORIAL_METRIC_FONT}`;
  ctx.fillStyle = palette.accentText;
  ctx.fillText(rightHeading, rightColX, colStartY);

  ctx.font = `500 ${bodyFontSize}px ${SYSTEM_SANS_FONT}`;
  ctx.fillStyle = palette.primaryText;
  rightLines.forEach((line, idx) => {
    ctx.fillText(
      line,
      rightColX,
      colStartY + 34 + idx * bodyLineHeight
    );
  });

  // 6. 极简社论底栏（Colophon：单行品牌域名水印 + 纯排印无框标签）
  drawHorizontalHairline(ctx, innerX, innerRight, footerTopY, palette.hairline);

  const footerCenterY = footerTopY + (H - footerTopY) / 2;
  drawMinimalRadarMark(
    ctx,
    innerX,
    footerCenterY - 13,
    26,
    theme,
    palette.hairlineStrong
  );

  let brandCursorX = innerX + 38;
  ctx.font = `700 16px ${SYSTEM_SANS_FONT}`;
  ctx.fillStyle = palette.primaryText;
  ctx.fillText("AI Founder Radar", brandCursorX, footerCenterY);
  brandCursorX += ctx.measureText("AI Founder Radar").width;

  const hostWatermark = xHandle
    ? `   ·   ${siteHost}   ·   @${xHandle}`
    : `   ·   ${siteHost}`;
  ctx.font = `500 14px ${EDITORIAL_METRIC_FONT}`;
  ctx.fillStyle = palette.mutedText;
  ctx.fillText(hostWatermark, brandCursorX, footerCenterY);
  brandCursorX += ctx.measureText(hostWatermark).width;

  // 右下角展示最多 2 个纯排印标签（去除胶囊边框噪音）
  const cleanTags = item.tags
    .map((t) => stripEditorialEmojis(t))
    .filter(Boolean)
    .slice(0, 2);
  if (cleanTags.length > 0) {
    const tagLine = cleanTags.join("    ");
    ctx.font = `500 14px ${SYSTEM_SANS_FONT}`;
    const tagW = ctx.measureText(tagLine).width;
    if (innerRight - tagW > brandCursorX + 32) {
      ctx.fillStyle = palette.mutedText;
      ctx.fillText(tagLine, innerRight - tagW, footerCenterY);
    }
  }

  ctx.restore();
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas PNG serialization failed"));
    }, "image/png");
  });
}

export function downloadCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string
): void {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 优先写入系统图片剪贴板（支持在 X 发帖框直接 Cmd/Ctrl+V 贴图）；
 * 若浏览器安全策略不支持图片剪贴板，自动降级为下载 PNG 文件。
 */
export async function copyCanvasImageToClipboard(
  canvas: HTMLCanvasElement,
  fallbackFilename: string
): Promise<"copied" | "downloaded" | "failed"> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.write &&
      typeof ClipboardItem !== "undefined"
    ) {
      const blobPromise = canvasToPngBlob(canvas);
      const item = new ClipboardItem({ "image/png": blobPromise });
      await navigator.clipboard.write([item]);
      return "copied";
    }
  } catch {
    // 浏览器不支持或权限受限，优雅降级为下载 PNG
  }

  try {
    downloadCanvasPng(canvas, fallbackFilename);
    return "downloaded";
  } catch {
    return "failed";
  }
}
