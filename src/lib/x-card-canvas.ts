import type { Locale } from "@/i18n/config";
import type { CardLensLabels } from "@/i18n/dictionaries";
import type { SignalCategory, SignalItem } from "@/types/signal";

export type XCardTheme = "terminal_dark" | "editorial_light";

export const X_CARD_WIDTH = 1200;
export const X_CARD_HEIGHT = 675;
export const X_CARD_DPR = 2;

const CJK_CHAR_RE =
  /[\u2e80-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

const SYSTEM_SANS_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const SYSTEM_MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace';

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
    const candidate = `${chars.join("").replace(/[\s,;:—–\-/|([{（【「『、，；：]+$/u, "")}${ellipsis}`;
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
      // 单个超长拉丁串：按字符切分
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

interface ThemePalette {
  canvasBg: string;
  glowA: string;
  glowB: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  panelBg: string;
  panelBorder: string;
  divider: string;
  titleColor: string;
  metaText: string;
  mutedText: string;
  bodyText: string;
  labelText: string;
  playbookLabel: string;
  playbookText: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  brandSub: string;
}

function getCategoryAccent(category: SignalCategory): {
  bar: string;
  glow: string;
} {
  switch (category) {
    case "revenue":
      return { bar: "#10B981", glow: "rgba(16, 185, 129, 0.22)" };
    case "launch":
      return { bar: "#F59E0B", glow: "rgba(245, 158, 11, 0.20)" };
    case "pain_point":
      return { bar: "#3B82F6", glow: "rgba(59, 130, 246, 0.22)" };
    case "ai_trend":
      return { bar: "#8B5CF6", glow: "rgba(139, 92, 246, 0.20)" };
  }
}

function getMetricPillColors(
  metricType: SignalItem["metricType"],
  theme: XCardTheme
): { bg: string; border: string; text: string } {
  const dark = theme === "terminal_dark";
  if (metricType === "revenue") {
    return dark
      ? {
          bg: "rgba(16, 185, 129, 0.16)",
          border: "rgba(52, 211, 153, 0.45)",
          text: "#34D399",
        }
      : {
          bg: "#ECFDF5",
          border: "#A7F3D0",
          text: "#047857",
        };
  }
  if (metricType === "pain") {
    return dark
      ? {
          bg: "rgba(59, 130, 246, 0.18)",
          border: "rgba(96, 165, 250, 0.45)",
          text: "#93C5FD",
        }
      : {
          bg: "#EFF6FF",
          border: "#BFDBFE",
          text: "#1D4ED8",
        };
  }
  return dark
    ? {
        bg: "rgba(245, 158, 11, 0.16)",
        border: "rgba(251, 191, 36, 0.45)",
        text: "#FBBF24",
      }
    : {
        bg: "#FFFBEB",
        border: "#FDE68A",
        text: "#B45309",
      };
}

function getPlatformDotHex(platform: SignalItem["sourcePlatform"]): string {
  switch (platform) {
    case "producthunt":
      return "#F97316";
    case "hackernews":
      return "#F59E0B";
    case "indiehackers":
      return "#0EA5E9";
    case "acquire":
      return "#14B8A6";
    case "reddit":
      return "#F43F5E";
    case "github":
      return "#94A3B8";
    case "trustmrr":
      return "#10B981";
    case "appstore":
      return "#3B82F6";
  }
}

function getPalette(theme: XCardTheme, category: SignalCategory): ThemePalette {
  const accent = getCategoryAccent(category);
  if (theme === "editorial_light") {
    return {
      canvasBg: "#EEF2F7",
      glowA: accent.glow.replace("0.22", "0.14").replace("0.20", "0.12"),
      glowB: "rgba(37, 99, 235, 0.08)",
      cardBg: "#FFFFFF",
      cardBorder: "#DDE5F0",
      cardShadow: "rgba(15, 23, 42, 0.09)",
      panelBg: "#F8FAFC",
      panelBorder: "#E2E8F0",
      divider: "#E2E8F0",
      titleColor: "#0F172A",
      metaText: "#334155",
      mutedText: "#64748B",
      bodyText: "#334155",
      labelText: "#0F172A",
      playbookLabel: "#1D4ED8",
      playbookText: "#0F172A",
      pillBg: "#F1F5F9",
      pillBorder: "#E2E8F0",
      pillText: "#475569",
      brandSub: "#64748B",
    };
  }

  return {
    canvasBg: "#070B14",
    glowA: accent.glow,
    glowB: "rgba(37, 99, 235, 0.18)",
    cardBg: "#0F172A",
    cardBorder: "#1E293B",
    cardShadow: "rgba(0, 0, 0, 0.45)",
    panelBg: "#111C33",
    panelBorder: "#1E2D4A",
    divider: "#1E293B",
    titleColor: "#F8FAFC",
    metaText: "#CBD5E1",
    mutedText: "#94A3B8",
    bodyText: "#CBD5E1",
    labelText: "#E2E8F0",
    playbookLabel: "#60A5FA",
    playbookText: "#F8FAFC",
    pillBg: "#162033",
    pillBorder: "#26354F",
    pillText: "#94A3B8",
    brandSub: "#64748B",
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

function drawRadarBrandMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  ctx.save();
  drawRoundedRect(ctx, x, y, size, size, 10);
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, "#2563EB");
  grad.addColorStop(1, "#1D4ED8");
  ctx.fillStyle = grad;
  ctx.fill();

  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.19, -Math.PI * 0.65, Math.PI * 0.35);
  ctx.stroke();

  // Radar sweep beam
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + size * 0.24, cy - size * 0.22);
  ctx.stroke();

  // Center ping
  ctx.fillStyle = "#34D399";
  ctx.beginPath();
  ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
 * 浏览器端零依赖 16:9（1200×675 @2x）高颜值商业信号卡片绘制器
 * 原生调用本机系统字体，四语种（简/繁/日/英）零乱码，可直接复制至剪贴板贴进 X
 */
