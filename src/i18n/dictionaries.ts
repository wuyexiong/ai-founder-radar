import type { Locale } from "@/i18n/config";
import type { FeedbackType } from "@/lib/feedback";
import type { XShareMode } from "@/lib/x-share";
import type { IndieToolItem, SignalCategory } from "@/types/signal";

export interface CardLensLabels {
  whatItIs: string;
  monetization: string;
  playbook: string;
}

export interface Dictionary {
  meta: {
    siteTitle: string;
    siteDescription: string;
    dailyTitle: (date: string, topTitle?: string, count?: number) => string;
    dailyDescription: (date: string, summary: string, count: number) => string;
  };
  header: {
    tagline: string;
    latestBadge: string;
    viewDate: (date: string) => string;
    jumpToDate: string;
    backToLatestDate: string;
    archiveCount: (count: number) => string;
    searchDesktop: string;
    searchMobile: string;
    saved: string;
    toggleTheme: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    switchLang: string;
    languageMenuTitle: string;
  };
  overview: {
    headingSrOnly: (date: string) => string;
    scannedSummary: (scanned: number, selected: number) => string;
    estReadTime: (mins: number) => string;
    storageCloud: string;
    storageLocal: string;
    editorialPrefix: string;
  };
  tabs: {
    top: string;
    all: string;
    revenue: string;
    launch: string;
    pain_point: string;
    ai_trend: string;
  };
  filters: {
    sourcesLabel: string;
    allSources: string;
    crossTabHint: (count: number) => string;
    filterPlatform: (name: string) => string;
    clearFilters: string;
    anglesLabel: string;
    collapseAngles: string;
    expandAngles: (more: number) => string;
    emptySaved: string;
    emptyFiltered: string;
    resetAll: string;
    searchingArchive: string;
    archiveMatchesHeading: (count: number) => string;
    archiveMatchesSubnote: string;
  };
  savedToolbar: {
    title: (count: number) => string;
    exportMarkdown: string;
    exportJson: string;
    importJson: string;
    importSuccess: (added: number, totalValid: number) => string;
    importError: string;
  };
  card: {
    categories: Record<SignalCategory, string>;
    scoreTooltip: string;
    topPickTooltip: (score: string) => string;
    whatItIs: string;
    monetization: string;
    playbook: string;
    lensByCategory: Record<SignalCategory, CardLensLabels>;
    copyBrief: string;
    copiedBrief: string;
    copyBriefTooltip: string;
    shareX: string;
    shareXTooltip: string;
    shareLinkLabel: string;
    filterByTag: (tag: string) => string;
    saved: string;
    save: string;
    viewSource: string;
    visitProduct: string;
    readDetail: string;
    archivedFrom: (date: string) => string;
  };
  xShare: {
    modalTitle: string;
    modalSubtitle: string;
    closeCta: string;
    cardPreviewLabel: string;
    themeDark: string;
    themeLight: string;
    copyImageCta: string;
    copiedImageCta: string;
    downloadedFallbackCta: string;
    downloadImageCta: string;
    imageHint: string;
    modes: Record<XShareMode, { label: string; badge: string; tip: string }>;
    editorLabel: string;
    resetDraftCta: string;
    noLinkSafeBadge: string;
    utmTrackedBadge: string;
    freeLimitOk: (weighted: number) => string;
    longPostNote: (weighted: number) => string;
    overQuickLimitNote: (weighted: number) => string;
    copyTextCta: string;
    copiedTextCta: string;
    postOnXCta: string;
    nextStepReplyHint: string;
    nextStepReplyCta: string;
  };
  signalDetail: {
    breadcrumbDaily: (date: string) => string;
    breadcrumbSignal: string;
    backToIssue: (date: string) => string;
    visitProductCta: string;
    viewOriginalCta: string;
    copyShareCta: string;
    shareXCta: string;
    relatedHeading: string;
    relatedSubnote: string;
  };
  sidebar: {
    top3Title: string;
    top3Locate: string;
    toolboxTitle: string;
    toolboxBadge: string;
    tools: IndieToolItem[];
    newsletterTitle: string;
    newsletterDesc: string;
    newsletterSuccess: string;
    newsletterCheckInbox: string;
    newsletterPendingMailer: string;
    newsletterAlready: string;
    newsletterSubmitting: string;
    newsletterRateLimited: string;
    newsletterError: string;
    newsletterLocalDemo: string;
    newsletterCta: string;
  };
  footer: {
    copyright: string;
    rssLabel: string;
    llmsLabel: string;
    githubLabel: string;
  };
  feedback: {
    triggerLabel: string;
    triggerTooltip: string;
    footerLabel: string;
    modalTitle: string;
    modalSubtitle: string;
    typeLabel: string;
    types: Record<FeedbackType, string>;
    messageLabel: string;
    messagePlaceholders: Record<FeedbackType, string>;
    contactLabel: string;
    contactPlaceholder: string;
    shortcutHint: string;
    cancelCta: string;
    submitCta: string;
    submittingCta: string;
    successTitle: string;
    successDesc: string;
    sendAnotherCta: string;
    closeCta: string;
    tooShortError: string;
    rateLimitedError: string;
    localDemoError: string;
    submitError: string;
  };
  notFound: {
    title: string;
    desc: string;
    backHome: string;
  };
  errorPage: {
    title: string;
    desc: string;
    retry: string;
    backHome: string;
  };
  hub: {
    breadcrumbHome: string;
    breadcrumbTopics: string;
    breadcrumbSources: string;
    backToLatest: string;
    statsSignals: (count: number) => string;
    statsRevenue: (count: number) => string;
    statsPainPoints: (count: number) => string;
    statsAvgScore: (avg: string) => string;
    updatedAt: (date: string) => string;
    top3HubTitle: string;
    directoryTopicsTitle: string;
    directorySourcesTitle: string;
    emptyHub: string;
  };
}

