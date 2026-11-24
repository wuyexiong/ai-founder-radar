import type { Locale } from "@/i18n/config";
import type { IndieToolItem, SignalCategory } from "@/types/signal";

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
    searchDesktop: string;
    searchMobile: string;
    saved: string;
    toggleTheme: string;
    switchLang: string;
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
  };
  card: {
    categories: Record<SignalCategory, string>;
    scoreTooltip: string;
    whatItIs: string;
    monetization: string;
    playbook: string;
    saved: string;
    save: string;
    viewSource: string;
    archivedFrom: (date: string) => string;
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
    newsletterAlready: string;
    newsletterSubmitting: string;
    newsletterError: string;
    newsletterLocalDemo: string;
    newsletterCta: string;
  };
  footer: {
    copyright: string;
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
    searchDesktop: "Search niches, MRR, pain points... (⌘K)",
    searchMobile: "Search niches, MRR, pain points...",
    saved: "Saved",
    toggleTheme: "Toggle color theme",
    switchLang: "Switch language",
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
  },
  card: {
    categories: {
      revenue: "Revenue Case",
      launch: "New Launch",
      pain_point: "Pain Point",
      ai_trend: "AI & OSS",
    },
    scoreTooltip: "AI Commercial Signal Score (1–10)",
    whatItIs: "📌 What it is:",
    monetization: "💵 Monetization:",
    playbook: "💡 Indie Playbook:",
    saved: "Saved",
    save: "Save",
    viewSource: "Source",
    archivedFrom: (date) => `Saved from ${date}`,
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
        url: "https://supabase.com",
      },
      {
        name: "Cloudflare",
        tagline: "At-cost domains, global edge CDN & zero-egress R2",
        category: "DNS & Edge",
        freeTierNote: "Free Forever CDN",
        url: "https://www.cloudflare.com",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "Merchant of Record for global SaaS subscriptions & tax",
        category: "Global Payments",
        freeTierNote: "$0/mo + Per-Tx",
        url: "https://www.creem.io",
      },
      {
        name: "PostHog",
        tagline: "Product analytics, funnels & session replay for builders",
        category: "Growth Analytics",
        freeTierNote: "1M Events/mo Free",
        url: "https://posthog.com",
      },
      {
        name: "Resend",
        tagline: "Transactional & daily digest emails built with React",
        category: "Email API",
        freeTierNote: "3,000 Emails/mo",
        url: "https://resend.com",
      },
    ],
    newsletterTitle: "5-Minute Daily Indie Digest",
    newsletterDesc:
      "Get the top 5 verified Micro-SaaS launches & MRR breakdowns in your inbox at 8 AM.",
    newsletterSuccess: "✓ Subscribed! You're on the daily 8 AM founder list.",
    newsletterAlready: "✓ Already subscribed — language preference updated.",
    newsletterSubmitting: "Saving...",
    newsletterError: "Subscription failed. Please check your email and retry.",
    newsletterLocalDemo:
      "Local demo mode: configure DATABASE_URL in .env.local to save subscriptions.",
    newsletterCta: "Subscribe",
  },
  footer: {
    copyright:
      "AI Founder Radar · High-Signal Micro-SaaS, AI & Indie Hacker Revenue Intelligence · Powered by Next.js + Drizzle + Supabase",
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
    searchDesktop: "搜赛道、MRR、痛点... (⌘K)",
    searchMobile: "搜赛道、MRR、痛点关键词...",
    saved: "收藏",
    toggleTheme: "切换深浅色主题",
    switchLang: "切换语言",
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
  },
  card: {
    categories: {
      revenue: "搞钱实战",
      launch: "新品首发",
      pain_point: "痛点许愿",
      ai_trend: "AI 与开源",
    },
    scoreTooltip: "AI 商业参考价值评分",
    whatItIs: "📌 是什么：",
    monetization: "💵 怎么赚：",
    playbook: "💡 抄作业：",
    saved: "已收藏",
    save: "收藏",
    viewSource: "看原帖",
    archivedFrom: (date) => `收藏自 ${date}`,
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
        url: "https://supabase.com",
      },
      {
        name: "Cloudflare",
        tagline: "成本价域名注册 + 全球免费 CDN 与防刷保护",
        category: "域名 & 安全",
        freeTierNote: "永久免费 CDN",
        url: "https://www.cloudflare.com",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "免海外公司门槛，个人也能收全球美元订阅",
        category: "出海收款",
        freeTierNote: "0 月费按单抽成",
        url: "https://www.creem.io",
      },
      {
        name: "PostHog",
        tagline: "流量统计 + 点击事件漏斗 + 免费用户录屏回放",
        category: "增长分析",
        freeTierNote: "100万事件/月免费",
        url: "https://posthog.com",
      },
      {
        name: "Resend",
        tagline: "用 React 组件发送高颜值注册验证与每日早报邮件",
        category: "邮件服务",
        freeTierNote: "3,000封/月免费",
        url: "https://resend.com",
      },
    ],
    newsletterTitle: "订阅每日 5 分钟出海搞钱早报",
    newsletterDesc: "每天早 8 点推送当日 Top 5 验证过的海外新产品与 MRR 案例。",
    newsletterSuccess: "✓ 订阅成功！你的邮箱已加入每日早 8 点精选推送名单。",
    newsletterAlready: "✓ 该邮箱已在订阅名单中，已同步当前语言偏好。",
    newsletterSubmitting: "提交中...",
    newsletterError: "订阅失败，请检查邮箱格式或稍后重试。",
    newsletterLocalDemo:
      "当前为本地样本演示模式，请在 .env.local 配置 DATABASE_URL 后启用订阅存库。",
    newsletterCta: "免费订阅",
  },
  footer: {
    copyright:
      "AI Founder Radar · 专注全球出海、AI、Micro-SaaS 与独立开发真实变现信号 · Powered by Next.js + Drizzle + Supabase",
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
    searchDesktop: "搜賽道、MRR、痛點... (⌘K)",
    searchMobile: "搜賽道、MRR、痛點關鍵字...",
    saved: "收藏",
    toggleTheme: "切換深淺色主題",
    switchLang: "切換語言",
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
  },
  card: {
    categories: {
      revenue: "搞錢實戰",
      launch: "新品首發",
      pain_point: "痛點許願",
      ai_trend: "AI 與開源",
    },
    scoreTooltip: "AI 商業參考價值評分",
    whatItIs: "📌 是什麼：",
    monetization: "💵 怎麼賺：",
    playbook: "💡 抄作業：",
    saved: "已收藏",
    save: "收藏",
    viewSource: "看原帖",
    archivedFrom: (date) => `收藏自 ${date}`,
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
        url: "https://supabase.com",
      },
      {
        name: "Cloudflare",
        tagline: "成本價網域註冊 + 全球免費 CDN 與防刷保護",
        category: "網域 & 安全",
        freeTierNote: "永久免費 CDN",
        url: "https://www.cloudflare.com",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "免設海外公司門檻，個人也能收全球美元訂閱",
        category: "跨境收款",
        freeTierNote: "0 月費按單抽成",
        url: "https://www.creem.io",
      },
      {
        name: "PostHog",
        tagline: "流量統計 + 點擊事件漏斗 + 免費使用者錄影回放",
        category: "成長分析",
        freeTierNote: "100 萬事件/月免費",
        url: "https://posthog.com",
      },
      {
        name: "Resend",
        tagline: "用 React 元件發送高質感註冊驗證與每日早報信件",
        category: "郵件服務",
        freeTierNote: "3,000 封/月免費",
        url: "https://resend.com",
      },
    ],
    newsletterTitle: "訂閱每日 5 分鐘出海變現早報",
    newsletterDesc: "每天早上 8 點推送當日 Top 5 驗證過的海外新產品與 MRR 案例。",
    newsletterSuccess: "✓ 訂閱成功！你的信箱已加入每日早 8 點精選推送名單。",
    newsletterAlready: "✓ 此信箱已在訂閱名單中，已同步目前語言偏好。",
    newsletterSubmitting: "送出中...",
    newsletterError: "訂閱失敗，請檢查信箱格式或稍後再試。",
    newsletterLocalDemo:
      "目前為本機樣本展示模式，請先於 .env.local 設定 DATABASE_URL 再啟用訂閱。",
    newsletterCta: "免費訂閱",
  },
  footer: {
    copyright:
      "AI Founder Radar · 專注全球出海、AI、Micro-SaaS 與獨立開發真實變現信號 · Powered by Next.js + Drizzle + Supabase",
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
    searchDesktop: "領域・MRR・課題を検索... (⌘K)",
    searchMobile: "領域・MRR・課題キーワードを検索...",
    saved: "保存済み",
    toggleTheme: "テーマを切り替え",
    switchLang: "言語を切り替え",
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
  },
  card: {
    categories: {
      revenue: "収益事例",
      launch: "新着ローンチ",
      pain_point: "課題・ニーズ",
      ai_trend: "AI・OSS",
    },
    scoreTooltip: "AI ビジネス参考スコア (1〜10)",
    whatItIs: "📌 概要：",
    monetization: "💵 収益モデル：",
    playbook: "💡 個人開発のヒント：",
    saved: "保存済み",
    save: "保存",
    viewSource: "元記事",
    archivedFrom: (date) => `${date} の保存`,
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
        url: "https://supabase.com",
      },
      {
        name: "Cloudflare",
        tagline: "原価ドメイン取得 + 無料グローバルCDN＆DDoS保護",
        category: "ドメイン & CDN",
        freeTierNote: "永久無料 CDN",
        url: "https://www.cloudflare.com",
      },
      {
        name: "Creem / Lemon Squeezy",
        tagline: "海外法人不要で世界中のドル建てサブスク決済を導入",
        category: "グローバル決済",
        freeTierNote: "月額$0・成果報酬",
        url: "https://www.creem.io",
      },
      {
        name: "PostHog",
        tagline: "アクセス解析・ファネル分析・ユーザー行動録画を一体化",
        category: "グロース分析",
        freeTierNote: "月100万イベント無料",
        url: "https://posthog.com",
      },
      {
        name: "Resend",
        tagline: "Reactコンポーネントで美しい認証メールや日刊メルマガ配信",
        category: "メール配信API",
        freeTierNote: "月3,000通まで無料",
        url: "https://resend.com",
      },
    ],
    newsletterTitle: "毎日5分の海外個人開発メルマガ",
    newsletterDesc:
      "毎朝8時に厳選された海外Micro-SaaS事例＆MRRデータを5件お届けします。",
    newsletterSuccess: "✓ 購読登録が完了しました！毎朝8時の配信リストに追加されました。",
    newsletterAlready: "✓ すでに登録済みです（言語設定を更新しました）。",
    newsletterSubmitting: "送信中...",
    newsletterError: "登録に失敗しました。メールアドレスをご確認の上、再試行してください。",
    newsletterLocalDemo:
      "ローカルデモモードです。.env.local に DATABASE_URL を設定すると購読保存が有効になります。",
    newsletterCta: "無料購読",
  },
  footer: {
    copyright:
      "AI Founder Radar · 世界のMicro-SaaS・AI・個人開発のリアルな収益シグナルを厳選 · Powered by Next.js + Drizzle + Supabase",
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
