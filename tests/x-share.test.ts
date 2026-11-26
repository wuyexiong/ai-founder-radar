import "./helpers/env-guard";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogoMark } from "../src/components/brand-logo-icon";
import { SignalCard } from "../src/components/signal-card";
import { SignalDetailView } from "../src/components/signal-detail-view";
import { XShareModal } from "../src/components/x-share-modal";
import { LOCALES } from "../src/i18n/config";
import { getCardLensLabels, getDictionary } from "../src/i18n/dictionaries";
import { buildSignalDetailMetadata } from "../src/lib/seo";
import {
  clearSignalsRepoMemoryCache,
  getSignalDetailPayload,
} from "../src/lib/signals-repo";
import { buildSignalDetailUrl } from "../src/lib/utils";
import {
  renderXShareCardToCanvas,
  stripEditorialEmojis,
  wrapTextLines,
} from "../src/lib/x-card-canvas";
import {
  buildXIntentUrl,
  buildXShareBundle,
  containsHttpUrl,
  formatXHashtags,
  measureXTextWeight,
  neutralizeBareDomainsForX,
  normalizeXHandle,
  resolveSignalOriginInfo,
  stripShareIcons,
  truncateToXWeight,
  X_FREE_CHAR_LIMIT,
  X_URL_WEIGHT,
} from "../src/lib/x-share";
import type { SignalCategory, SignalItem } from "../src/types/signal";
import { resetOfflineTestGuard, withEnv } from "./helpers/env-guard";

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;
const BARE_DOMAIN_LEAK_RE =
  /\b[A-Za-z0-9-]+\.(?:com|io|ai|app|dev|co|net|org|sh|so|xyz)\b/i;
const ALL_CATEGORIES: SignalCategory[] = [
  "revenue",
  "launch",
  "pain_point",
  "ai_trend",
];