const EN_DICT: Dictionary = {
  meta: {
    siteTitle:
      "AI Founder Radar — Daily Indie Hacker MRR, Micro-SaaS Launches & Pain Points",
    siteDescription:
      "5-minute daily commercial signals from Product Hunt, Show HN, Indie Hackers, Acquire & Reddit — distilled into What It Is, Monetization, and Replicable Indie Playbooks.",
    dailyTitle: (date, topTitle, count) =>
      topTitle
        ? `${date} Indie SaaS & MRR Signals (${count ?? 0}): ${topTitle} | AI Founder Radar`
        : `${date} Daily Micro-SaaS Launches, MRR & Pain Points | AI Founder Radar`,
    dailyDescription: (date, summary, count) =>
      `${date} Briefing (${count} curated signals): ${summary}`,
  },
  header: {
    tagline: "Global Micro-SaaS & MRR Signal Radar",
    latestBadge: "Latest",
    viewDate: (date) => `View signals for ${date}`,
    jumpToDate: "Browse archive dates",
    backToLatestDate: "Jump to Latest",
    archiveCount: (count) => `${count} archived issues`,
    searchDesktop: "Search niches, MRR, pain points... (⌘K)",
    searchMobile: "Search niches, MRR, pain points...",
    saved: "Saved",
    toggleTheme: "Color theme",
    themeSystem: "Follow system",
    themeLight: "Light",
    themeDark: "Dark",
    switchLang: "Switch language",
    languageMenuTitle: "Language",
  },
  overview: {
    headingSrOnly: (date) =>
      `AI Founder Radar — ${date} Global Micro-SaaS, AI & Indie Hacker Commercial Signals`,
    scannedSummary: (scanned, selected) =>
      `Scanned ${scanned} raw posts · Curated ${selected} high-signal cards`,
    estReadTime: (mins) => `~${mins} min read`,
    storageCloud: "● Live Cloud PostgreSQL",
    storageLocal: "● Local Demo Mode (Configure .env.local for Cloud DB)",
    editorialPrefix: "Daily Pulse: ",
  },
  tabs: {
    top: "Top Picks",
    all: "All Signals",
    revenue: "Revenue & MRR",
    launch: "Launches",
    pain_point: "Pain Points",
    ai_trend: "AI & OSS",
  },
  filters: {
    sourcesLabel: "Sources",
    allSources: "All",
    crossTabHint: (count) =>
      `0 in current tab — click to switch to All Signals (${count})`,
    filterPlatform: (name) => `Filter by ${name}`,
    clearFilters: "Reset",
    anglesLabel: "Angles",
    collapseAngles: "Show less",
    expandAngles: (more) => `+${more} more`,
    emptySaved:
      "No saved signals yet. Click 'Save' on any card to bookmark product ideas.",
    emptyFiltered: "No signal cards match your active filter combination.",
    resetAll: "Reset all filters",
    searchingArchive: "Searching full historical archive...",
    archiveMatchesHeading: (count) =>
      `📚 Historical Archive Matches (${count})`,
    archiveMatchesSubnote:
      "Matched across earlier daily issues — click any date pill to jump to that issue",
  },
  savedToolbar: {
    title: (count) =>
      `${count} Saved Signal${count === 1 ? "" : "s"} · Local Vault`,
    exportMarkdown: "Export Markdown",
    exportJson: "Export JSON Backup",
    importJson: "Import Backup",
    importSuccess: (added, totalValid) =>
      added > 0
        ? `✓ Restored ${added} new signal${added === 1 ? "" : "s"} (${totalValid} valid in backup).`
        : `✓ Backup verified (${totalValid} signals already in your vault).`,
    importError:
      "Import failed: invalid JSON format, unsafe URL, or file exceeds 2MB.",
  },
  card: {
    categories: {
      revenue: "Revenue Case",
      launch: "New Launch",
      pain_point: "Pain Point",
      ai_trend: "AI & OSS",
    },
    scoreTooltip: "AI Commercial Signal Score (1–10)",
    topPickTooltip: (score) =>
      `Top Pick (${score}/10) — High-signal commercial benchmark`,
    whatItIs: "📌 What it is:",
    monetization: "💵 Monetization:",
    playbook: "💡 Indie Playbook:",
    lensByCategory: {
      revenue: {
        whatItIs: "📌 What it is:",
        monetization: "💵 Revenue:",
        playbook: "💡 Playbook:",
      },
      launch: {
        whatItIs: "📌 What it is:",
        monetization: "💵 Pricing:",
        playbook: "💡 Playbook:",
      },
      pain_point: {
        whatItIs: "😤 Buyer pain:",
        monetization: "🔥 Demand:",
        playbook: "🎯 MVP wedge:",
      },
      ai_trend: {
        whatItIs: "🧩 What it does:",
        monetization: "⚖️ Traction:",
        playbook: "🛠️ Wedge:",
      },
    },
    copyBrief: "Copy",
    copiedBrief: "Copied",
    copyBriefTooltip: "Copy 3-point brief & permanent share link",
    shareX: "Share to X",
    shareXTooltip: "Open X Share Studio (16:9 card PNG + anti-throttle templates)",
    shareLinkLabel: "🔗 Signal & Source:",
    filterByTag: (tag) => `Filter current list by ${tag}`,
    saved: "Saved",
    save: "Save",
    viewSource: "Source",
    visitProduct: "Website",
    readDetail: "Full Breakdown",
    archivedFrom: (date) => `Saved from ${date}`,
  },
  xShare: {
    modalTitle: "Share to X",
    modalSubtitle: "Editorial 16:9 card & X post templates.",
    closeCta: "Close",
    cardPreviewLabel: "16:9 Share Card Preview",
    themeDark: "Obsidian",
    themeLight: "Paper",
    copyImageCta: "Copy Card Image",
    copiedImageCta: "Copied — Paste with ⌘/Ctrl+V",
    downloadedFallbackCta: "Saved PNG",
    downloadImageCta: "PNG",
    imageHint: "1200×675 @2x",
    modes: {
      no_link_post: {
        label: "1. Main Post",
        badge: "No Link",
        tip: "Zero external links (reach-safe) · Paste card image, then drop links in Reply 2",
      },
      reply_cta: {
        label: "2. Self-Reply",
        badge: "Source + Site",
        tip: "Reply under Post 1 · Direct product, original source & breakdown links",
      },
      quick_intent: {
        label: "Quick Post",
        badge: "≤280 Chars",
        tip: "Single post ≤280 chars · Product, source & breakdown links included",
      },
    },
    editorLabel: "X Post Copy",
    resetDraftCta: "Reset",
    noLinkSafeBadge: "No external link",
    utmTrackedBadge: "UTM tracked",
    freeLimitOk: (weighted) => `${weighted} / 280`,
    longPostNote: (weighted) => `${weighted} / 280`,
    overQuickLimitNote: (weighted) => `${weighted} / 280`,
    copyTextCta: "Copy Text",
    copiedTextCta: "Copied",
    postOnXCta: "Post on X",
    nextStepReplyHint: "Post 1 ready:",
    nextStepReplyCta: "Switch to 2. Self-Reply",
  },
  signalDetail: {
    breadcrumbDaily: (date) => `${date} Briefing`,
    breadcrumbSignal: "Signal Analysis",
    backToIssue: (date) => `← Back to ${date} Briefing`,
    visitProductCta: "Visit Product Website",
    viewOriginalCta: "Read Original Post",
    copyShareCta: "Copy Brief & Link",
    shareXCta: "Share on X",
    relatedHeading: "Related High-Signal Cases",
    relatedSubnote:
      "Cross-referenced from the AI Founder Radar archive by niche & monetization model",
  },
  sidebar: {
    top3Title: "🏆 Today's Top 3 Signals",
    top3Locate: "Jump to card",
    toolboxTitle: "Zero-Cost Indie Stack",
    toolboxBadge: "Generous Free Tier",
    tools: [
      {
        name: "Supabase",
        tagline: "Open-source Postgres + 50k MAU Auth out of the box",
        category: "Database & Auth",
        freeTierNote: "500MB Free DB",
        url: "https://supabase.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Cloudflare",
        tagline: "At-cost domains, global edge CDN & zero-egress R2",
        category: "DNS & Edge",
        freeTierNote: "Free Forever CDN",
        url: "https://www.cloudflare.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "Merchant of Record for global SaaS subscriptions & tax",
        category: "Global Payments",
        freeTierNote: "$0/mo + Per-Tx",
        url: "https://www.creem.io?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "PostHog",
        tagline: "Product analytics, funnels & session replay for builders",
        category: "Growth Analytics",
        freeTierNote: "1M Events/mo Free",
        url: "https://posthog.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Resend",
        tagline: "Transactional & daily digest emails built with React",
        category: "Email API",
        freeTierNote: "3,000 Emails/mo",
        url: "https://resend.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
    ],
    newsletterTitle: "5-Minute Daily Indie Digest",
    newsletterDesc:
      "Get the top 5 verified Micro-SaaS launches & MRR breakdowns in your inbox at 8 AM.",
    newsletterSuccess: "✓ Subscribed! You're on the daily 8 AM founder list.",
    newsletterCheckInbox:
      "📬 Almost there! Click the confirmation link sent to your inbox to activate your 8 AM digest.",
    newsletterPendingMailer:
      "✓ Email saved as pending — confirmation mail will send once RESEND_API_KEY is configured.",
    newsletterAlready: "✓ Already subscribed — language preference updated.",
    newsletterSubmitting: "Saving...",
    newsletterRateLimited:
      "Too many attempts from your network. Please wait 10 minutes and try again.",
    newsletterError: "Subscription failed. Please check your email and retry.",
    newsletterLocalDemo:
      "Local demo mode: configure DATABASE_URL in .env.local to save subscriptions.",
    newsletterCta: "Subscribe",
  },
  footer: {
    copyright:
      "AI Founder Radar · High-Signal Micro-SaaS, AI & Indie Hacker Revenue Intelligence · Powered by Next.js + Drizzle + Supabase",
    rssLabel: "RSS Feed",
    llmsLabel: "llms.txt (AI Index)",
    githubLabel: "GitHub (MIT)",
  },
  feedback: {
    triggerLabel: "Feedback",
    triggerTooltip: "Send feedback, report a bug, or suggest a signal source",
    footerLabel: "Send Feedback",
    modalTitle: "Send Feedback & Suggestions",
    modalSubtitle:
      "Spot a bug, want a feature, or know a high-signal indie source? Drop a quick note.",
    typeLabel: "Category",
    types: {
      suggestion: "Feature Idea",
      bug: "Bug Report",
      source: "Suggest Source",
      other: "Other",
    },
    messageLabel: "Details",
    messagePlaceholders: {
      suggestion:
        "What workflow, filter, or commercial signal would make AI Founder Radar more useful for you?",
      bug: "What happened, and what page or device were you using?",
      source:
        "Share a subreddit, leaderboard, newsletter, or feed URL worth tracking...",
      other: "Share any thoughts, questions, or ideas...",
    },
    contactLabel: "Contact (optional)",
    contactPlaceholder: "Email or X/Twitter handle if you would like a reply",
    shortcutHint: "Cmd/Ctrl + Enter to submit",
    cancelCta: "Cancel",
    submitCta: "Submit Feedback",
    submittingCta: "Sending...",
    successTitle: "Feedback received — thank you!",
    successDesc:
      "Your note has been saved directly to our product backlog for review.",
    sendAnotherCta: "Send another",
    closeCta: "Done",
    tooShortError: "Please enter at least 4 characters.",
    rateLimitedError:
      "Too many submissions from your network. Please wait 10 minutes and retry.",
    localDemoError:
      "Local demo mode: configure DATABASE_URL in .env.local to save feedback.",
    submitError: "Failed to save feedback right now. Please try again.",
  },
  notFound: {
    title: "Signal Archive Not Found",
    desc: "The requested date or page does not exist in AI Founder Radar yet.",
    backHome: "Back to Latest Signals",
  },
  errorPage: {
    title: "Something went wrong",
    desc: "We couldn't load today's radar signals. Please try again in a moment.",
    retry: "Try Again",
    backHome: "Back to Home",
  },
  hub: {
    breadcrumbHome: "Home",
    breadcrumbTopics: "Topics",
    breadcrumbSources: "Sources",
    backToLatest: "← Latest Daily Briefing",
    statsSignals: (count) => `${count} Curated Signals`,
    statsRevenue: (count) => `${count} Revenue & MRR Cases`,
    statsPainPoints: (count) => `${count} Buyer Pain Points`,
    statsAvgScore: (avg) => `Avg Score ${avg}`,
    updatedAt: (date) => `Updated ${date}`,
    top3HubTitle: "🏆 Top 3 Highest-Signal Cases",
    directoryTopicsTitle: "Explore Profitable Niche Topics",
    directorySourcesTitle: "Browse by Signal Source",
    emptyHub:
      "No signals curated for this hub yet. New global signals sync daily — explore active hubs below.",
  },
};

const ZH_DICT: Dictionary = {
  meta: {
    siteTitle:
      "AI Founder Radar — 出海搞钱与产品灵感雷达 | 每日 5 分钟全球 AI & SaaS 商业信号",
    siteDescription:
      "每日自动扫描 Product Hunt、Reddit 独立开发版块、Show HN 与真实 MRR 榜单，提炼『它是什么、怎么赚钱、如何抄作业』的高信噪比中文商业卡片。",
    dailyTitle: (date, topTitle, count) =>
      topTitle
        ? `${date} 出海商业信号精选（${count ?? 0} 条）：${topTitle} | AI Founder Radar`
        : `${date} 全球 AI 与独立开发搞钱灵感日报 | AI Founder Radar`,
    dailyDescription: (date, summary, count) =>
      `${date} 精选 ${count} 条海外一手商业信号：${summary}`,
  },
  header: {
    tagline: "出海搞钱与产品灵感雷达",
    latestBadge: "最新",
    viewDate: (date) => `查看 ${date}`,
    jumpToDate: "展开历史归档日期选择",
    backToLatestDate: "回到最新一期",
    archiveCount: (count) => `共收录 ${count} 期`,
    searchDesktop: "搜赛道、MRR、痛点... (⌘K)",
    searchMobile: "搜赛道、MRR、痛点关键词...",
    saved: "收藏",
    toggleTheme: "主题模式",
    themeSystem: "跟随电脑",
    themeLight: "浅色",
    themeDark: "深色",
    switchLang: "切换语言",
    languageMenuTitle: "语言",
  },
  overview: {
    headingSrOnly: (date) =>
      `AI Founder Radar — ${date} 全球出海、Micro-SaaS 与独立开发商业信号看板`,
    scannedSummary: (scanned, selected) =>
      `已扫描 ${scanned} 条海外一手信号 · 精选 ${selected} 条商业卡片`,
    estReadTime: (mins) => `预计 ${mins} 分钟刷完`,
    storageCloud: "● 云端 PostgreSQL 实时库",
    storageLocal: "● 本地精选样本模式（配好 .env.local 自动切云端）",
    editorialPrefix: "今日风向速览：",
  },
  tabs: {
    top: "今日必读精选",
    all: "全部信号",
    revenue: "搞钱实战 & MRR",
    launch: "新品首发",
    pain_point: "海外痛点池",
    ai_trend: "AI 与开源",
  },
  filters: {
    sourcesLabel: "信源",
    allSources: "全部",
    crossTabHint: (count) =>
      `当前频道无该源，点击自动切至全部信号查看 ${count} 条`,
    filterPlatform: (name) => `筛选 ${name}`,
    clearFilters: "清空筛选",
    anglesLabel: "切口",
    collapseAngles: "收起切口",
    expandAngles: (more) => `+${more} 更多切口`,
    emptySaved:
      "你还没有收藏任何商机卡片，看到有启发的点子可点右下角「收藏」沉淀灵感。",
    emptyFiltered: "没有找到匹配当前交叉筛选条件的信号卡片。",
    resetAll: "重置全部筛选条件",
    searchingArchive: "正在跨期检索全量历史归档...",
    archiveMatchesHeading: (count) => `📚 跨期历史归档匹配（${count} 条）`,
    archiveMatchesSubnote:
      "以下卡片命中自往期历史库，点击卡片顶部日期胶囊即可直达对应归档期",
  },
  savedToolbar: {
    title: (count) => `本地灵感收藏夹（${count} 条）`,
    exportMarkdown: "导出 Markdown",
    exportJson: "导出 JSON 备份",
    importJson: "导入备份恢复",
    importSuccess: (added, totalValid) =>
      added > 0
        ? `✓ 导入成功：新增恢复 ${added} 条收藏（备份共 ${totalValid} 条有效记录）。`
        : `✓ 校验完成：备份中的 ${totalValid} 条记录均已在收藏夹中。`,
    importError:
      "导入失败：JSON 格式无效、包含不安全链接或文件超过 2MB 上限。",
  },
  card: {
    categories: {
      revenue: "搞钱实战",
      launch: "新品首发",
      pain_point: "痛点许愿",
      ai_trend: "AI 与开源",
    },
    scoreTooltip: "AI 商业参考价值评分",
    topPickTooltip: (score) =>
      `今日必读精选（${score}/10）· 高含金量商业样本`,
    whatItIs: "📌 是什么：",
    monetization: "💵 怎么赚：",
    playbook: "💡 抄作业：",
    lensByCategory: {
      revenue: {
        whatItIs: "📌 是什么：",
        monetization: "💵 怎么赚：",
        playbook: "💡 抄作业：",
      },
      launch: {
        whatItIs: "📌 是什么：",
        monetization: "💵 商业化：",
        playbook: "💡 抄作业：",
      },
      pain_point: {
        whatItIs: "😤 谁在痛：",
        monetization: "🔥 付费点：",
        playbook: "🎯 破局点：",
      },
      ai_trend: {
        whatItIs: "🧩 是什么：",
        monetization: "⚖️ 商业面：",
        playbook: "🛠️ 切入点：",
      },
    },
    copyBrief: "复制",
    copiedBrief: "已复制",
    copyBriefTooltip: "一键复制三要素摘要与独立详情链接",
    shareX: "分享到 X",
    shareXTooltip: "打开 X 分享工作台（16:9 信息卡片图 + 防限流双楼模板）",
    shareLinkLabel: "🔗 详情与原帖：",
    filterByTag: (tag) => `按 ${tag} 筛选本页信号`,
    saved: "已收藏",
    save: "收藏",
    viewSource: "看原帖",
    visitProduct: "直达官网",
    readDetail: "查看拆解详情",
    archivedFrom: (date) => `收藏自 ${date}`,
  },
  xShare: {
    modalTitle: "分享到 X",
    modalSubtitle: "极简研报配图与防限流文案",
    closeCta: "关闭",
    cardPreviewLabel: "16:9 分享卡片预览",
    themeDark: "黑曜石",
    themeLight: "暖白纸",
    copyImageCta: "复制卡片图",
    copiedImageCta: "已复制，去 X 按 ⌘/Ctrl+V 粘贴",
    downloadedFallbackCta: "已保存 PNG",
    downloadImageCta: "PNG",
    imageHint: "1200×675 @2x",
    modes: {
      no_link_post: {
        label: "1. 主帖无链",
        badge: "防限流",
        tip: "零外链防降权 · 贴入左图发 1 楼，再切 2 楼挂原帖与官网",
      },
      reply_cta: {
        label: "2. 评论挂链",
        badge: "原帖+回流",
        tip: "挂在 1 楼首条回复 · 含原产品官网、一手原帖与完整拆解链",
      },
      quick_intent: {
        label: "280字直发",
        badge: "全链直出",
        tip: "单帖 ≤280 权重 · 直接带齐原产品标识、官网、原帖与拆解链",
      },
    },
    editorLabel: "X 推文内容",
    resetDraftCta: "重置",
    noLinkSafeBadge: "无外链",
    utmTrackedBadge: "含归因链",
    freeLimitOk: (weighted) => `${weighted} / 280`,
    longPostNote: (weighted) => `${weighted} / 280`,
    overQuickLimitNote: (weighted) => `${weighted} / 280`,
    copyTextCta: "复制文案",
    copiedTextCta: "已复制",
    postOnXCta: "去 X 发帖",
    nextStepReplyHint: "1 楼已就绪：",
    nextStepReplyCta: "切到 2 楼复制评论链接",
  },
  signalDetail: {
    breadcrumbDaily: (date) => `${date} 日报`,
    breadcrumbSignal: "信号拆解详情",
    backToIssue: (date) => `← 返回 ${date} 当期日报`,
    visitProductCta: "直达产品官网",
    viewOriginalCta: "查看一手原帖",
    copyShareCta: "复制三要素与链接",
    shareXCta: "分享到 X",
    relatedHeading: "同赛道延伸高分案例",
    relatedSubnote: "按相同商业赛道与变现切口交叉匹配的历史精选信号",
  },
  sidebar: {
    top3Title: "🏆 当日高分商机 Top 3",
    top3Locate: "点击定位",
    toolboxTitle: "出海建站零成本工具箱",
    toolboxBadge: "精选免费层",
    tools: [
      {
        name: "Supabase",
        tagline: "开源 PostgreSQL 数据库 + 免费 5万月活登录",
        category: "数据库 & Auth",
        freeTierNote: "500MB 免费库",
        url: "https://supabase.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Cloudflare",
        tagline: "成本价域名注册 + 全球免费 CDN 与防刷保护",
        category: "域名 & 安全",
        freeTierNote: "永久免费 CDN",
        url: "https://www.cloudflare.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "免海外公司门槛，个人也能收全球美元订阅",
        category: "出海收款",
        freeTierNote: "0 月费按单抽成",
        url: "https://www.creem.io?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "PostHog",
        tagline: "流量统计 + 点击事件漏斗 + 免费用户录屏回放",
        category: "增长分析",
        freeTierNote: "100万事件/月免费",
        url: "https://posthog.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Resend",
        tagline: "用 React 组件发送高颜值注册验证与每日早报邮件",
        category: "邮件服务",
        freeTierNote: "3,000封/月免费",
        url: "https://resend.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
    ],
    newsletterTitle: "订阅每日 5 分钟出海搞钱早报",
    newsletterDesc: "每天早 8 点推送当日 Top 5 验证过的海外新产品与 MRR 案例。",
    newsletterSuccess: "✓ 订阅成功！你的邮箱已加入每日早 8 点精选推送名单。",
    newsletterCheckInbox:
      "📬 请前往邮箱点击确认链接完成激活（未确认前不会向你发送早报）。",
    newsletterPendingMailer:
      "✓ 邮箱已登记为待确认状态（配置 RESEND_API_KEY 后将自动发送确认激活邮件）。",
    newsletterAlready: "✓ 该邮箱已在订阅名单中，已同步当前语言偏好。",
    newsletterSubmitting: "提交中...",
    newsletterRateLimited: "当前网络提交过于频繁，请等待 10 分钟后再试。",
    newsletterError: "订阅失败，请检查邮箱格式或稍后重试。",
    newsletterLocalDemo:
      "当前为本地样本演示模式，请在 .env.local 配置 DATABASE_URL 后启用订阅存库。",
    newsletterCta: "免费订阅",
  },
  footer: {
    copyright:
      "AI Founder Radar · 专注全球出海、AI、Micro-SaaS 与独立开发真实变现信号 · Powered by Next.js + Drizzle + Supabase",
    rssLabel: "RSS 订阅源",
    llmsLabel: "llms.txt (AI 索引)",
    githubLabel: "GitHub 开源仓库",
  },
  feedback: {
    triggerLabel: "反馈",
    triggerTooltip: "提交产品建议、问题反馈或推荐优质出海信源",
    footerLabel: "反馈与建议",
    modalTitle: "问题反馈与产品建议",
    modalSubtitle:
      "遇到体验问题、有想要的新功能，或知道值得接入的一手出海信源？欢迎随时留言。",
    typeLabel: "反馈类型",
    types: {
      suggestion: "功能建议",
      bug: "问题反馈",
      source: "推荐信源",
      other: "其他",
    },
    messageLabel: "具体内容",
    messagePlaceholders: {
      suggestion: "你希望增加什么功能、筛选维度或商业拆解视角？",
      bug: "请简单描述遇到的问题现象（如展示异常、链接失效等）...",
      source: "推荐值得抓取的海外社区、MRR 榜单、目录站或 RSS 链接...",
      other: "任何想法、吐槽或合作交流都可以直接写在这里...",
    },
    contactLabel: "联系方式（选填）",
    contactPlaceholder: "如需跟进回复，可留邮箱 / 微信 / X 账号",
    shortcutHint: "支持 ⌘/Ctrl + Enter 快捷提交",
    cancelCta: "取消",
    submitCta: "提交反馈",
    submittingCta: "提交中...",
    successTitle: "已收到你的反馈，非常感谢！",
    successDesc: "你的建议已直接存入后台待办库，我们会逐条查看并持续改进产品。",
    sendAnotherCta: "再提一条",
    closeCta: "完成",
    tooShortError: "请至少输入 4 个字符的具体内容。",
    rateLimitedError: "当前网络提交过于频繁，请等待 10 分钟后再试。",
    localDemoError:
      "当前为本地样本演示模式，请在 .env.local 配置 DATABASE_URL 后启用反馈入库。",
    submitError: "提交失败，请检查网络或稍后重试。",
  },
  notFound: {
    title: "未找到该期商业信号归档",
    desc: "你访问的日期归档或页面暂不存在，可以返回首页查看最新一期精选信号。",
    backHome: "返回最新一期雷达",
  },
  errorPage: {
    title: "页面加载出现异常",
    desc: "暂时无法读取商业信号数据，请点击下方按钮重试。",
    retry: "重新加载",
    backHome: "返回首页",
  },
  hub: {
    breadcrumbHome: "首页",
    breadcrumbTopics: "赛道专题",
    breadcrumbSources: "一手信源",
    backToLatest: "← 返回最新日报",
    statsSignals: (count) => `累计 ${count} 条商业信号`,
    statsRevenue: (count) => `${count} 个真实变现案例`,
    statsPainPoints: (count) => `${count} 条高赞痛点`,
    statsAvgScore: (avg) => `平均评分 ${avg}`,
    updatedAt: (date) => `最近更新 ${date}`,
    top3HubTitle: "🏆 本专题最高分商机 Top 3",
    directoryTopicsTitle: "热门出海赛道专题库",
    directorySourcesTitle: "按海外一手信源检索",
    emptyHub:
      "该专题暂未收录信号卡片，系统每日早间自动同步全球新案例，可先浏览下方热门专题。",
  },
};

const ZH_TW_DICT: Dictionary = {
  meta: {
    siteTitle:
      "AI Founder Radar — 出海搞錢與產品靈感雷達 | 每日 5 分鐘全球 AI & SaaS 商業信號",
    siteDescription:
      "每日自動掃描 Product Hunt、Reddit 獨立開發版塊、Show HN 與真實 MRR 榜單，提煉『它是什麼、怎麼賺錢、如何抄作業』的高信噪比繁體商業卡片。",
    dailyTitle: (date, topTitle, count) =>
      topTitle
        ? `${date} 出海商業信號精選（${count ?? 0} 則）：${topTitle} | AI Founder Radar`
        : `${date} 全球 AI 與獨立開發變現靈感日報 | AI Founder Radar`,
    dailyDescription: (date, summary, count) =>
      `${date} 精選 ${count} 則海外一手商業信號：${summary}`,
  },
  header: {
    tagline: "出海搞錢與產品靈感雷達",
    latestBadge: "最新",
    viewDate: (date) => `查看 ${date}`,
    jumpToDate: "展開歷史歸檔日期選擇",
    backToLatestDate: "回到最新一期",
    archiveCount: (count) => `共收錄 ${count} 期`,
    searchDesktop: "搜賽道、MRR、痛點... (⌘K)",
    searchMobile: "搜賽道、MRR、痛點關鍵字...",
    saved: "收藏",
    toggleTheme: "主題模式",
    themeSystem: "跟隨電腦",
    themeLight: "淺色",
    themeDark: "深色",
    switchLang: "切換語言",
    languageMenuTitle: "語言",
  },
  overview: {
    headingSrOnly: (date) =>
      `AI Founder Radar — ${date} 全球出海、Micro-SaaS 與獨立開發商業信號看板`,
    scannedSummary: (scanned, selected) =>
      `已掃描 ${scanned} 則海外一手信號 · 精選 ${selected} 則商業卡片`,
    estReadTime: (mins) => `預計 ${mins} 分鐘讀完`,
    storageCloud: "● 雲端 PostgreSQL 即時資料庫",
    storageLocal: "● 本機精選樣本模式（設定 .env.local 自動切換雲端）",
    editorialPrefix: "今日風向速覽：",
  },
  tabs: {
    top: "今日必讀精選",
    all: "全部信號",
    revenue: "搞錢實戰 & MRR",
    launch: "新品首發",
    pain_point: "海外痛點池",
    ai_trend: "AI 與開源",
  },
  filters: {
    sourcesLabel: "來源",
    allSources: "全部",
    crossTabHint: (count) =>
      `目前頻道無此來源，點擊自動切至全部信號查看 ${count} 則`,
    filterPlatform: (name) => `篩選 ${name}`,
    clearFilters: "清除篩選",
    anglesLabel: "切角",
    collapseAngles: "收合切角",
    expandAngles: (more) => `+${more} 更多切角`,
    emptySaved:
      "你還沒有收藏任何商機卡片，看到有啟發的點子可點擊右下角「收藏」累積靈感。",
    emptyFiltered: "找不到符合目前交叉篩選條件的信號卡片。",
    resetAll: "重設所有篩選條件",
    searchingArchive: "正在跨期檢索全量歷史歸檔...",
    archiveMatchesHeading: (count) => `📚 跨期歷史歸檔匹配（${count} 則）`,
    archiveMatchesSubnote:
      "以下卡片命中自往期歷史庫，點擊卡片頂部日期膠囊即可直達對應歸檔期",
  },
  savedToolbar: {
    title: (count) => `本機靈感收藏夾（${count} 則）`,
    exportMarkdown: "匯出 Markdown",
    exportJson: "匯出 JSON 備份",
    importJson: "匯入備份還原",
    importSuccess: (added, totalValid) =>
      added > 0
        ? `✓ 匯入成功：新增還原 ${added} 則收藏（備份共 ${totalValid} 則有效紀錄）。`
        : `✓ 驗證完成：備份中的 ${totalValid} 則紀錄皆已在收藏夾中。`,
    importError:
      "匯入失敗：JSON 格式無效、包含不安全連結或檔案超過 2MB 上限。",
  },
  card: {
    categories: {
      revenue: "搞錢實戰",
      launch: "新品首發",
      pain_point: "痛點許願",
      ai_trend: "AI 與開源",
    },
    scoreTooltip: "AI 商業參考價值評分",
    topPickTooltip: (score) =>
      `今日必讀精選（${score}/10）· 高含金量商業樣本`,
    whatItIs: "📌 是什麼：",
    monetization: "💵 怎麼賺：",
    playbook: "💡 抄作業：",
    lensByCategory: {
      revenue: {
        whatItIs: "📌 是什麼：",
        monetization: "💵 怎麼賺：",
        playbook: "💡 抄作業：",
      },
      launch: {
        whatItIs: "📌 是什麼：",
        monetization: "💵 商業化：",
        playbook: "💡 抄作業：",
      },
      pain_point: {
        whatItIs: "😤 誰在痛：",
        monetization: "🔥 付費點：",
        playbook: "🎯 破局點：",
      },
      ai_trend: {
        whatItIs: "🧩 是什麼：",
        monetization: "⚖️ 商業面：",
        playbook: "🛠️ 切入點：",
      },
    },
    copyBrief: "複製",
    copiedBrief: "已複製",
    copyBriefTooltip: "一鍵複製三要素摘要與獨立詳情連結",
    shareX: "分享到 X",
    shareXTooltip: "開啟 X 分享工作台（16:9 資訊卡片圖 + 防限流雙樓模板）",
    shareLinkLabel: "🔗 詳情與原帖：",
    filterByTag: (tag) => `按 ${tag} 篩選本頁信號`,
    saved: "已收藏",
    save: "收藏",
    viewSource: "看原帖",
    visitProduct: "直達官網",
    readDetail: "檢視拆解詳情",
    archivedFrom: (date) => `收藏自 ${date}`,
  },
  xShare: {
    modalTitle: "分享到 X",
    modalSubtitle: "極簡研報配圖與防限流文案",
    closeCta: "關閉",
    cardPreviewLabel: "16:9 分享卡片預覽",
    themeDark: "黑曜石",
    themeLight: "暖白紙",
    copyImageCta: "複製卡片圖",
    copiedImageCta: "已複製，去 X 按 ⌘/Ctrl+V 貼上",
    downloadedFallbackCta: "已儲存 PNG",
    downloadImageCta: "PNG",
    imageHint: "1200×675 @2x",
    modes: {
      no_link_post: {
        label: "1. 主帖無鏈",
        badge: "防限流",
        tip: "零外鏈防降權 · 貼上左圖發 1 樓，再切 2 樓掛原帖與官網",
      },
      reply_cta: {
        label: "2. 留言掛鏈",
        badge: "原帖+回流",
        tip: "掛在 1 樓第一則回覆 · 含原產品官網、一手原帖與完整拆解鏈",
      },
      quick_intent: {
        label: "280字直發",
        badge: "全鏈直出",
        tip: "單帖 ≤280 權重 · 直接帶齊原產品標識、官網、原帖與拆解鏈",
      },
    },
    editorLabel: "X 貼文內容",
    resetDraftCta: "重設",
    noLinkSafeBadge: "無外鏈",
    utmTrackedBadge: "含歸因鏈",
    freeLimitOk: (weighted) => `${weighted} / 280`,
    longPostNote: (weighted) => `${weighted} / 280`,
    overQuickLimitNote: (weighted) => `${weighted} / 280`,
    copyTextCta: "複製文案",
    copiedTextCta: "已複製",
    postOnXCta: "去 X 發帖",
    nextStepReplyHint: "1 樓已就緒：",
    nextStepReplyCta: "切到 2 樓複製留言連結",
  },
  signalDetail: {
    breadcrumbDaily: (date) => `${date} 日報`,
    breadcrumbSignal: "信號拆解詳情",
    backToIssue: (date) => `← 返回 ${date} 當期日報`,
    visitProductCta: "直達產品官網",
    viewOriginalCta: "檢視一手原帖",
    copyShareCta: "複製三要素與連結",
    shareXCta: "分享到 X",
    relatedHeading: "同賽道延伸高分案例",
    relatedSubnote: "按相同商業賽道與變現切角交叉匹配的歷史精選信號",
  },
  sidebar: {
    top3Title: "🏆 當日高分商機 Top 3",
    top3Locate: "點擊定位",
    toolboxTitle: "獨立開發零成本工具箱",
    toolboxBadge: "精選免費方案",
    tools: [
      {
        name: "Supabase",
        tagline: "開源 PostgreSQL 資料庫 + 免費 5 萬月活登入驗證",
        category: "資料庫 & Auth",
        freeTierNote: "500MB 免費額度",
        url: "https://supabase.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Cloudflare",
        tagline: "成本價網域註冊 + 全球免費 CDN 與防刷保護",
        category: "網域 & 安全",
        freeTierNote: "永久免費 CDN",
        url: "https://www.cloudflare.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "免設海外公司門檻，個人也能收全球美元訂閱",
        category: "跨境收款",
        freeTierNote: "0 月費按單抽成",
        url: "https://www.creem.io?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "PostHog",
        tagline: "流量統計 + 點擊事件漏斗 + 免費使用者錄影回放",
        category: "成長分析",
        freeTierNote: "100 萬事件/月免費",
        url: "https://posthog.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Resend",
        tagline: "用 React 元件發送高質感註冊驗證與每日早報信件",
        category: "郵件服務",
        freeTierNote: "3,000 封/月免費",
        url: "https://resend.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
    ],
    newsletterTitle: "訂閱每日 5 分鐘出海變現早報",
    newsletterDesc: "每天早上 8 點推送當日 Top 5 驗證過的海外新產品與 MRR 案例。",
    newsletterSuccess: "✓ 訂閱成功！你的信箱已加入每日早 8 點精選推送名單。",
    newsletterCheckInbox:
      "📬 請前往信箱點擊確認連結完成啟用（未確認前不會向你發送早報）。",
    newsletterPendingMailer:
      "✓ 信箱已登記為待確認狀態（設定 RESEND_API_KEY 後將自動發送確認信啟用）。",
    newsletterAlready: "✓ 此信箱已在訂閱名單中，已同步目前語言偏好。",
    newsletterSubmitting: "送出中...",
    newsletterRateLimited: "目前網路送出過於頻繁，請等待 10 分鐘後再試。",
    newsletterError: "訂閱失敗，請檢查信箱格式或稍後再試。",
    newsletterLocalDemo:
      "目前為本機樣本展示模式，請先於 .env.local 設定 DATABASE_URL 再啟用訂閱。",
    newsletterCta: "免費訂閱",
  },
  footer: {
    copyright:
      "AI Founder Radar · 專注全球出海、AI、Micro-SaaS 與獨立開發真實變現信號 · Powered by Next.js + Drizzle + Supabase",
    rssLabel: "RSS 訂閱源",
    llmsLabel: "llms.txt (AI 索引)",
    githubLabel: "GitHub 開源專案",
  },
  feedback: {
    triggerLabel: "回饋",
    triggerTooltip: "提交產品建議、回報問題或推薦優質海外來源",
    footerLabel: "意見回饋",
    modalTitle: "問題回報與產品建議",
    modalSubtitle:
      "遇到使用問題、有想要的新功能，或知道值得納入的海外商業來源？歡迎直接告訴我們。",
    typeLabel: "回饋類型",
    types: {
      suggestion: "功能建議",
      bug: "問題回報",
      source: "推薦來源",
      other: "其他",
    },
    messageLabel: "具體內容",
    messagePlaceholders: {
      suggestion: "你希望新增什麼功能、篩選條件或商業拆解視角？",
      bug: "請簡單描述遇到的問題狀況（例如版面異常、連結失效等）...",
      source: "推薦值得追蹤的海外社群、MRR 榜單、產品目錄或 RSS 連結...",
      other: "任何想法、建議或交流都歡迎寫在這裡...",
    },
    contactLabel: "聯絡方式（選填）",
    contactPlaceholder: "如需回覆，可留下信箱 / X 帳號 / 其他聯絡方式",
    shortcutHint: "支援 ⌘/Ctrl + Enter 快速送出",
    cancelCta: "取消",
    submitCta: "送出回饋",
    submittingCta: "送出中...",
    successTitle: "已收到你的寶貴回饋，非常感謝！",
    successDesc: "你的建議已直接寫入後台待辦庫，我們會逐一檢視並持續優化。",
    sendAnotherCta: "再寫一則",
    closeCta: "完成",
    tooShortError: "請至少輸入 4 個字元的具體內容。",
    rateLimitedError: "目前網路送出過於頻繁，請等待 10 分鐘後再試。",
    localDemoError:
      "目前為本機樣本展示模式，請先於 .env.local 設定 DATABASE_URL 再啟用回饋存庫。",
    submitError: "送出失敗，請檢查網路連線或稍後再試。",
  },
  notFound: {
    title: "找不到該期商業信號歸檔",
    desc: "你造訪的日期歸檔或頁面目前不存在，請返回首頁檢視最新一期精選信號。",
    backHome: "返回最新一期雷達",
  },
  errorPage: {
    title: "頁面載入發生異常",
    desc: "暫時無法讀取商業信號資料，請點擊下方按鈕重試。",
    retry: "重新載入",
    backHome: "返回首頁",
  },
  hub: {
    breadcrumbHome: "首頁",
    breadcrumbTopics: "賽道專題",
    breadcrumbSources: "一手來源",
    backToLatest: "← 返回最新日報",
    statsSignals: (count) => `累計 ${count} 則商業信號`,
    statsRevenue: (count) => `${count} 個真實變現案例`,
    statsPainPoints: (count) => `${count} 則高讚痛點`,
    statsAvgScore: (avg) => `平均評分 ${avg}`,
    updatedAt: (date) => `最近更新 ${date}`,
    top3HubTitle: "🏆 本專題最高分商機 Top 3",
    directoryTopicsTitle: "熱門出海賽道專題庫",
    directorySourcesTitle: "按海外一手來源檢索",
    emptyHub:
      "此專題目前尚未收錄信號卡片，系統每日自動同步全球新案例，可先瀏覽下方熱門專題。",
  },
};

const JA_DICT: Dictionary = {
  meta: {
    siteTitle:
      "AI Founder Radar — 毎日5分で世界の個人開発・Micro-SaaS収益事例＆課題を発掘",
    siteDescription:
      "Product Hunt、Show HN、Indie Hackers、Redditから厳選した海外SaaS・AIプロダクトの最新トレンド、リアルなMRR収益データ、ユーザーの不満・ニーズを日本語で構造化要約。",
    dailyTitle: (date, topTitle, count) =>
      topTitle
        ? `${date} 海外個人開発・SaaS収益シグナル（${count ?? 0}件）：${topTitle} | AI Founder Radar`
        : `${date} 海外Micro-SaaS・MRR事例＆課題ダイジェスト | AI Founder Radar`,
    dailyDescription: (date, summary, count) =>
      `${date} 厳選ビジネスシグナル（${count}件）：${summary}`,
  },
  header: {
    tagline: "海外SaaS収益＆個人開発アイデアレーダー",
    latestBadge: "最新",
    viewDate: (date) => `${date} のシグナルを表示`,
    jumpToDate: "アーカイブ日付を選択",
    backToLatestDate: "最新号へ戻る",
    archiveCount: (count) => `全 ${count} 号`,
    searchDesktop: "領域・MRR・課題を検索... (⌘K)",
    searchMobile: "領域・MRR・課題キーワードを検索...",
    saved: "保存済み",
    toggleTheme: "テーマ設定",
    themeSystem: "システム設定に従う",
    themeLight: "ライト",
    themeDark: "ダーク",
    switchLang: "言語を切り替え",
    languageMenuTitle: "言語",
  },
  overview: {
    headingSrOnly: (date) =>
      `AI Founder Radar — ${date} 海外Micro-SaaS・AI・個人開発ビジネスシグナル一覧`,
    scannedSummary: (scanned, selected) =>
      `海外一次情報 ${scanned} 件をスキャン · ${selected} 件の厳選ビジネスカード`,
    estReadTime: (mins) => `約 ${mins} 分で読了`,
    storageCloud: "● クラウド PostgreSQL 稼働中",
    storageLocal: "● ローカル厳選サンプル（.env.local 設定でクラウド接続）",
    editorialPrefix: "本日のトレンド総括：",
  },
  tabs: {
    top: "本日の必読厳選",
    all: "すべて",
    revenue: "収益事例 & MRR",
    launch: "新着プロダクト",
    pain_point: "海外の課題・ニーズ",
    ai_trend: "AI・OSS",
  },
  filters: {
    sourcesLabel: "ソース",
    allSources: "すべて",
    crossTabHint: (count) =>
      `現在のタブでは0件 — クリックで「すべて（${count}件）」へ切り替え`,
    filterPlatform: (name) => `${name} で絞り込む`,
    clearFilters: "クリア",
    anglesLabel: "切り口",
    collapseAngles: "閉じる",
    expandAngles: (more) => `+${more} 件を表示`,
    emptySaved:
      "まだ保存されたカードはありません。気になったアイデアの右下「保存」からブックマークできます。",
    emptyFiltered: "現在の絞り込み条件に一致するシグナルカードが見つかりません。",
    resetAll: "すべての条件をリセット",
    searchingArchive: "全期間の過去アーカイブを横断検索中...",
    archiveMatchesHeading: (count) => `📚 過去アーカイブ横断一致（${count} 件）`,
    archiveMatchesSubnote:
      "過去号から一致したカードです。日付ピルをクリックすると該当号へ移動できます",
  },
  savedToolbar: {
    title: (count) => `ローカル保存ボックス（${count} 件）`,
    exportMarkdown: "Markdown 出力",
    exportJson: "JSON バックアップ",
    importJson: "バックアップ復元",
    importSuccess: (added, totalValid) =>
      added > 0
        ? `✓ インポート完了：新たに ${added} 件を復元しました（有効データ ${totalValid} 件）。`
        : `✓ 確認完了：バックアップ内の ${totalValid} 件はすべて保存済みです。`,
    importError:
      "インポート失敗：JSON形式が不正、安全でないURL、または2MB上限を超えています。",
  },
  card: {
    categories: {
      revenue: "収益事例",
      launch: "新着ローンチ",
      pain_point: "課題・ニーズ",
      ai_trend: "AI・OSS",
    },
    scoreTooltip: "AI ビジネス参考スコア (1〜10)",
    topPickTooltip: (score) =>
      `必読厳選シグナル (${score}/10) · 高再現性ビジネス事例`,
    whatItIs: "📌 概要：",
    monetization: "💵 収益モデル：",
    playbook: "💡 個人開発のヒント：",
    lensByCategory: {
      revenue: {
        whatItIs: "📌 製品概要：",
        monetization: "💵 収益構造：",
        playbook: "💡 再現戦略：",
      },
      launch: {
        whatItIs: "📌 製品概要：",
        monetization: "💵 課金設計：",
        playbook: "💡 再現戦略：",
      },
      pain_point: {
        whatItIs: "😤 課題背景：",
        monetization: "🔥 需要強度：",
        playbook: "🎯 参入余地：",
      },
      ai_trend: {
        whatItIs: "🧩 技術概要：",
        monetization: "⚖️ 商用価値：",
        playbook: "🛠️ 活用戦略：",
      },
    },
    copyBrief: "コピー",
    copiedBrief: "コピー済",
    copyBriefTooltip: "3行要約と詳細ページURLをコピー",
    shareX: "X でシェア",
    shareXTooltip: "X シェアスタジオを開く（16:9 カード画像 + インプレッション最適化テンプレ）",
    shareLinkLabel: "🔗 詳細・元記事：",
    filterByTag: (tag) => `${tag} でこのページを絞り込む`,
    saved: "保存済み",
    save: "保存",
    viewSource: "元記事",
    visitProduct: "公式サイト",
    readDetail: "詳細分析を見る",
    archivedFrom: (date) => `${date} の保存`,
  },
  xShare: {
    modalTitle: "X でシェア",
    modalSubtitle: "ミニマルな16:9カード画像と投稿テンプレート",
    closeCta: "閉じる",
    cardPreviewLabel: "16:9 シェアカードプレビュー",
    themeDark: "ダーク",
    themeLight: "ペーパー",
    copyImageCta: "カード画像をコピー",
    copiedImageCta: "コピー完了 — Xで ⌘/Ctrl+V 貼付",
    downloadedFallbackCta: "PNGを保存しました",
    downloadImageCta: "PNG",
    imageHint: "1200×675 @2x",
    modes: {
      no_link_post: {
        label: "1. 本投稿",
        badge: "リンクなし",
        tip: "外部リンクなし · 左の画像を貼って投稿後、「2. リプ誘導」へ",
      },
      reply_cta: {
        label: "2. リプ誘導",
        badge: "元記事+流入",
        tip: "1投稿目のリプライ用 · 公式・元記事・詳細分析リンクを一括案内",
      },
      quick_intent: {
        label: "280字即投稿",
        badge: "直リンク付",
        tip: "1投稿完結（≤280文字） · 製品名＋公式・元記事・解説リンク付き",
      },
    },
    editorLabel: "X 投稿テキスト",
    resetDraftCta: "リセット",
    noLinkSafeBadge: "リンクなし",
    utmTrackedBadge: "計測リンク付",
    freeLimitOk: (weighted) => `${weighted} / 280`,
    longPostNote: (weighted) => `${weighted} / 280`,
    overQuickLimitNote: (weighted) => `${weighted} / 280`,
    copyTextCta: "本文をコピー",
    copiedTextCta: "コピー済",
    postOnXCta: "X で投稿",
    nextStepReplyHint: "1投稿目の準備完了：",
    nextStepReplyCta: "2. リプ誘導へ切替",
  },
  signalDetail: {
    breadcrumbDaily: (date) => `${date} 号`,
    breadcrumbSignal: "シグナル詳細分析",
    backToIssue: (date) => `← ${date} の一覧へ戻る`,
    visitProductCta: "公式サイトを開く",
    viewOriginalCta: "一次情報（元記事）を見る",
    copyShareCta: "要約とリンクをコピー",
    shareXCta: "X でシェア",
    relatedHeading: "関連する高スコア事例",
    relatedSubnote: "同じニッチ領域・収益モデルから抽出した厳選シグナル",
  },
  sidebar: {
    top3Title: "🏆 本日の高スコア Top 3",
    top3Locate: "クリックで移動",
    toolboxTitle: "個人開発ゼロコストツール箱",
    toolboxBadge: "無料枠あり",
    tools: [
      {
        name: "Supabase",
        tagline: "オープンソース PostgreSQL + 月間5万MAUまで認証無料",
        category: "DB & 認証",
        freeTierNote: "500MB 無料枠",
        url: "https://supabase.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Cloudflare",
        tagline: "原価ドメイン取得 + 無料グローバルCDN＆DDoS保護",
        category: "ドメイン & CDN",
        freeTierNote: "永久無料 CDN",
        url: "https://www.cloudflare.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "海外法人不要で世界中のドル建てサブスク決済を導入",
        category: "グローバル決済",
        freeTierNote: "月額$0・成果報酬",
        url: "https://www.creem.io?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "PostHog",
        tagline: "アクセス解析・ファネル分析・ユーザー行動録画を一体化",
        category: "グロース分析",
        freeTierNote: "月100万イベント無料",
        url: "https://posthog.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
      {
        name: "Resend",
        tagline: "Reactコンポーネントで美しい認証メールや日刊メルマガ配信",
        category: "メール配信API",
        freeTierNote: "月3,000通まで無料",
        url: "https://resend.com?utm_source=radar.aibuildon.com&utm_medium=sidebar&utm_campaign=indie_stack",
      },
    ],
    newsletterTitle: "毎日5分の海外個人開発メルマガ",
    newsletterDesc:
      "毎朝8時に厳選された海外Micro-SaaS事例＆MRRデータを5件お届けします。",
    newsletterSuccess: "✓ 購読登録が完了しました！毎朝8時の配信リストに追加されました。",
    newsletterCheckInbox:
      "📬 確認メールを送信しました。受信トレイ内の確認リンクをクリックして配信を有効化してください。",
    newsletterPendingMailer:
      "✓ 確認待ちとして保存しました（RESEND_API_KEY 設定後に確認メールが送信されます）。",
    newsletterAlready: "✓ すでに登録済みです（言語設定を更新しました）。",
    newsletterSubmitting: "送信中...",
    newsletterRateLimited:
      "短時間にリクエストが集中しています。10分ほど待ってから再度お試しください。",
    newsletterError: "登録に失敗しました。メールアドレスをご確認の上、再試行してください。",
    newsletterLocalDemo:
      "ローカルデモモードです。.env.local に DATABASE_URL を設定すると購読保存が有効になります。",
    newsletterCta: "無料購読",
  },
  footer: {
    copyright:
      "AI Founder Radar · 世界のMicro-SaaS・AI・個人開発のリアルな収益シグナルを厳選 · Powered by Next.js + Drizzle + Supabase",
    rssLabel: "RSS フィード",
    llmsLabel: "llms.txt (AI 索引)",
    githubLabel: "GitHub (OSS)",
  },
  feedback: {
    triggerLabel: "ご意見",
    triggerTooltip: "機能要望・不具合報告・おすすめ情報ソースを送る",
    footerLabel: "ご意見・要望",
    modalTitle: "フィードバック・ご要望",
    modalSubtitle:
      "不具合の報告、欲しい機能、または追跡すべき海外インディー情報源があればお気軽にお知らせください。",
    typeLabel: "カテゴリ",
    types: {
      suggestion: "機能要望",
      bug: "不具合報告",
      source: "情報源の推薦",
      other: "その他",
    },
    messageLabel: "詳細内容",
    messagePlaceholders: {
      suggestion:
        "追加してほしい機能やフィルタ、分析の切り口などを教えてください...",
      bug: "発生した問題や表示崩れ、リンク切れなどの詳細を教えてください...",
      source:
        "収集対象に追加してほしい海外コミュニティ・MRRランキング・RSSのURLなど...",
      other: "ご感想やアイデアなど何でも自由にご記入ください...",
    },
    contactLabel: "連絡先（任意）",
    contactPlaceholder: "返信をご希望の場合はメールアドレスや X アカウントをご記入ください",
    shortcutHint: "⌘/Ctrl + Enter で送信",
    cancelCta: "キャンセル",
    submitCta: "送信する",
    submittingCta: "送信中...",
    successTitle: "フィードバックを受け付けました！",
    successDesc:
      "いただいたご意見は開発バックログに直接保存されました。改善の参考にさせていただきます。",
    sendAnotherCta: "続けて送る",
    closeCta: "閉じる",
    tooShortError: "4文字以上で具体的な内容をご入力ください。",
    rateLimitedError:
      "短時間に送信が集中しています。10分ほど待ってから再度お試しください。",
    localDemoError:
      "ローカルデモモードです。.env.local に DATABASE_URL を設定すると保存が有効になります。",
    submitError: "送信に失敗しました。時間をおいて再度お試しください。",
  },
  notFound: {
    title: "アーカイブが見つかりません",
    desc: "指定された日付またはページは AI Founder Radar にまだ存在しません。",
    backHome: "最新シグナルへ戻る",
  },
  errorPage: {
    title: "読み込みエラーが発生しました",
    desc: "シグナルデータの取得中に問題が発生しました。しばらくしてから再度お試しください。",
    retry: "再試行する",
    backHome: "トップへ戻る",
  },
  hub: {
    breadcrumbHome: "ホーム",
    breadcrumbTopics: "領域トピック",
    breadcrumbSources: "情報ソース",
    backToLatest: "← 最新デイリーへ戻る",
    statsSignals: (count) => `厳選シグナル ${count} 件`,
    statsRevenue: (count) => `収益・MRR事例 ${count} 件`,
    statsPainPoints: (count) => `課題・ニーズ ${count} 件`,
    statsAvgScore: (avg) => `平均スコア ${avg}`,
    updatedAt: (date) => `最終更新 ${date}`,
    top3HubTitle: "🏆 この特集の最高スコア Top 3",
    directoryTopicsTitle: "注目ニッチ領域・テーマ別特集",
    directorySourcesTitle: "海外一次情報ソース別アーカイブ",
    emptyHub:
      "このテーマのシグナルは現在収集中です。毎日自動更新される下の注目トピックをご覧ください。",
  },
};

const DICTIONARIES: Record<Locale, Dictionary> = {
  en: EN_DICT,
  zh: ZH_DICT,
  "zh-TW": ZH_TW_DICT,
  ja: JA_DICT,
};

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? EN_DICT;
}

export function getCardLensLabels(
  cardDict: Dictionary["card"],
  category: SignalCategory
): CardLensLabels {
  return (
    cardDict.lensByCategory?.[category] ??
    cardDict.lensByCategory?.launch ?? {
      whatItIs: cardDict.whatItIs,
      monetization: cardDict.monetization,
      playbook: cardDict.playbook,
    }
  );
}
