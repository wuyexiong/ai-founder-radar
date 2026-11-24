import "./helpers/env-guard";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PLATFORM_META, SignalCard } from "../src/components/signal-card";
import { LOCALES } from "../src/i18n/config";
import { getCardLensLabels, getDictionary } from "../src/i18n/dictionaries";
import { resolveOriginalSubtitle } from "../src/lib/utils";
import type { SignalCategory, SignalItem } from "../src/types/signal";
import { resetOfflineTestGuard } from "./helpers/env-guard";

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;
const ALL_CATEGORIES: SignalCategory[] = [
  "revenue",
  "launch",
  "pain_point",
  "ai_trend",
];

function createSampleItem(overrides: Partial<SignalItem> = {}): SignalItem {
  return {
    id: overrides.id ?? "sig-card-p0-01",
    dateKey: overrides.dateKey ?? "2026-11-24",
    title:
      overrides.title ??
      "单人开发的播客 Shownotes 工具，靠长尾 SEO 稳居 $14.2k MRR",
    titleZh:
      overrides.titleZh ??
      "单人开发的播客 Shownotes 工具，靠长尾 SEO 稳居 $14.2k MRR",
    titleOrig:
      overrides.titleOrig ??
      "How my dead-simple podcast show notes generator hit $14.2k MRR",
    category: overrides.category ?? "revenue",
    whatItIs:
      overrides.whatItIs ??
      "帮独立播客主 60 秒内把音频转成带时间戳章节与通讯稿的 Web 工具。",
    businessSignal:
      overrides.businessSignal ??
      "$19/$39 月付订阅，净利率 88%，120 个免费工具落地页驱动自然获客。",
    indieTakeaway:
      overrides.indieTakeaway ??
      "切每周高频枯燥脏活，用免费在线小工具做漏斗顶层 SEO。",
    metricsBadge: overrides.metricsBadge ?? "$14.2k MRR",
    metricType: overrides.metricType ?? "revenue",
    tags: overrides.tags ?? [
      "#MicroSaaS",
      "#SEO获客",
      "#创作者工具",
      "#多余第4标签",
    ],
    topics: overrides.topics ?? ["micro-saas", "seo-growth"],
    score: overrides.score ?? 9.4,
    isTopPick: overrides.isTopPick ?? true,
    sourcePlatform: overrides.sourcePlatform ?? "trustmrr",
    sourceSublabel: overrides.sourceSublabel ?? "TrustMRR 实名榜",
    sourceUrl: overrides.sourceUrl ?? "https://trustmrr.com/startup/podnotes",
    productUrl: overrides.productUrl ?? "https://podnotes.app",
    discussionUrl:
      overrides.discussionUrl ?? "https://trustmrr.com/startup/podnotes",
    ageBadge: overrides.ageBadge,
    publishedAt: overrides.publishedAt ?? "2026-11-24T07:35:00+08:00",
  };
}