export function renderXShareCardToCanvas(
  canvas: HTMLCanvasElement,
  params: RenderXCardParams
): void {
  const {
    item,
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
  const palette = getPalette(theme, item.category);
  const accent = getCategoryAccent(item.category);

  // 1. 底层背景与氛围光晕
  ctx.fillStyle = palette.canvasBg;
  ctx.fillRect(0, 0, W, H);

  const glow1 = ctx.createRadialGradient(
    W * 0.88,
    H * 0.12,
    20,
    W * 0.88,
    H * 0.12,
    520
  );
  glow1.addColorStop(0, palette.glowA);
  glow1.addColorStop(1, "transparent");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(
    W * 0.12,
    H * 0.9,
    20,
    W * 0.12,
    H * 0.9,
    460
  );
  glow2.addColorStop(0, palette.glowB);
  glow2.addColorStop(1, "transparent");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // 2. 主体圆角卡片容器
  const padX = 36;
  const padY = 30;
  const cardW = W - padX * 2;
  const cardH = H - padY * 2;

  ctx.save();
  ctx.shadowColor = palette.cardShadow;
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  drawRoundedRect(ctx, padX, padY, cardW, cardH, 24);
  ctx.fillStyle = palette.cardBg;
  ctx.fill();
  ctx.restore();

  drawRoundedRect(ctx, padX, padY, cardW, cardH, 24);
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const innerX = padX + 44;
  const innerRight = padX + cardW - 44;
  const innerW = innerRight - innerX;

  // 3. 顶部元数据栏：左侧（平台圆点 + 来源 + 分类 + 日期） | 右侧（核心指标胶囊 + 评分）
  const topY = padY + 46;
  let leftX = innerX;

  // 来源色点
  ctx.fillStyle = getPlatformDotHex(item.sourcePlatform);
  ctx.beginPath();
  ctx.arc(leftX + 5, topY, 5.5, 0, Math.PI * 2);
  ctx.fill();
  leftX += 19;

  // 平台名
  ctx.font = `700 18px ${SYSTEM_SANS_FONT}`;
  ctx.fillStyle = palette.metaText;
  ctx.fillText(platformLabel, leftX, topY);
  leftX += ctx.measureText(platformLabel).width + 14;

  // 分类胶囊
  ctx.font = `600 15px ${SYSTEM_SANS_FONT}`;
  const catTextW = ctx.measureText(categoryLabel).width;
  const catPillW = catTextW + 22;
  drawRoundedRect(ctx, leftX, topY - 15, catPillW, 30, 8);
  ctx.fillStyle = palette.pillBg;
  ctx.fill();
  ctx.strokeStyle = palette.pillBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = palette.pillText;
  ctx.fillText(categoryLabel, leftX + 11, topY);
  leftX += catPillW + 10;

  // 日期胶囊
  ctx.font = `600 14px ${SYSTEM_MONO_FONT}`;
  const dateText = item.dateKey;
  const datePillW = ctx.measureText(dateText).width + 20;
  drawRoundedRect(ctx, leftX, topY - 15, datePillW, 30, 8);
  ctx.fillStyle = palette.pillBg;
  ctx.fill();
  ctx.fillStyle = palette.mutedText;
  ctx.fillText(dateText, leftX + 10, topY);

  // 右侧：评分徽章 + 核心指标胶囊（从右往左排）
  let rightX = innerRight;
  const scoreLabel = `${item.isTopPick ? "🔥 " : ""}${item.score.toFixed(1)}`;
  ctx.font = `700 16px ${SYSTEM_MONO_FONT}`;
  const scoreW = ctx.measureText(scoreLabel).width + 24;
  rightX -= scoreW;
  drawRoundedRect(ctx, rightX, topY - 17, scoreW, 34, 10);
  if (item.isTopPick) {
    ctx.fillStyle =
      theme === "terminal_dark" ? "rgba(249, 115, 22, 0.18)" : "#FFF7ED";
    ctx.strokeStyle =
      theme === "terminal_dark" ? "rgba(251, 146, 60, 0.45)" : "#FED7AA";
  } else {
    ctx.fillStyle = palette.pillBg;
    ctx.strokeStyle = palette.pillBorder;
  }
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = item.isTopPick
    ? theme === "terminal_dark"
      ? "#FDBA74"
      : "#C2410C"
    : palette.metaText;
  ctx.fillText(scoreLabel, rightX + 12, topY);

  // 核心指标胶囊
  const badgeText = item.metricsBadge.trim();
  if (badgeText) {
    rightX -= 12;
    ctx.font = `700 17px ${SYSTEM_MONO_FONT}`;
    const maxBadgeW = 320;
    const displayBadge =
      ctx.measureText(badgeText).width > maxBadgeW - 28
        ? clampSingleLineWithEllipsis(badgeText, maxBadgeW - 28, (s) =>
            ctx.measureText(s).width
          )
        : badgeText;
    const badgeW = ctx.measureText(displayBadge).width + 30;
    rightX -= badgeW;
    const pillStyle = getMetricPillColors(item.metricType, theme);
    drawRoundedRect(ctx, rightX, topY - 18, badgeW, 36, 999);
    ctx.fillStyle = pillStyle.bg;
    ctx.fill();
    ctx.strokeStyle = pillStyle.border;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = pillStyle.text;
    ctx.fillText(displayBadge, rightX + 15, topY);
  }

  // 4. 主标题区（最多 2 行，自适应字号）
  const titleTopY = padY + 92;
  const cleanTitle = item.title.trim();
  const titleFontSize = cleanTitle.length > 42 ? 31 : 35;
  const titleLineHeight = cleanTitle.length > 42 ? 42 : 46;
  ctx.font = `800 ${titleFontSize}px ${SYSTEM_SANS_FONT}`;
  const titleLines = wrapTextLines(cleanTitle, innerW, 2, (s) =>
    ctx.measureText(s).width
  );

  ctx.fillStyle = palette.titleColor;
  titleLines.forEach((line, idx) => {
    ctx.fillText(line, innerX, titleTopY + idx * titleLineHeight + titleLineHeight / 2);
  });

  // 5. 三要素商业透镜面板（带分类左侧色条）
  const panelTopY = titleTopY + titleLines.length * titleLineHeight + 22;
  const footerH = 74;
  const panelBottomY = padY + cardH - footerH - 18;
  const panelH = Math.max(240, panelBottomY - panelTopY);

  drawRoundedRect(ctx, innerX, panelTopY, innerW, panelH, 16);
  ctx.fillStyle = palette.panelBg;
  ctx.fill();
  ctx.strokeStyle = palette.panelBorder;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 左侧分类强调竖条（裁剪到圆角内部）
  ctx.save();
  drawRoundedRect(ctx, innerX, panelTopY, innerW, panelH, 16);
  ctx.clip();
  ctx.fillStyle = accent.bar;
  ctx.fillRect(innerX, panelTopY, 5.5, panelH);
  ctx.restore();

  const lensRows = [
    {
      label: lens.whatItIs.trim(),
      value: item.whatItIs.trim(),
      isPlaybook: false,
    },
    {
      label: lens.monetization.trim(),
      value: item.businessSignal.trim(),
      isPlaybook: false,
    },
    {
      label: lens.playbook.trim(),
      value: item.indieTakeaway.trim(),
      isPlaybook: true,
    },
  ];

  const rowPadX = 28;
  const rowContentW = innerW - rowPadX * 2;
  const rowFontSize = panelH < 275 ? 19.5 : 21;
  const rowLineHeight = panelH < 275 ? 29 : 31;

  // 预先测量三行布局，计算居中垂直排布
  const measuredRows = lensRows.map((row) => {
    const labelFont = `700 ${rowFontSize}px ${SYSTEM_SANS_FONT}`;
    const bodyFont = `${row.isPlaybook ? 600 : 400} ${rowFontSize}px ${SYSTEM_SANS_FONT}`;

    ctx.font = labelFont;
    const labelW = ctx.measureText(row.label).width + 8;

    // 把标签与正文按「首行同行、次行齐左」排版
    ctx.font = bodyFont;
    const firstLineBudget = Math.max(180, rowContentW - labelW);
    const allTokens = tokenizeForCanvasWrap(row.value);

    // 手动构建最多 2 行：第一行宽度为 firstLineBudget，第二行宽度为 rowContentW
    let line1 = "";
    let nextIdx = 0;
    for (; nextIdx < allTokens.length; nextIdx += 1) {
      const tok = allTokens[nextIdx]!;
      if (tok === " " && !line1) continue;
      const cand = line1 ? `${line1}${tok}` : tok;
      if (ctx.measureText(cand).width <= firstLineBudget) {
        line1 = cand;
      } else {
        break;
      }
    }
    const restText = allTokens.slice(nextIdx).join("").trim();
    const restLines = restText
      ? wrapTextLines(restText, rowContentW, 1, (s) => ctx.measureText(s).width)
      : [];

    const lines = [line1.trimEnd(), ...restLines];
    return {
      ...row,
      labelFont,
      bodyFont,
      labelW,
      lines,
      height: lines.length * rowLineHeight,
    };
  });

  const totalTextHeight = measuredRows.reduce((sum, r) => sum + r.height, 0);
  const gapSpace = Math.max(14, (panelH - 36 - totalTextHeight) / 2);
  let rowY = panelTopY + Math.max(18, (panelH - totalTextHeight - gapSpace * 2) / 2);

  measuredRows.forEach((row, idx) => {
    if (row.isPlaybook) {
      const divY = rowY - gapSpace / 2;
      ctx.strokeStyle = palette.divider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(innerX + rowPadX, divY);
      ctx.lineTo(innerX + innerW - rowPadX, divY);
      ctx.stroke();
    }

    const firstCenterY = rowY + rowLineHeight / 2;
    ctx.font = row.labelFont;
    ctx.fillStyle = row.isPlaybook ? palette.playbookLabel : palette.labelText;
    ctx.fillText(row.label, innerX + rowPadX, firstCenterY);

    ctx.font = row.bodyFont;
    ctx.fillStyle = row.isPlaybook ? palette.playbookText : palette.bodyText;
    if (row.lines[0]) {
      ctx.fillText(row.lines[0], innerX + rowPadX + row.labelW, firstCenterY);
    }
    if (row.lines[1]) {
      ctx.fillText(
        row.lines[1],
        innerX + rowPadX,
        firstCenterY + rowLineHeight
      );
    }

    rowY += row.height + (idx < measuredRows.length - 1 ? gapSpace : 0);
  });

  // 6. 底部品牌水印栏（防二次搬运丢品牌）
  const footerTopY = padY + cardH - footerH;
  ctx.strokeStyle = palette.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerX, footerTopY);
  ctx.lineTo(innerRight, footerTopY);
  ctx.stroke();

  const footerCenterY = footerTopY + footerH / 2 + 2;
  drawRadarBrandMark(ctx, innerX, footerCenterY - 19, 38);

  const brandTextX = innerX + 52;
  ctx.font = `800 19px ${SYSTEM_SANS_FONT}`;
  ctx.fillStyle = palette.titleColor;
  ctx.fillText("AI Founder Radar", brandTextX, footerCenterY - 8);

  const subBrand = xHandle ? `${siteHost}  ·  @${xHandle}` : siteHost;
  ctx.font = `600 13.5px ${SYSTEM_MONO_FONT}`;
  ctx.fillStyle = palette.brandSub;
  ctx.fillText(subBrand, brandTextX, footerCenterY + 12);

  // 右下角展示最多 3 个静态标签胶囊
  const displayTags = item.tags.slice(0, 3);
  ctx.font = `600 14px ${SYSTEM_SANS_FONT}`;
  let tagCursorX = innerRight;
  for (let i = displayTags.length - 1; i >= 0; i -= 1) {
    const tag = displayTags[i]!.trim();
    if (!tag) continue;
    const tw = ctx.measureText(tag).width + 20;
    if (tagCursorX - tw < brandTextX + 270) break;
    tagCursorX -= tw;
    drawRoundedRect(ctx, tagCursorX, footerCenterY - 14, tw, 28, 7);
    ctx.fillStyle = palette.pillBg;
    ctx.fill();
    ctx.strokeStyle = palette.pillBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = palette.pillText;
    ctx.fillText(tag, tagCursorX + 10, footerCenterY);
    tagCursorX -= 8;
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
      // 使用 Promise<Blob> 构造 ClipboardItem，兼容 Safari 异步手势限制
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