function createLongSampleItem(
  locale: (typeof LOCALES)[number],
  category: SignalCategory
): SignalItem {
  if (locale === "en") {
    return {
      id: `sig-x-en-${category}`,
      dateKey: "2026-11-25",
      title:
        "Solo founder turns messy podcast transcripts into SEO-ready chapters, newsletters, and quote cards at $14.2k MRR",
      titleZh: "播客工具月入 $14.2k",
      titleOrig:
        "Solo founder turns messy podcast transcripts into SEO-ready chapters at $14.2k MRR",
      category,
      whatItIs:
        "Lightweight browser studio that converts 1-hour audio files into timestamped show notes and email drafts in 60 seconds.",
      businessSignal:
        "$19/$39 monthly tiers with 88% net margin; 120 programmatic SEO utility landing pages drive nearly 100% organic traffic.",
      indieTakeaway:
        "Skip bloated all-in-one suites. Automate one weekly repetitive chore, capture intent via free calculators, and charge for team export.",
      metricsBadge: "$14.2k MRR",
      metricType:
        category === "revenue"
          ? "revenue"
          : category === "pain_point"
            ? "pain"
            : "heat",
      tags: ["#Micro-SaaS", "#Programmatic SEO", "#Creator Economy", "#中文泄露测试"],
      topics: ["micro-saas", "seo-growth"],
      score: 9.4,
      isTopPick: true,
      sourcePlatform: "trustmrr",
      sourceSublabel: "TrustMRR Verified",
      sourceUrl: "https://trustmrr.com/startup/podnotes",
      productUrl: "https://podnotes.app",
      discussionUrl: "https://trustmrr.com/startup/podnotes",
      publishedAt: "2026-11-25T07:30:00+08:00",
    };
  }

  if (locale === "ja") {
    return {
      id: `sig-x-ja-${category}`,
      dateKey: "2026-11-25",
      title:
        "個人開発のポッドキャスト要約・チャプター自動生成ツールがプログラマティックSEOだけで月商14.2kドルを達成",
      titleZh: "播客工具月入 $14.2k",
      titleOrig: "Podcast show notes generator hits $14.2k MRR",
      category,
      whatItIs:
        "音声ファイルをアップロードするだけで60秒以内にタイムスタンプ付き要約・メルマガ原稿・引用カードを自動生成する軽量Webツール。",
      businessSignal:
        "月額19/39ドルで利益率88%。120個の無料ユーティリティLPによるプログラマティックSEOが新規獲得のほぼ100%を牽引。",
      indieTakeaway:
        "巨大な総合編集ソフトは作らない。毎週発生する単調なルーチン作業を1点突破で自動化し、無料ツール集客から有料書き出しへ誘導するのが鉄板。",
      metricsBadge: "$14.2k MRR",
      metricType: category === "revenue" ? "revenue" : "heat",
      tags: ["#マイクロSaaS", "#SEO集客", "#個人開発"],
      topics: ["micro-saas"],
      score: 9.4,
      isTopPick: true,
      sourcePlatform: "trustmrr",
      sourceSublabel: "TrustMRR 認証済",
      sourceUrl: "https://trustmrr.com/startup/podnotes",
      productUrl: "https://podnotes.app",
      discussionUrl: "https://trustmrr.com/startup/podnotes",
      publishedAt: "2026-11-25T07:30:00+08:00",
    };
  }

  const isTw = locale === "zh-TW";
  return {
    id: `sig-x-${locale}-${category}`,
    dateKey: "2026-11-25",
    title: isTw
      ? "單人開發的播客 Shownotes 自動拆解與郵件生成小工具，零廣告費靠長尾 SEO 穩居 $14.2k MRR"
      : "单人开发的播客 Shownotes 自动拆解与邮件生成小工具，零广告费靠长尾 SEO 稳居 $14.2k MRR",
    titleZh:
      "单人开发的播客 Shownotes 自动拆解与邮件生成小工具，零广告费靠长尾 SEO 稳居 $14.2k MRR",
    titleOrig: "Podcast show notes generator hits $14.2k MRR",
    category,
    whatItIs: isTw
      ? "幫獨立播客主把上傳的音訊在 60 秒內自動拆成帶時間戳章節、金句卡片與電子報初稿的輕量工具。"
      : "帮独立播客主把上传的音频在 60 秒内自动拆成带时间戳章节、金句卡片与邮件通讯稿的轻量工具。",
    businessSignal: isTw
      ? "定價 $19/$39 月付訂閱，淨利率 88%；獲客幾乎全靠 120 個程式化 SEO 免費工具落地頁。"
      : "定价 $19/$39 月付订阅，净利润率 88%；获客几乎全靠 120 个程序化 SEO 免费工具落地页。",
    indieTakeaway: isTw
      ? "不要做大而全的音影片剪輯台！切一個播客主每週必做一次的枯燥髒活，用免費線上小工具引流轉付費訂閱最穩。"
      : "不要做大而全的音视频剪辑台！切一个播客主每周必干 1 次的枯燥脏活，用免费在线小工具引流转付费订阅最稳。",
    metricsBadge: "$14.2k MRR",
    metricType: category === "revenue" ? "revenue" : "heat",
    tags: ["#MicroSaaS", "#SEO获客", "#创作者工具"],
    topics: ["micro-saas", "seo-growth"],
    score: 9.4,
    isTopPick: true,
    sourcePlatform: "trustmrr",
    sourceSublabel: "TrustMRR 实名榜",
    sourceUrl: "https://trustmrr.com/startup/podnotes",
    productUrl: "https://podnotes.app",
    discussionUrl: "https://trustmrr.com/startup/podnotes",
    publishedAt: "2026-11-25T07:30:00+08:00",
  };
}