describe("SignalCard P0+ UI & Taxonomy Guardrails", () => {
  beforeEach(() => {
    resetOfflineTestGuard();
  });

  afterEach(() => {
    resetOfflineTestGuard();
  });

  it("provides category-adaptive 3-point lens labels across all 4 locales with zero CJK leaks in English", () => {
    for (const locale of LOCALES) {
      const cardDict = getDictionary(locale).card;
      const topTooltip = cardDict.topPickTooltip("9.3");
      assert.ok(topTooltip.includes("9.3"));

      if (locale === "en") {
        assert.equal(
          CJK_RE.test(topTooltip),
          false,
          `CJK leaked into EN topPickTooltip: ${topTooltip}`
        );
      }

      for (const category of ALL_CATEGORIES) {
        const lens = getCardLensLabels(cardDict, category);
        assert.ok(lens.whatItIs.length > 0);
        assert.ok(lens.monetization.length > 0);
        assert.ok(lens.playbook.length > 0);

        if (locale === "en") {
          const combined = `${lens.whatItIs} ${lens.monetization} ${lens.playbook}`;
          assert.equal(
            CJK_RE.test(combined),
            false,
            `CJK leaked into EN lens (${category}): ${combined}`
          );
        }
      }

      assert.notEqual(
        cardDict.lensByCategory.pain_point.monetization,
        cardDict.lensByCategory.revenue.monetization
      );
      assert.notEqual(
        cardDict.lensByCategory.ai_trend.playbook,
        cardDict.lensByCategory.revenue.playbook
      );
    }
  });

  it("resolveOriginalSubtitle suppresses redundant English subtitle on /en and strips synthetic collector suffixes on CJK locales", () => {
    assert.equal(
      resolveOriginalSubtitle({
        locale: "en",
        title: "SnapInvoice: Turn screenshots into tax-ready CSV",
        titleOrig:
          "SnapInvoice — Turn messy email screenshots into tax-ready CSV",
      }),
      null
    );

    assert.equal(
      resolveOriginalSubtitle({
        locale: "zh",
        title: "InvoicePilot 靠 Stripe 自动催付月入 $14.5k",
        titleOrig: "InvoicePilot — Verified Revenue $14.5k",
      }),
      "InvoicePilot"
    );

    assert.equal(
      resolveOriginalSubtitle({
        locale: "ja",
        title: "Same Title",
        titleOrig: "  same title  ",
      }),
      null
    );
  });

  it("renders non-clickable static #tags, clickable rounded-full Topic Hub pills, ageBadge, in-site detail link, and dual outbound links", () => {
    const painItem = createSampleItem({
      id: "sig-pain-test",
      category: "pain_point",
      metricType: "pain",
      score: 9.1,
      isTopPick: true,
      ageBadge: "上架 4 个月",
    });
    const zhCardDict = getDictionary("zh").card;

    const zhHtml = renderToStaticMarkup(
      React.createElement(SignalCard, {
        item: painItem,
        locale: "zh",
        dict: zhCardDict,
        isBookmarked: true,
        onToggleBookmark: () => undefined,
      })
    );

    // Preserves brand colored dot (Decision 3) & removes fake clock
    assert.ok(zhHtml.includes(PLATFORM_META.trustmrr.dotClass));
    assert.equal(zhHtml.includes("<time"), false);
    assert.equal(zhHtml.includes("07:35"), false);

    // Renders ageBadge & Top Pick flame score
    assert.ok(zhHtml.includes("上架 4 个月"));
    assert.ok(zhHtml.includes('data-top-pick="true"'));
    assert.ok(zhHtml.includes("9.1"));

    // Card title links to standalone detail page /[locale]/signal/[id]
    assert.ok(zhHtml.includes('href="/zh/signal/sig-pain-test"'));

    // Pain-point adaptive lens labels
    assert.ok(zhHtml.includes("😤 谁在痛："));
    assert.ok(zhHtml.includes("🔥 付费点："));
    assert.ok(zhHtml.includes("🎯 破局点："));

    // #tags MUST be static non-clickable <span> (NOT <button>) and capped at 3
    assert.ok(zhHtml.includes("<span class=\"select-none"));
    assert.ok(zhHtml.includes("#MicroSaaS</span>"));
    assert.ok(zhHtml.includes("#SEO获客</span>"));
    assert.ok(zhHtml.includes("#创作者工具</span>"));
    assert.equal(zhHtml.includes("#多余第4标签"), false);
    assert.equal(zhHtml.includes("#MicroSaaS</button>"), false);

    // Topic Hub pills remain clickable rounded-full links
    assert.ok(zhHtml.includes('href="/zh/topic/micro-saas"'));
    assert.ok(zhHtml.includes("rounded-full"));

    // Dual outbound links: both "看原帖" (discussionUrl) and "直达官网" (productUrl)
    assert.ok(zhHtml.includes('href="https://trustmrr.com/startup/podnotes"'));
    assert.ok(zhHtml.includes('href="https://podnotes.app/"'));
    assert.ok(zhHtml.includes(zhCardDict.viewSource));
    assert.ok(zhHtml.includes(zhCardDict.visitProduct));

    // English OSS card: hides duplicate English origSubtitle & zero CJK leaks
    const enOssItem = createSampleItem({
      id: "sig-oss-en",
      category: "ai_trend",
      metricType: "heat",
      title: "Scrapemark: Fast Web-to-Markdown Engine for Agents",
      titleOrig: "scrapemark/scrapemark — Fast Web-to-Markdown Engine",
      whatItIs: "Clean HTML-to-Markdown parser built for AI agent pipelines.",
      businessSignal: "MIT license with strong demand for hosted scraping APIs.",
      indieTakeaway: "Package into vertical real-estate or job-board APIs.",
      metricsBadge: "★ 6.8k (+1,400 today)",
      tags: ["#OpenSource", "#AIAgents", "#Cloudflare"],
      ageBadge: "3d old",
      score: 7.9,
      isTopPick: false,
      sourcePlatform: "github",
      sourceSublabel: "GitHub Trending",
    });
    const enHtml = renderToStaticMarkup(
      React.createElement(SignalCard, {
        item: enOssItem,
        locale: "en",
        dict: getDictionary("en").card,
        isBookmarked: false,
        activeTopicSlug: "micro-saas",
        onToggleBookmark: () => undefined,
      })
    );

    assert.equal(enHtml.includes('data-top-pick="true"'), false);
    assert.ok(enHtml.includes("3d old"));
    assert.equal(
      enHtml.includes("scrapemark/scrapemark — Fast Web-to-Markdown Engine"),
      false
    );
    assert.ok(enHtml.includes("🧩 What it does:"));
    assert.equal(CJK_RE.test(enHtml), false);
  });
});
