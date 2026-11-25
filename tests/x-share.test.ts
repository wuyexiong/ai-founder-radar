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
import { wrapTextLines } from "../src/lib/x-card-canvas";
import {
  buildXIntentUrl,
  buildXShareBundle,
  containsHttpUrl,
  formatXHashtags,
  measureXTextWeight,
  normalizeXHandle,
  truncateToXWeight,
  X_FREE_CHAR_LIMIT,
  X_URL_WEIGHT,
} from "../src/lib/x-share";
import type { SignalCategory, SignalItem } from "../src/types/signal";
import { resetOfflineTestGuard, withEnv } from "./helpers/env-guard";

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;
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

  it("normalizes X handles safely and rejects invalid characters", () => {
    assert.equal(normalizeXHandle("@aifounderradar"), "aifounderradar");
    assert.equal(normalizeXHandle("  @@Founder_01  "), "Founder_01");
    assert.equal(normalizeXHandle(""), null);
    assert.equal(normalizeXHandle("@bad handle"), null);
    assert.equal(normalizeXHandle("@way_too_long_handle_123"), null);
    assert.equal(normalizeXHandle("javascript:alert(1)"), null);
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

  it("generates anti-throttle Post 1 (zero URLs), UTM-tracked Reply 2, and <=280 Quick Post across all 4 locales & 4 categories with zero EN CJK leaks", () => {
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

        // 1. no_link_post MUST contain zero HTTP URLs (anti-throttle invariant)
        assert.equal(
          containsHttpUrl(bundle.drafts.no_link_post),
          false,
          `no_link_post must not contain links (${locale}/${category})`
        );
        assert.ok(bundle.drafts.no_link_post.includes(lens.whatItIs));
        assert.ok(bundle.drafts.no_link_post.includes(lens.monetization));
        assert.ok(bundle.drafts.no_link_post.includes(lens.playbook));

        // Metrics badge is already in title for these samples -> must not duplicate "[ $14.2k MRR ]"
        const badgeCount =
          bundle.drafts.no_link_post.split("$14.2k MRR").length - 1;
        assert.equal(
          badgeCount,
          1,
          `Duplicate metricsBadge detected in ${locale}/${category} hook`
        );

        // 2. reply_cta MUST point to standalone /signal/[id] with utm_source=x_reply
        assert.equal(containsHttpUrl(bundle.drafts.reply_cta), true);
        assert.ok(
          bundle.drafts.reply_cta.includes(
            `https://radar.aibuildon.com/${locale}/signal/${item.id}?utm_source=x_reply&utm_medium=social&utm_campaign=card_share`
          )
        );

        // 3. quick_intent MUST strictly fit <= 280 X weighted chars, include detail URL & via @handle
        const quickMetrics = measureXTextWeight(bundle.drafts.quick_intent);
        assert.ok(
          quickMetrics.weighted <= X_FREE_CHAR_LIMIT,
          `quick_intent overflowed 280 (${quickMetrics.weighted}) for ${locale}/${category}: ${bundle.drafts.quick_intent}`
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

  it("wraps mixed CJK and English Canvas lines cleanly within maxLines with ellipsis", () => {
    const fakeMeasure = (s: string) =>
      Array.from(s).reduce(
        (acc, ch) => acc + (/[\u3040-\u9fff]/.test(ch) ? 20 : 10),
        0
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