describe("X Share Studio: Copy Engine, 280-Char Weighting, Canvas Wrapping & UI Integration", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
    clearSignalsRepoMemoryCache();
  });

  afterEach(() => {
    clearSignalsRepoMemoryCache();
    resetOfflineTestGuard();
  });

  it("normalizes X handles safely and neutralizes bare domains for reach-safe posts", () => {
    assert.equal(normalizeXHandle("@aifounderradar"), "aifounderradar");
    assert.equal(normalizeXHandle("  @@Founder_01  "), "Founder_01");
    assert.equal(normalizeXHandle(""), null);
    assert.equal(normalizeXHandle("@bad handle"), null);
    assert.equal(normalizeXHandle("@way_too_long_handle_123"), null);
    assert.equal(normalizeXHandle("javascript:alert(1)"), null);

    // Bare domains become middle-dot safe while numbers & code tokens remain intact
    assert.equal(
      neutralizeBareDomainsForX("https://www.podnotes.app and Cal.com hit $14.2k with Node.js & /products.json"),
      "podnotes·app and Cal·com hit $14.2k with Node.js & /products.json"
    );
  });

  it("measures X weighted length accurately (ASCII=1, CJK/Emoji=2, URL=23) and truncates cleanly", () => {
    assert.equal(measureXTextWeight("hello").weighted, 5);
    assert.equal(measureXTextWeight("你好世界").weighted, 8);
    assert.equal(measureXTextWeight("💰").weighted, 2);

    const longUrl =
      "https://radar.aibuildon.com/zh/signal/sig-20261125-01?utm_source=x_share&utm_medium=social&utm_campaign=card_share";
    const urlMetrics = measureXTextWeight(`Check ${longUrl}`);
    // "Check " (6) + URL (23) = 29
    assert.equal(urlMetrics.weighted, 6 + X_URL_WEIGHT);
    assert.equal(urlMetrics.hasUrl, true);
    assert.equal(urlMetrics.overFreeLimit, false);

    // Trailing period should not collapse into URL
    const withDot = measureXTextWeight(`${longUrl}.`);
    assert.equal(withDot.weighted, X_URL_WEIGHT + 1);

    // Truncate Latin on word boundary
    const cutEn = truncateToXWeight(
      "Build vertical micro SaaS workflows for busy accountants and bookkeepers",
      36
    );
    assert.ok(measureXTextWeight(cutEn).weighted <= 36);
    assert.ok(cutEn.endsWith("…"));
    assert.equal(cutEn.includes("account…"), false);

    // Truncate CJK cleanly
    const cutZh = truncateToXWeight(
      "单人开发的播客工具靠长尾程序化网页稳定收款",
      20
    );
    assert.ok(measureXTextWeight(cutZh).weighted <= 20);
    assert.ok(cutZh.endsWith("…"));
  });

  it("generates icon-free reach-safe Post 1 (with product/source context & zero URLs), full-link Reply 2, and <=280 Quick Post across all 4 locales & 4 categories", () => {
    const PICTO_ICON_RE = /\p{Extended_Pictographic}/u;

    for (const locale of LOCALES) {
      const dict = getDictionary(locale);

      for (const category of ALL_CATEGORIES) {
        const item = createLongSampleItem(locale, category);
        const lens = getCardLensLabels(dict.card, category);
        const bundle = buildXShareBundle({
          item,
          locale,
          lens,
          siteUrl: "https://radar.aibuildon.com/",
          xHandle: "@aifounderradar",
        });

        // 0. Zero emoji icons across ALL 3 copied drafts, and NO "英文原题 / Original post" line
        for (const [modeName, text] of Object.entries(bundle.drafts)) {
          assert.equal(
            PICTO_ICON_RE.test(text),
            false,
            `Emoji icon leaked into ${locale}/${category} (${modeName}): ${text}`
          );
        }
        assert.equal(bundle.drafts.no_link_post.includes("英文原题"), false);
        assert.equal(bundle.drafts.no_link_post.includes("英文原題"), false);
        assert.equal(bundle.drafts.no_link_post.includes("原題："), false);
        assert.equal(bundle.drafts.no_link_post.includes("Original post:"), false);

        // 1. no_link_post MUST contain zero HTTP URLs AND zero bare domains (anti-throttle invariant)
        assert.equal(
          containsHttpUrl(bundle.drafts.no_link_post),
          false,
          `no_link_post must not contain links (${locale}/${category})`
        );
        assert.equal(
          BARE_DOMAIN_LEAK_RE.test(bundle.drafts.no_link_post),
          false,
          `no_link_post leaked t.co bare domain (${locale}/${category}): ${bundle.drafts.no_link_post}`
        );
        assert.ok(bundle.drafts.no_link_post.includes(stripShareIcons(lens.whatItIs)));
        assert.ok(
          bundle.drafts.no_link_post.includes(stripShareIcons(lens.monetization))
        );
        assert.ok(bundle.drafts.no_link_post.includes(stripShareIcons(lens.playbook)));

        // Product & source provenance MUST be visible in Post 1 so readers never wonder what product is discussed
        assert.ok(
          bundle.drafts.no_link_post.includes("podnotes·app"),
          `Post 1 missing product anchor in ${locale}/${category}: ${bundle.drafts.no_link_post}`
        );
        assert.ok(
          bundle.drafts.no_link_post.includes("TrustMRR"),
          `Post 1 missing source platform in ${locale}/${category}`
        );

        // Hook headline (first line) must not duplicate "[ $14.2k MRR ]" when already in title
        const hookLine = bundle.drafts.no_link_post.split("\n")[0] ?? "";
        const hookBadgeCount = hookLine.split("$14.2k MRR").length - 1;
        assert.equal(
          hookBadgeCount,
          1,
          `Duplicate metricsBadge detected in ${locale}/${category} hook: ${hookLine}`
        );

        // 2. reply_cta MUST include direct productUrl, original discussionUrl, AND UTM-tracked Radar breakdown URL
        assert.equal(containsHttpUrl(bundle.drafts.reply_cta), true);
        assert.ok(bundle.drafts.reply_cta.includes("https://podnotes.app"));
        assert.ok(
          bundle.drafts.reply_cta.includes("https://trustmrr.com/startup/podnotes")
        );
        assert.ok(
          bundle.drafts.reply_cta.includes(
            `https://radar.aibuildon.com/${locale}/signal/${item.id}?utm_source=x_reply&utm_medium=social&utm_campaign=card_share`
          )
        );
        assert.ok(
          measureXTextWeight(bundle.drafts.reply_cta).weighted <= X_FREE_CHAR_LIMIT,
          `reply_cta exceeded 280 weighted chars (${locale}/${category})`
        );

        // 3. quick_intent MUST strictly fit <= 280 X weighted chars AND include product name + productUrl + discussionUrl + directUrl + via @handle
        const quickMetrics = measureXTextWeight(bundle.drafts.quick_intent);
        assert.ok(
          quickMetrics.weighted <= X_FREE_CHAR_LIMIT,
          `quick_intent overflowed 280 (${quickMetrics.weighted}) for ${locale}/${category}: ${bundle.drafts.quick_intent}`
        );
        assert.ok(
          bundle.drafts.quick_intent.toLowerCase().includes("podnotes"),
          `quick_intent missing product identifier (${locale}/${category})`
        );
        assert.ok(bundle.drafts.quick_intent.includes("https://podnotes.app"));
        assert.ok(
          bundle.drafts.quick_intent.includes("https://trustmrr.com/startup/podnotes")
        );
        assert.ok(
          bundle.drafts.quick_intent.includes(
            `https://radar.aibuildon.com/${locale}/signal/${item.id}?utm_source=x_share&utm_medium=social&utm_campaign=card_share`
          )
        );
        assert.ok(bundle.drafts.quick_intent.includes("via @aifounderradar"));

        // 4. EN locale MUST have zero CJK leaks across all 3 modes & sanitized hashtags
        if (locale === "en") {
          for (const text of Object.values(bundle.drafts)) {
            assert.equal(
              CJK_RE.test(text),
              false,
              `CJK leaked into EN X draft (${category}): ${text}`
            );
          }
          const tags = formatXHashtags(item.tags, "en", 2);
          assert.equal(tags.length, 2);
          assert.equal(CJK_RE.test(tags.join(" ")), false);
        }
      }
    }

    // buildXIntentUrl encodes text cleanly
    const intentUrl = buildXIntentUrl("Hello X\nhttps://radar.aibuildon.com/en/signal/sig-1");
    assert.ok(intentUrl.startsWith("https://x.com/intent/post?text="));
    assert.ok(intentUrl.includes(encodeURIComponent("Hello X")));

    // buildSignalDetailUrl backward-compatible & supports full UTM params
    assert.equal(
      buildSignalDetailUrl({
        siteUrl: "https://radar.aibuildon.com",
        locale: "en",
        signalId: "sig-42",
        utmSource: "x_reply",
        utmMedium: "social",
        utmCampaign: "card_share",
      }),
      "https://radar.aibuildon.com/en/signal/sig-42?utm_source=x_reply&utm_medium=social&utm_campaign=card_share"
    );
  });

  it("extracts GitHub owner/repo slugs and Reddit pain-point original threads cleanly across locales", () => {
    const ghItem: SignalItem = {
      id: "sig-gh-scrapemark",
      dateKey: "2026-11-26",
      title: "开源网页转结构化 Markdown 提取引擎，24 小时狂揽 1,400 Star",
      titleZh: "开源网页转结构化 Markdown 提取引擎，24 小时狂揽 1,400 Star",
      titleOrig:
        "Scrapemark — Fast, LLM-ready web page to clean Markdown & JSON schema extractor",
      category: "ai_trend",
      whatItIs: "解决 AI Agent 读网页被广告栏污染上下文的轻量开源清洗库。",
      businessSignal: "MIT 协议；可封装垂直行业数据清洗 API。",
      indieTakeaway: "针对房产或外贸黄页做专用提取 API。",
      metricsBadge: "★ 6.8k (+1,400 今日)",
      metricType: "heat",
      tags: ["#GitHub飙升", "#AI基建"],
      score: 8.8,
      isTopPick: true,
      sourcePlatform: "github",
      sourceSublabel: "GitHub Trending",
      sourceUrl: "https://github.com/acme-ai/scrapemark",
      productUrl: "https://scrapemark.dev",
      discussionUrl: "https://github.com/acme-ai/scrapemark",
      publishedAt: "2026-11-26T06:00:00+08:00",
    };

    const zhDict = getDictionary("zh");
    const ghBundle = buildXShareBundle({
      item: ghItem,
      locale: "zh",
      lens: getCardLensLabels(zhDict.card, "ai_trend"),
      siteUrl: "https://radar.aibuildon.com",
    });

    assert.equal(ghBundle.origin.subjectName, "acme-ai/scrapemark");
    assert.ok(
      ghBundle.drafts.no_link_post.includes(
        "开源项目：acme-ai/scrapemark（scrapemark·dev）"
      )
    );
    assert.equal(ghBundle.drafts.no_link_post.includes("英文原题"), false);
    assert.equal(containsHttpUrl(ghBundle.drafts.no_link_post), false);
    assert.ok(
      ghBundle.drafts.reply_cta.includes(
        "开源仓库：https://github.com/acme-ai/scrapemark"
      )
    );
    assert.ok(
      ghBundle.drafts.reply_cta.includes("原产品官网：https://scrapemark.dev")
    );
    assert.ok(
      ghBundle.drafts.quick_intent.startsWith(
        "[★ 6.8k (+1,400 今日)] acme-ai/scrapemark · "
      )
    );
    assert.ok(
      measureXTextWeight(ghBundle.drafts.quick_intent).weighted <= X_FREE_CHAR_LIMIT
    );

    // App Store item with colon in app name & developer in parentheses: strips developer suffix & omits 英文原题
    const appStoreItem: SignalItem = {
      id: "sig-app-mirror",
      dateKey: "2026-11-26",
      title: "Screen Mirroring App：智能电视投屏工具稳居美区畅销榜",
      titleZh: "Screen Mirroring App：智能电视投屏工具稳居美区畅销榜",
      titleOrig: "Screen Mirroring App: Smart TV (Desidari Holding Ltd.)",
      category: "revenue",
      whatItIs: "手机一键无线投屏到各品牌智能电视。",
      businessSignal: "周订阅 + 年订阅内购变现。",
      indieTakeaway: "硬件周边刚需高频搜索词依然能跑出稳定内购。",
      metricsBadge: "US Tools #18",
      metricType: "revenue",
      tags: ["#iOS出海", "#工具App"],
      score: 8.6,
      isTopPick: true,
      sourcePlatform: "appstore",
      sourceSublabel: "US Utilities #18",
      sourceUrl: "https://apps.apple.com/us/app/screen-mirroring/id123456789",
      publishedAt: "2026-11-26T05:30:00+08:00",
    };
    const appOrigin = resolveSignalOriginInfo(appStoreItem, "zh");
    assert.equal(appOrigin.subjectName, "Screen Mirroring App: Smart TV");
    const appBundle = buildXShareBundle({
      item: appStoreItem,
      locale: "zh",
      lens: getCardLensLabels(zhDict.card, "revenue"),
      siteUrl: "https://radar.aibuildon.com",
    });
    assert.ok(
      appBundle.drafts.no_link_post.includes(
        "原产品：Screen Mirroring App: Smart TV（信源：App Store · 美区工具畅销 #18）"
      )
    );
    assert.equal(
      appBundle.drafts.no_link_post.includes("Desidari Holding Ltd."),
      false
    );

    // Unnamed Reddit pain-point thread in EN: includes subreddit provenance with zero icons
    const painEnItem: SignalItem = {
      id: "sig-pain-calendly",
      dateKey: "2026-11-26",
      title:
        "Build a Lightweight Flat-Rate Booking Widget to Undercut Calendly's Per-Seat Tax",
      titleZh: "小商家急求一次性买断的轻量预约组件",
      titleOrig:
        "Is there a lightweight booking widget for local service businesses that doesn't charge $16/seat/month?",
      category: "pain_point",
      whatItIs: "Local service shops need a fast, flat-fee booking widget.",
      businessSignal: "186+ comments demanding a $49-$99 buyout with SMS reminders.",
      indieTakeaway: "Strip enterprise bloat and charge flat with anti-no-show deposits.",
      metricsBadge: "💬 186 Pain Points",
      metricType: "pain",
      tags: ["#SaaSAlternative", "#IndieHacker"],
      score: 9.1,
      isTopPick: true,
      sourcePlatform: "reddit",
      sourceSublabel: "r/SomebodyMakeThis",
      sourceUrl: "https://www.reddit.com/r/SomebodyMakeThis/comments/1abcxyz/booking/",
      publishedAt: "2026-11-26T05:00:00+08:00",
    };

    const enDict = getDictionary("en");
    const painBundle = buildXShareBundle({
      item: painEnItem,
      locale: "en",
      lens: getCardLensLabels(enDict.card, "pain_point"),
      siteUrl: "https://radar.aibuildon.com",
    });

    assert.equal(painBundle.origin.subjectName, null);
    assert.ok(
      painBundle.drafts.no_link_post.includes(
        "Source: Reddit · r/SomebodyMakeThis"
      )
    );
    assert.ok(
      painBundle.drafts.reply_cta.includes(
        "Original (Reddit): https://www.reddit.com/r/SomebodyMakeThis/comments/1abcxyz/booking/"
      )
    );
    assert.equal(CJK_RE.test(painBundle.drafts.no_link_post), false);
    assert.equal(CJK_RE.test(painBundle.drafts.reply_cta), false);
    assert.equal(CJK_RE.test(painBundle.drafts.quick_intent), false);
  });

  it("wraps mixed CJK and English Canvas lines cleanly and renders emoji-free editorial 16:9 Canvas card across themes", () => {
    const fakeMeasure = (s: string) =>
      Array.from(s).reduce(
        (acc, ch) => acc + (/[\u3040-\u9fff]/.test(ch) ? 20 : 10),
        0
      );

    assert.equal(
      stripEditorialEmojis("🧩 痛点场景：🔥 186 💬 评论 ★ 6.8k"),
      "痛点场景： 186 评论 ★ 6.8k"
    );

    const enLines = wrapTextLines(
      "Podcast show notes generator hits $14.2k MRR via programmatic SEO tools",
      260,
      2,
      fakeMeasure
    );
    assert.equal(enLines.length, 2);
    assert.ok(enLines.every((l) => fakeMeasure(l) <= 260));
    assert.ok(enLines[1]!.endsWith("…"));

    const zhLines = wrapTextLines(
      "单人开发的播客工具在60秒内把音频拆成带时间戳章节与邮件通讯稿并稳定收款",
      240,
      2,
      fakeMeasure
    );
    assert.equal(zhLines.length, 2);
    assert.ok(zhLines.every((l) => fakeMeasure(l) <= 240));
    assert.ok(zhLines[1]!.endsWith("…"));

    const PICTO_EMOJI_RE = /\p{Extended_Pictographic}/u;
    let radialGradientCalls = 0;

    for (const theme of ["terminal_dark", "editorial_light"] as const) {
      const drawnTexts: string[] = [];
      const fakeCtx = {
        save: () => undefined,
        restore: () => undefined,
        scale: () => undefined,
        translate: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        arcTo: () => undefined,
        arc: () => undefined,
        closePath: () => undefined,
        fill: () => undefined,
        stroke: () => undefined,
        clip: () => undefined,
        fillRect: () => undefined,
        strokeRect: () => undefined,
        createRadialGradient: () => {
          radialGradientCalls += 1;
          return { addColorStop: () => undefined };
        },
        createLinearGradient: () => ({ addColorStop: () => undefined }),
        measureText: (s: string) => ({ width: fakeMeasure(s) * 0.7 }),
        fillText: (s: string) => {
          drawnTexts.push(s);
        },
        font: "",
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        lineCap: "butt",
        textBaseline: "middle",
      };
      const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => fakeCtx,
      } as unknown as HTMLCanvasElement;

      const zhItem = createLongSampleItem("zh", "revenue");
      const zhDict = getDictionary("zh");

      renderXShareCardToCanvas(fakeCanvas, {
        item: zhItem,
        locale: "zh",
        platformLabel: "TrustMRR",
        categoryLabel: zhDict.card.categories.revenue,
        lens: getCardLensLabels(zhDict.card, "revenue"),
        theme,
        siteHost: "radar.aibuildon.com",
        xHandle: "aifounderradar",
      });

      // Zero neon radial glow blobs
      assert.equal(radialGradientCalls, 0);
      // Hero metric + product domain + 01/02 editorial columns rendered, without redundant origTitle line
      assert.ok(drawnTexts.includes("$14.2k MRR"));
      assert.ok(
        drawnTexts.some((t) => t.includes("podnotes.app")),
        `Canvas failed to render product domain (${theme}): ${drawnTexts.join(" | ")}`
      );
      assert.ok(drawnTexts.some((t) => t.startsWith("01   ")));
      assert.ok(drawnTexts.some((t) => t.startsWith("02   ")));
      // Zero pictographic emojis anywhere on editorial Canvas card
      for (const t of drawnTexts) {
        assert.equal(
          PICTO_EMOJI_RE.test(t),
          false,
          `Emoji leaked onto editorial Canvas card (${theme}): ${t}`
        );
      }
    }
  });

  it("renders X share trigger on SignalCard, SignalDetailView, XShareModal & attaches twitter handle metadata cleanly", async () => {
    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      const item = createLongSampleItem(locale, "revenue");

      const cardHtml = renderToStaticMarkup(
        React.createElement(SignalCard, {
          item,
          locale,
          dict: dict.card,
          isBookmarked: false,
          onToggleBookmark: () => undefined,
        })
      );
      assert.ok(cardHtml.includes(dict.card.shareXTooltip));
      // Modal must stay unmounted until user clicks the X button
      assert.equal(cardHtml.includes('role="dialog"'), false);

      const modalHtml = renderToStaticMarkup(
        React.createElement(XShareModal, {
          open: true,
          onClose: () => undefined,
          item,
          locale,
          placement: "card",
        })
      );
      assert.ok(modalHtml.includes('role="dialog"'));
      assert.ok(modalHtml.includes(dict.xShare.modalTitle));
      assert.ok(modalHtml.includes(dict.xShare.copyImageCta));
      assert.ok(modalHtml.includes(dict.xShare.modes.no_link_post.label));
      assert.ok(modalHtml.includes(dict.xShare.modes.reply_cta.label));
      assert.ok(modalHtml.includes(dict.xShare.modes.quick_intent.label));

      const detailPayload = await getSignalDetailPayload(locale, "sig-20261123-02");
      assert.ok(detailPayload);
      const detailHtml = renderToStaticMarkup(
        React.createElement(SignalDetailView, { payload: detailPayload })
      );
      assert.ok(detailHtml.includes(dict.signalDetail.shareXCta));

      if (locale === "en") {
        assert.equal(CJK_RE.test(cardHtml), false, "EN SignalCard leaked CJK");
        assert.equal(CJK_RE.test(modalHtml), false, "EN XShareModal leaked CJK");
        assert.equal(
          CJK_RE.test(detailHtml),
          false,
          "EN SignalDetailView leaked CJK"
        );
      }
    }

    // Verify NEXT_PUBLIC_X_HANDLE attaches twitter.site & twitter.creator in metadata
    const sampleItem = createLongSampleItem("en", "revenue");
    const metaWithoutHandle = buildSignalDetailMetadata({
      locale: "en",
      item: sampleItem,
    });
    assert.equal(metaWithoutHandle.twitter?.site, undefined);

    await withEnv({ NEXT_PUBLIC_X_HANDLE: "@aifounderradar" }, async () => {
      const metaWithHandle = buildSignalDetailMetadata({
        locale: "en",
        item: sampleItem,
      });
      assert.equal(metaWithHandle.twitter?.site, "@aifounderradar");
      assert.equal(metaWithHandle.twitter?.creator, "@aifounderradar");
    });

    // Verify dual-theme BrandLogoMark & adaptive prefers-color-scheme icon.svg (L2 Mint Paper Light + F5 Obsidian Dark)
    const iconSvg = readFileSync(
      resolve(process.cwd(), "src/app/icon.svg"),
      "utf8"
    );
    assert.ok(iconSvg.includes("@media (prefers-color-scheme: dark)"));
    assert.ok(iconSvg.includes("#064E3B"));
    assert.ok(iconSvg.includes("#F8FAFC"));

    const brandHtml = renderToStaticMarkup(React.createElement(BrandLogoMark));
    assert.ok(brandHtml.includes("dark:hidden"));
    assert.ok(brandHtml.includes("hidden dark:block"));
    assert.ok(brandHtml.includes("fill-[#064E3B] dark:fill-[#F8FAFC]"));
    assert.equal(CJK_RE.test(brandHtml), false);
  });
});
