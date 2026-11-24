import type { Locale } from "@/i18n/config";
import type {
  SignalItem,
  SignalTranslations,
  SourcePlatform,
} from "@/types/signal";

export const TOPIC_SLUGS = [
  "chrome-extension",
  "shopify",
  "stripe",
  "micro-saas",
  "ai-agents",
  "open-source",
  "ios-apps",
  "saas-alternatives",
  "seo-growth",
  "creator-tools",
  "b2b-automation",
  "local-ai",
] as const;

export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export const SOURCE_PLATFORMS: readonly SourcePlatform[] = [
  "producthunt",
  "hackernews",
  "indiehackers",
  "acquire",
  "reddit",
  "github",
  "trustmrr",
  "appstore",
] as const;

export interface LocalizedHubCopy {
  label: string;
  shortLabel: string;
  seoTitle: string;
  h1: string;
  description: string;
}

export interface TopicDefinition {
  slug: TopicSlug;
  pattern: RegExp;
  platforms?: SourcePlatform[];
  copy: Record<Locale, LocalizedHubCopy>;
}

export interface SourceDefinition {
  platform: SourcePlatform;
  brandName: string;
  copy: Record<Locale, LocalizedHubCopy>;
}

export const TOPIC_DEFINITIONS: Record<TopicSlug, TopicDefinition> = {
  "chrome-extension": {
    slug: "chrome-extension",
    pattern:
      /chrome\s*(extension|web\s*store|插件|外掛|拡張)|browser\s*(extension|add-?on)|浏览器插件|瀏覽器外掛|ブラウザ拡張/i,
    copy: {
      en: {
        label: "Chrome Extensions",
        shortLabel: "Chrome Ext",
        seoTitle:
          "Profitable Chrome Extension Ideas, MRR & Launch Case Studies | AI Founder Radar",
        h1: "Chrome Extension Ideas & Verified MRR Case Studies",
        description:
          "Curated browser extension launches, Chrome Web Store organic acquisition playbooks, and verified solo-founder MRR breakdowns.",
      },
      zh: {
        label: "Chrome 浏览器插件",
        shortLabel: "浏览器插件",
        seoTitle:
          "独立开发 Chrome 浏览器插件变现案例、痛点与灵感合集 | AI Founder Radar",
        h1: "Chrome 浏览器插件变现案例与出海灵感库",
        description:
          "聚合海外独立开发者验证过的 Chrome 插件真实 MRR 营收拆解、应用商店自然流获客打法与高赞用户痛点。",
      },
      "zh-TW": {
        label: "Chrome 瀏覽器外掛",
        shortLabel: "瀏覽器外掛",
        seoTitle:
          "獨立開發 Chrome 瀏覽器外掛變現案例、痛點與靈感合集 | AI Founder Radar",
        h1: "Chrome 瀏覽器外掛變現案例與出海靈感庫",
        description:
          "聚合海外獨立開發者驗證過的 Chrome 外掛真實 MRR 營收拆解、線上應用程式商店自然流量獲客打法與高讚使用者痛點。",
      },
      ja: {
        label: "Chrome拡張機能",
        shortLabel: "Chrome拡張",
        seoTitle:
          "個人開発のChrome拡張機能アイデア・MRR収益事例まとめ | AI Founder Radar",
        h1: "Chrome拡張機能の収益化事例＆個人開発アイデア集",
        description:
          "Chromeウェブストアの自然検索流入で収益化する海外個人開発の拡張機能ローンチ事例、価格設計、リアルなMRRデータを厳選。",
      },
    },
  },
  shopify: {
    slug: "shopify",
    pattern:
      /\bshopify\b|跨境电商|跨境電商|独立站卖家|獨立站賣家|e-?commerce\s*(seller|store|merchant|product\s*photo|background)|ec(セラー|商品|ストア)/i,
    copy: {
      en: {
        label: "Shopify & E-Commerce",
        shortLabel: "Shopify",
        seoTitle:
          "Shopify App Ideas, Seller Pain Points & E-Commerce Micro-SaaS MRR | AI Founder Radar",
        h1: "Shopify Apps & E-Commerce Micro-SaaS Signals",
        description:
          "High-intent merchant pain points, lightweight Shopify store add-ons, and profitable e-commerce utility case studies.",
      },
      zh: {
        label: "Shopify 与跨境电商",
        shortLabel: "Shopify 生态",
        seoTitle:
          "Shopify 插件开发灵感、跨境电商卖家痛点与 SaaS 变现案例 | AI Founder Radar",
        h1: "Shopify 生态插件与跨境电商工具商业信号",
        description:
          "追踪海外独立站卖家真实求购痛点、轻量 Shopify 监控与营销插件，以及离钱最近的电商周边 Micro-SaaS 营收案例。",
      },
      "zh-TW": {
        label: "Shopify 與跨境電商",
        shortLabel: "Shopify 生態",
        seoTitle:
          "Shopify 外掛開發靈感、跨境電商賣家痛點與 SaaS 變現案例 | AI Founder Radar",
        h1: "Shopify 生態外掛與跨境電商工具商業信號",
        description:
          "追蹤海外獨立站賣家真實求購痛點、輕量 Shopify 監控與行銷外掛，以及離錢最近的電商周邊 Micro-SaaS 營收案例。",
      },
      ja: {
        label: "Shopify・ECツール",
        shortLabel: "Shopify",
        seoTitle:
          "Shopifyアプリ開発アイデア・EC事業者ニーズ＆収益事例 | AI Founder Radar",
        h1: "Shopify周辺ツール＆EC向けMicro-SaaS収益シグナル",
        description:
          "課金意欲の高いECセラーのリアルな不満・要望から、少人数で運営できるShopifyプラグインのMRR達成事例まで網羅。",
      },
    },
  },
  stripe: {
    slug: "stripe",
    pattern:
      /\bstripe\b|\bdunning\b|failed-payment|churn\s*recovery|防爽约|防爽約|扣款失败|扣款失敗|決済失敗/i,
    copy: {
      en: {
        label: "Stripe & Billing Tools",
        shortLabel: "Stripe",
        seoTitle:
          "Stripe Ecosystem Micro-SaaS, Churn Recovery & Billing Tool Ideas | AI Founder Radar",
        h1: "Stripe Ecosystem & Revenue Recovery Micro-SaaS",
        description:
          "Verified B2B plugins built around Stripe webhooks, failed-payment dunning, anti-no-show deposits, and high-ROI billing workflows.",
      },
      zh: {
        label: "Stripe 支付与防流失",
        shortLabel: "Stripe 生态",
        seoTitle:
          "Stripe 生态插件、订阅防流失与支付周边 Micro-SaaS 变现案例 | AI Founder Radar",
        h1: "Stripe 支付生态与订阅挽回工具商业信号",
        description:
          "聚焦直接帮老板多赚钱或挽回坏账的 Stripe Webhook 周边工具、失败扣款催付、防爽约押金与高留存 B2B 小插件。",
      },
      "zh-TW": {
        label: "Stripe 支付與防流失",
        shortLabel: "Stripe 生態",
        seoTitle:
          "Stripe 生態外掛、訂閱防流失與支付周邊 Micro-SaaS 變現案例 | AI Founder Radar",
        h1: "Stripe 支付生態與訂閱挽回工具商業信號",
        description:
          "聚焦直接幫老闆多賺錢或挽回壞帳的 Stripe Webhook 周邊工具、失敗扣款催付、防爽約訂金與高留存 B2B 小外掛。",
      },
      ja: {
        label: "Stripe連携・決済SaaS",
        shortLabel: "Stripe",
        seoTitle:
          "Stripeエコシステム・決済リカバリー系Micro-SaaS収益事例 | AI Founder Radar",
        h1: "Stripe連携ツール＆チャーン防止SaaSビジネスシグナル",
        description:
          "決済失敗の自動回収（ダニング）やドタキャン防止決済など、ROIが明確で解約率の低いStripe周辺B2B事例を集約。",
      },
    },
  },
  "micro-saas": {
    slug: "micro-saas",
    pattern:
      /micro-?saas|マイクロsaas|#b2bsaas\b|一人公司|单人开发|單人開發|solo\s*(founder|saas|consultant)|bootstrapped/i,
    copy: {
      en: {
        label: "Micro-SaaS & Solo Founders",
        shortLabel: "Micro-SaaS",
        seoTitle:
          "Profitable Micro-SaaS Ideas & Bootstrapped Solo Founder MRR Cases | AI Founder Radar",
        h1: "Micro-SaaS Ideas & Verified Bootstrapped MRR",
        description:
          "Real-world Micro-SaaS products built by solo founders and tiny teams — complete with pricing tiers, acquisition channels, and net margins.",
      },
      zh: {
        label: "Micro-SaaS 与一人公司",
        shortLabel: "Micro-SaaS",
        seoTitle:
          "Micro-SaaS 独立开发赚钱案例、一人公司高毛利产品灵感库 | AI Founder Radar",
        h1: "Micro-SaaS 与一人公司真实 MRR 变现案例",
        description:
          "精选全球单人开发者与极小团队跑通的 Micro-SaaS 商业样本，拆解细分切口、定价策略、净利润率与可复制抄作业路径。",
      },
      "zh-TW": {
        label: "Micro-SaaS 與一人公司",
        shortLabel: "Micro-SaaS",
        seoTitle:
          "Micro-SaaS 獨立開發賺錢案例、一人公司高毛利產品靈感庫 | AI Founder Radar",
        h1: "Micro-SaaS 與一人公司真實 MRR 變現案例",
        description:
          "精選全球單人開發者與極小團隊跑通的 Micro-SaaS 商業樣本，拆解細分切角、定價策略、淨利率與可複製實戰路徑。",
      },
      ja: {
        label: "マイクロSaaS・個人開発",
        shortLabel: "マイクロSaaS",
        seoTitle:
          "個人開発マイクロSaaSの収益事例・MRR達成プロダクト集 | AI Founder Radar",
        h1: "マイクロSaaS＆ソロ開発者のリアルMRR収益事例",
        description:
          "個人開発者や少人数チームが運営する高利益率なMicro-SaaSの価格モデル、集客導線、ニッチ戦略を体系的に収録。",
      },
    },
  },
  "ai-agents": {
    slug: "ai-agents",
    pattern:
      /\bai\s*agent|\bllm\b|\bmcp\b|\brag\b|multimodal|多模态|多模態|ai垂直|ai\s*垂直|#aiapps\b|ai\s*workflow|aiエージェント|agentic/i,
    copy: {
      en: {
        label: "AI Agents & Workflows",
        shortLabel: "AI Agents",
        seoTitle:
          "Vertical AI Agent Ideas, LLM Workflows & Monetizable AI Apps | AI Founder Radar",
        h1: "Vertical AI Agents & Profitable LLM Workflow Signals",
        description:
          "Beyond thin wrappers: vertical AI agents, MCP infrastructure, multimodal document tools, and monetizable automation workflows.",
      },
      zh: {
        label: "AI Agent 与垂直应用",
        shortLabel: "AI Agent",
        seoTitle:
          "AI Agent 商业化案例、垂直行业 AI 工具与独立开发变现方向 | AI Founder Radar",
        h1: "AI Agent 与垂直行业 AI 应用变现信号",
        description:
          "拒绝套壳玩具，聚焦真正跑通商业闭环的垂直行业 AI 工具、Agent 基础设施（MCP / 数据清洗）与高付费意愿自动化工作流。",
      },
      "zh-TW": {
        label: "AI Agent 與垂直應用",
        shortLabel: "AI Agent",
        seoTitle:
          "AI Agent 商業化案例、垂直產業 AI 工具與獨立開發變現方向 | AI Founder Radar",
        h1: "AI Agent 與垂直產業 AI 應用變現信號",
        description:
          "拒絕套殼玩具，聚焦真正跑通商業閉環的垂直產業 AI 工具、Agent 基礎設施（MCP / 資料清洗）與高付費意願自動化工作流。",
      },
      ja: {
        label: "AIエージェント・垂直AI",
        shortLabel: "AIエージェント",
        seoTitle:
          "AIエージェント開発アイデア・業界特化型AIツールの収益化事例 | AI Founder Radar",
        h1: "AIエージェント＆業界特化型AIプロダクト収益シグナル",
        description:
          "単なるラッパーを超え、実務ワークフローやMCP基盤で実際に課金されているAIエージェント・垂直AIアプリの最新事例。",
      },
    },
  },
  "open-source": {
    slug: "open-source",
    platforms: ["github"],
    pattern:
      /open-?source|#oss\b|mit\s*(开源|開源|license|ライセンス)|github\s*(trending|飙升|飆升|7日新锐)|开源|開源|オープンソース/i,
    copy: {
      en: {
        label: "Open Source & OSS",
        shortLabel: "Open Source",
        seoTitle:
          "Breakout Open-Source Projects, Commercial OSS & GitHub Trending Signals | AI Founder Radar",
        h1: "Commercial Open-Source & GitHub Breakout Signals",
        description:
          "Fast-rising MIT/Apache repositories, developer tools, and open-core infrastructure that indie founders can self-host or commercialize.",
      },
      zh: {
        label: "开源商业化与 GitHub 新锐",
        shortLabel: "开源商业化",
        seoTitle:
          "GitHub 飙升开源项目商业化拆解、Open-Core 变现与底层基建灵感 | AI Founder Radar",
        h1: "开源商业化（Commercial OSS）与 GitHub 飙升信号",
        description:
          "追踪 24 小时涨星最猛的 MIT 开源组件与开发者工具，拆解云托管变现模式及独立开发者二次封装商机。",
      },
      "zh-TW": {
        label: "開源商業化與 GitHub 新銳",
        shortLabel: "開源商業化",
        seoTitle:
          "GitHub 飆升開源專案商業化拆解、Open-Core 變現與底層基建靈感 | AI Founder Radar",
        h1: "開源商業化（Commercial OSS）與 GitHub 飆升信號",
        description:
          "追蹤 24 小時漲星最猛的 MIT 開源元件與開發者工具，拆解雲端託管變現模式及獨立開發者二次封裝商機。",
      },
      ja: {
        label: "OSS収益化・GitHub急上昇",
        shortLabel: "オープンソース",
        seoTitle:
          "GitHub急上昇OSSのマネタイズ事例・オープンソース活用アイデア | AI Founder Radar",
        h1: "商用OSS（Open-Core）＆GitHub急上昇リポジトリ分析",
        description:
          "急成長中のMIT/Apache系OSSプロジェクトから、クラウドホスティング課金や垂直SaaSへの転用アイデアを発掘。",
      },
    },
  },
  "ios-apps": {
    slug: "ios-apps",
    platforms: ["appstore"],
    pattern:
      /\bios\b|app\s*store|tiktok|reels|\biap\b|美区|日区|美區|日區|灵动岛|靈動島|モバイルアプリ/i,
    copy: {
      en: {
        label: "iOS Apps & TikTok Growth",
        shortLabel: "iOS & Mobile",
        seoTitle:
          "Profitable iOS App Ideas, IAP Subscriptions & Organic TikTok Growth | AI Founder Radar",
        h1: "iOS Utility Apps & Organic Mobile Subscription Signals",
        description:
          "Indie mobile apps climbing US & JP App Store grossing charts via organic TikTok/Reels content, minimalist UX, and annual IAP subscriptions.",
      },
      zh: {
        label: "iOS 出海与移动端变现",
        shortLabel: "iOS 出海",
        seoTitle:
          "iOS 独立开发 App 出海变现案例、美日畅销榜黑马与 TikTok 自然流打法 | AI Founder Radar",
        h1: "iOS 工具 App 出海与移动端内购（IAP）变现信号",
        description:
          "追踪美区与日区 App Store 效率/工具畅销榜独立开发黑马，拆解极简交互设计、年度订阅定价与 TikTok 短视频零买量冷启动。",
      },
      "zh-TW": {
        label: "iOS 出海與行動端變現",
        shortLabel: "iOS 出海",
        seoTitle:
          "iOS 獨立開發 App 出海變現案例、美日暢銷榜黑馬與 TikTok 自然流打法 | AI Founder Radar",
        h1: "iOS 工具 App 出海與行動端內購（IAP）變現信號",
        description:
          "追蹤美區與日區 App Store 效率/工具暢銷榜獨立開發黑馬，拆解極簡介面設計、年度訂閱定價與 TikTok 短影片零買量冷啟動。",
      },
      ja: {
        label: "iOSアプリ・TikTok集客",
        shortLabel: "iOSアプリ",
        seoTitle:
          "個人開発iOSアプリの収益化事例・App Store急上昇＆TikTok自然流入 | AI Founder Radar",
        h1: "iOSアプリ課金（IAP）＆オーガニック集客シグナル",
        description:
          "日米App Storeの売上ランキングで急浮上する個人開発アプリや、TikTok/Reelsの自然流入で伸びるサブスク事例を分析。",
      },
    },
  },
  "saas-alternatives": {
    slug: "saas-alternatives",
    pattern:
      /alternative|undercut|anti-subscription|lifetime\s*deal|\bltd\b|one-off|buyout|平替|买断|買斷|单次付费|單次付費|反订阅|反訂閱|買い切り|脱サブスク|代替ツール/i,
    copy: {
      en: {
        label: "SaaS Alternatives & LTD",
        shortLabel: "SaaS Alternatives",
        seoTitle:
          "Profitable SaaS Alternatives, Anti-Subscription & One-Off Pricing Ideas | AI Founder Radar",
        h1: "Unbundled SaaS Alternatives & Anti-Subscription Wedges",
        description:
          "Capitalize on SaaS pricing backlash and subscription fatigue: lightweight flat-rate alternatives, one-off passes, and lifetime deal winners.",
      },
      zh: {
        label: "大厂平替与买断制机会",
        shortLabel: "平替与买断",
        seoTitle:
          "海外昂贵 SaaS 平替机会、反订阅疲劳与一次性买断（LTD）变现案例 | AI Founder Radar",
        h1: "高价 SaaS 轻量平替与买断制/按次付费商机",
        description:
          "捕捉海外小商家对大厂按人头涨价的强烈不满，拆解『砍掉 80% 臃肿功能 + 一次性买断或低价单次通行证』的高转化抄作业切口。",
      },
      "zh-TW": {
        label: "大廠平替與買斷制機會",
        shortLabel: "平替與買斷",
        seoTitle:
          "海外昂貴 SaaS 平替機會、反訂閱疲勞與一次性買斷（LTD）變現案例 | AI Founder Radar",
        h1: "高價 SaaS 輕量平替與買斷制/按次付費商機",
        description:
          "捕捉海外小商家對大廠按席位漲價的強烈不滿，拆解『砍掉 80% 臃腫功能 + 一次性買斷或低價單次通行證』的高轉化切角。",
      },
      ja: {
        label: "SaaS代替・買い切りモデル",
        shortLabel: "代替・買い切り",
        seoTitle:
          "高額SaaSの軽量代替ツール・買い切り（LTD）・都度課金アイデア集 | AI Founder Radar",
        h1: "「脱サブスク疲れ」を狙うSaaS代替＆買い切り収益シグナル",
        description:
          "大手SaaSの値上げや席数課金への不満を突く、機能を絞った買い切り型・都度払い型の高コンバージョン事例を厳選。",
      },
    },
  },
  "seo-growth": {
    slug: "seo-growth",
    pattern:
      /\bseo\b|programmatic\s*seo|cold-?email|lead\s*alert|growth\s*hacking|build\s*in\s*public|organic\s*(traffic|store\s*search)|获客|獲客|自然流|卖铲子|賣鏟子|被动流量|被動流量|集客|グロース/i,
    copy: {
      en: {
        label: "SEO & Founder Growth",
        shortLabel: "SEO & Growth",
        seoTitle:
          "Programmatic SEO Case Studies, Lead Gen Tools & Indie Growth Playbooks | AI Founder Radar",
        h1: "Programmatic SEO, Lead Alerts & Organic Growth Signals",
        description:
          "Zero-ad-spend acquisition playbooks and 'sell shovels' marketing tools: programmatic SEO funnels, social lead monitors, and Build in Public automation.",
      },
      zh: {
        label: "SEO 增长与零成本获客",
        shortLabel: "SEO 与获客",
        seoTitle:
          "独立开发程序化 SEO 获客案例、社媒截流工具与零广告冷启动打法 | AI Founder Radar",
        h1: "程序化 SEO 获客案例与增长『卖铲子』工具库",
        description:
          "汇编零广告费跑通自然流量的实战复盘（免费工具矩阵引流、Reddit/X 实时潜客监控、冷邮件外呼与 Build in Public 传播工具）。",
      },
      "zh-TW": {
        label: "SEO 成長與零成本獲客",
        shortLabel: "SEO 與獲客",
        seoTitle:
          "獨立開發程式化 SEO 獲客案例、社群截流工具與零廣告冷啟動打法 | AI Founder Radar",
        h1: "程式化 SEO 獲客案例與成長『賣鏟子』工具庫",
        description:
          "彙編零廣告費跑通自然流量的實戰復盤（免費工具矩陣引流、Reddit/X 即時潛客監控、冷郵件開發與 Build in Public 傳播工具）。",
      },
      ja: {
        label: "SEO集客・グロース支援",
        shortLabel: "SEO・集客",
        seoTitle:
          "プログラマティックSEO成功事例＆個人開発のゼロ広告集客ツール | AI Founder Radar",
        h1: "SEO自然流入プレイブック＆顧客獲得「ツルハシ」SaaS",
        description:
          "広告費ゼロで顧客を獲得するプログラマティックSEO事例や、SNS上の見込み客を自動検知する開発者向けマーケティングツール集。",
      },
    },
  },
  "creator-tools": {
    slug: "creator-tools",
    pattern:
      /youtube|podcast|affiliate|creator|shownotes|show\s*notes|video\s*automation|launch\s*videos|播客|创作者|創作者|带货|帶貨|返佣|返傭|视频自动化|影片自動化|クリエイター|アフィリエイト|ポッドキャスト/i,
    copy: {
      en: {
        label: "Creator & Affiliate Tools",
        shortLabel: "Creator Tools",
        seoTitle:
          "Creator Economy Micro-SaaS: YouTube, Podcast & Affiliate Tool Ideas | AI Founder Radar",
        h1: "Creator Economy, Podcast & Affiliate Micro-SaaS Signals",
        description:
          "High-retention utilities for YouTubers, podcasters, and affiliate marketers that save weekly editing hours or recover lost commissions.",
      },
      zh: {
        label: "创作者与联盟营销工具",
        shortLabel: "创作者工具",
        seoTitle:
          "YouTube 博主、播客与海外联盟营销（Affiliate）周边工具变现案例 | AI Founder Radar",
        h1: "创作者经济与 Affiliate 联盟营销小工具信号",
        description:
          "围绕 YouTuber、独立播客主与带货博主的刚需痛点（死链巡检挽回返佣、音频转图文、短视频自动生成），挖掘高留存变现切口。",
      },
      "zh-TW": {
        label: "創作者與聯盟行銷工具",
        shortLabel: "創作者工具",
        seoTitle:
          "YouTube 創作者、Podcast 與海外聯盟行銷（Affiliate）周邊工具變現案例 | AI Founder Radar",
        h1: "創作者經濟與 Affiliate 聯盟行銷小工具信號",
        description:
          "圍繞 YouTuber、獨立播客主與帶貨創作者的剛需痛點（失效連結巡檢挽回返佣、音訊轉圖文、短影片自動生成），挖掘高留存變現切角。",
      },
      ja: {
        label: "クリエイター・アフィリエイト",
        shortLabel: "クリエイター",
        seoTitle:
          "YouTube・ポッドキャスト・アフィリエイト向けMicro-SaaS事例集 | AI Founder Radar",
        h1: "クリエイター支援＆アフィリエイト収益改善ツール事例",
        description:
          "YouTuberのリンク切れ収益ロス防止やポッドキャスト要約自動化など、クリエイターの週次業務を効率化するSaaSシグナル。",
      },
    },
  },
  "b2b-automation": {
    slug: "b2b-automation",
    pattern:
      /\bb2b\b|invoice|quickbooks|xero|\btax\b|tax-ready|contract|compliance|freelance|报销|報銷|税表|稅表|合同|合約|合规|合規|自由职业|自由職業|会計|税務|契約書/i,
    copy: {
      en: {
        label: "B2B, Tax & Legal Automation",
        shortLabel: "B2B & Ops",
        seoTitle:
          "B2B Workflow, Freelance Tax, Invoice & Compliance Micro-SaaS Ideas | AI Founder Radar",
        h1: "B2B Back-Office, Tax & Contract Automation Signals",
        description:
          "Boring but lucrative back-office niches: accounting bridges, receipt-to-CSV extractors, contract red-flag scanners, and vertical compliance SaaS.",
      },
      zh: {
        label: "B2B 财税合规与办公自动化",
        shortLabel: "B2B 自动化",
        seoTitle:
          "海外 B2B 财税报销、合同审查与垂直合规小工具高毛利变现案例 | AI Founder Radar",
        h1: "『枯燥但暴利』的 B2B 财税、合同与合规自动化信号",
        description:
          "深挖自由职业者与海外中小企业最愿意掏钱的后台脏活：QuickBooks 票据桥接、英文合同排雷、垂直行业合规巡检等高客单价案例。",
      },
      "zh-TW": {
        label: "B2B 財稅合規與辦公自動化",
        shortLabel: "B2B 自動化",
        seoTitle:
          "海外 B2B 財稅報銷、合約審查與垂直合規小工具高毛利變現案例 | AI Founder Radar",
        h1: "『枯燥但暴利』的 B2B 財稅、合約與合規自動化信號",
        description:
          "深挖自由工作者與海外中小企業最願意付費的後台繁瑣工作：QuickBooks 單據橋接、英文合約排雷、垂直產業合規巡檢等高客單價案例。",
      },
      ja: {
        label: "B2B業務・税務・法務自動化",
        shortLabel: "B2B自動化",
        seoTitle:
          "B2Bバックオフィス・確定申告・契約チェック系Micro-SaaS収益事例 | AI Founder Radar",
        h1: "実務直結のB2Bバックオフィス・税務・契約自動化シグナル",
        description:
          "会計ソフト連携や英文契約書リスク診断、コンプライアンス対応など、地味ながら圧倒的に課金されやすいB2Bニッチ事例。",
      },
    },
  },
  "local-ai": {
    slug: "local-ai",
    pattern:
      /webgpu|webassembly|\bwasm\b|zero-?server|local-?first|client-?side|纯浏览器|純瀏覽器|零算力成本|零伺服器|端侧|端側|サーバー代ゼロ|ブラウザ完結/i,
    copy: {
      en: {
        label: "WebGPU & Zero-Server Tools",
        shortLabel: "Local-First AI",
        seoTitle:
          "Zero-Server WebGPU & Local-First Browser Utility Ideas (100% Margin) | AI Founder Radar",
        h1: "WebGPU, Local-First & Zero-Server Utility Signals",
        description:
          "High-margin media and AI utilities running inference 100% in the user's browser via WebGPU/Wasm — eliminating cloud GPU bills.",
      },
      zh: {
        label: "WebGPU 与零算力成本工具",
        shortLabel: "零算力工具",
        seoTitle:
          "纯浏览器 WebGPU 端侧 AI 工具站案例：零服务器成本跑通近 100% 毛利 | AI Founder Radar",
        h1: "WebGPU 端侧推理与零服务器成本工具站信号",
        description:
          "解决独立开发者最怕的云端 GPU 账单难题：汇总利用 WebGPU / WebAssembly 在用户本地浏览器完成批量图片、音视频处理的近 100% 毛利工具案例。",
      },
      "zh-TW": {
        label: "WebGPU 與零算力成本工具",
        shortLabel: "零算力工具",
        seoTitle:
          "純瀏覽器 WebGPU 端側 AI 工具站案例：零伺服器成本跑通近 100% 毛利 | AI Founder Radar",
        h1: "WebGPU 端側推論與零伺服器成本工具站信號",
        description:
          "解決獨立開發者最怕的雲端 GPU 帳單難題：彙整利用 WebGPU / WebAssembly 在使用者本機瀏覽器完成批次圖片、音訊影片處理的高毛利工具案例。",
      },
      ja: {
        label: "WebGPU・サーバー代ゼロ開発",
        shortLabel: "WebGPU・ローカルAI",
        seoTitle:
          "WebGPU・ブラウザ完結型AIツール事例（サーバーコストゼロ・粗利100%） | AI Founder Radar",
        h1: "WebGPU＆ローカルファースト（サーバー代ゼロ）ツール事例",
        description:
          "推論処理をユーザー側のブラウザ（WebGPU/Wasm）で完結させ、高額なGPUクラウド破産を防ぎつつ高粗利を実現する個人開発モデル。",
      },
    },
  },
};

export const SOURCE_DEFINITIONS: Record<SourcePlatform, SourceDefinition> = {
  producthunt: {
    platform: "producthunt",
    brandName: "Product Hunt",
    copy: {
      en: {
        label: "Product Hunt Launches",
        shortLabel: "Product Hunt",
        seoTitle:
          "Product Hunt Top Micro-SaaS Launches, Pricing Models & Maker Takeaways | AI Founder Radar",
        h1: "Product Hunt Commercial Launches & Pricing Signals",
        description:
          "High-signal Product Hunt launches filtered for solo-founder viability, concrete pricing models, and replicable niche positioning.",
      },
      zh: {
        label: "Product Hunt 新品精选",
        shortLabel: "Product Hunt",
        seoTitle:
          "Product Hunt 每日高价值新品拆解：AI 工具、定价策略与抄作业灵感 | AI Founder Radar",
        h1: "Product Hunt 商业化新品与定价模式拆解",
        description:
          "剔除纯概念玩具，精选 Product Hunt 榜单上真正具备清晰付费闭环、买断/订阅双轨定价与一人公司可复制切口的新品信号。",
      },
      "zh-TW": {
        label: "Product Hunt 新品精選",
        shortLabel: "Product Hunt",
        seoTitle:
          "Product Hunt 每日高價值新品拆解：AI 工具、定價策略與實戰靈感 | AI Founder Radar",
        h1: "Product Hunt 商業化新品與定價模式拆解",
        description:
          "剔除純概念玩具，精選 Product Hunt 榜單上真正具備清晰付費閉環、買斷/訂閱雙軌定價與一人公司可複製切角的新品信號。",
      },
      ja: {
        label: "Product Hunt 注目ローンチ",
        shortLabel: "Product Hunt",
        seoTitle:
          "Product Hunt注目ローンチ分析：海外AI・SaaSの価格設計とヒット要因 | AI Founder Radar",
        h1: "Product Hunt 商業化ローンチ＆価格モデル分析",
        description:
          "Product Huntの上位プロダクトから、明確な課金導線や個人開発でも再現可能なニッチ切り口を持つ事例だけを厳選。",
      },
    },
  },
  hackernews: {
    platform: "hackernews",
    brandName: "Hacker News",
    copy: {
      en: {
        label: "Show HN Signals",
        shortLabel: "Hacker News",
        seoTitle:
          "Show HN Commercial Launches, Developer Tools & Monetizable Side Projects | AI Founder Radar",
        h1: "Hacker News (Show HN) Commercial Builder Signals",
        description:
          "Curated Show HN projects that survive developer scrutiny — highlighting technical moats, zero-server architectures, and B2B monetization.",
      },
      zh: {
        label: "Hacker News (Show HN)",
        shortLabel: "Hacker News",
        seoTitle:
          "Hacker News (Show HN) 硬核独立开发作品与商业化开发者工具精选 | AI Founder Radar",
        h1: "Hacker News (Show HN) 硬核产品与变现拆解",
        description:
          "精选经受住极客社区挑剔检验的 Show HN 高赞项目，提炼低成本技术架构、开发者工具定价及可商业化的副业灵感。",
      },
      "zh-TW": {
        label: "Hacker News (Show HN)",
        shortLabel: "Hacker News",
        seoTitle:
          "Hacker News (Show HN) 硬核獨立開發作品與商業化開發者工具精選 | AI Founder Radar",
        h1: "Hacker News (Show HN) 硬核產品與變現拆解",
        description:
          "精選經受住極客社群挑剔檢驗的 Show HN 高讚專案，提煉低成本技術架構、開發者工具定價及可商業化的副業靈感。",
      },
      ja: {
        label: "Hacker News (Show HN)",
        shortLabel: "Hacker News",
        seoTitle:
          "Hacker News (Show HN) 注目プロダクト＆収益化可能な開発者ツール厳選 | AI Founder Radar",
        h1: "Hacker News (Show HN) 技術系プロダクト＆収益化シグナル",
        description:
          "エンジニア層の厳しい目を通過したShow HNの注目作から、技術的優位性と実用的なマネタイズ設計を構造化して解説。",
      },
    },
  },
  indiehackers: {
    platform: "indiehackers",
    brandName: "Indie Hackers",
    copy: {
      en: {
        label: "Indie Hackers Stories",
        shortLabel: "Indie Hackers",
        seoTitle:
          "Indie Hackers Revenue Milestones, Bootstrapped Playbooks & Growth Stories | AI Founder Radar",
        h1: "Indie Hackers Bootstrapped MRR & Growth Playbooks",
        description:
          "First-hand founder postmortems, cold-start acquisition experiments, and verified revenue milestones from the Indie Hackers community.",
      },
      zh: {
        label: "Indie Hackers 实战复盘",
        shortLabel: "Indie Hackers",
        seoTitle:
          "Indie Hackers 独立开发者实战复盘：冷启动获客与真实 MRR 增长故事 | AI Founder Radar",
        h1: "Indie Hackers 独立开发变现里程碑与获客复盘",
        description:
          "提炼海外 Indie Hackers 社区创始人的第一手复盘帖：第一批种子客户怎么来、如何定价以及从 $0 到 $10k+ MRR 的踩坑经验。",
      },
      "zh-TW": {
        label: "Indie Hackers 實戰復盤",
        shortLabel: "Indie Hackers",
        seoTitle:
          "Indie Hackers 獨立開發者實戰復盤：冷啟動獲客與真實 MRR 成長故事 | AI Founder Radar",
        h1: "Indie Hackers 獨立開發變現里程碑與獲客復盤",
        description:
          "提煉海外 Indie Hackers 社群創辦人的第一手復盤帖：第一批種子客戶怎麼來、如何定價以及從 $0 到 $10k+ MRR 的實戰經驗。",
      },
      ja: {
        label: "Indie Hackers 実践録",
        shortLabel: "Indie Hackers",
        seoTitle:
          "Indie Hackers個人開発プレイブック：初期集客とMRR成長のリアル実録 | AI Founder Radar",
        h1: "Indie Hackers 収益マイルストーン＆初期集客レポート",
        description:
          "海外Indie Hackersコミュニティの一次情報から、最初の有料顧客獲得からMRR拡大までの具体的な戦略を要約。",
      },
    },
  },
  acquire: {
    platform: "acquire",
    brandName: "Acquire.com",
    copy: {
      en: {
        label: "Acquire.com Listings",
        shortLabel: "Acquire.com",
        seoTitle:
          "Acquire.com Profitable Micro-SaaS Listings, ARR Multiples & Exit Signals | AI Founder Radar",
        h1: "Acquire.com For-Sale SaaS Valuations & ARR Breakdowns",
        description:
          "Reverse-engineer profitable Micro-SaaS businesses listed for acquisition: TTM revenue, net profit margins, churn, and valuation multiples.",
      },
      zh: {
        label: "Acquire.com 待售 SaaS",
        shortLabel: "Acquire.com",
        seoTitle:
          "Acquire.com 待售盈利 SaaS 拆解：真实 ARR 流水、净利与估值倍数分析 | AI Founder Radar",
        h1: "Acquire.com 待售盈利 Micro-SaaS 估值与赛道拆解",
        description:
          "直接从海外 SaaS 并购交易挂牌数据中挖金矿：看清哪些细分软件拥有高净利率、高留存，以及真实买家愿意出多少倍 ARR 收购。",
      },
      "zh-TW": {
        label: "Acquire.com 待售 SaaS",
        shortLabel: "Acquire.com",
        seoTitle:
          "Acquire.com 待售獲利 SaaS 拆解：真實 ARR 流水、淨利與估值倍數分析 | AI Founder Radar",
        h1: "Acquire.com 待售獲利 Micro-SaaS 估值與賽道拆解",
        description:
          "直接從海外 SaaS 併購交易掛牌資料中挖金礦：看清哪些細分軟體擁有高淨利率、高留存，以及真實買家願意出多少倍 ARR 收購。",
      },
      ja: {
        label: "Acquire.com 売却案件分析",
        shortLabel: "Acquire.com",
        seoTitle:
          "Acquire.com売却案件に学ぶ高収益Micro-SaaSのARR・利益率・評価倍率 | AI Founder Radar",
        h1: "Acquire.com 売却公開SaaSのARR・利益率・バリュエーション分析",
        description:
          "M&Aマーケットプレイスの公開データから、実際に高倍率で取引されるニッチSaaSの年間収益（ARR）と高収益構造を解剖。",
      },
    },
  },
  reddit: {
    platform: "reddit",
    brandName: "Reddit",
    copy: {
      en: {
        label: "Reddit Pain Points & MRR",
        shortLabel: "Reddit",
        seoTitle:
          "Reddit SaaS Pain Points, r/SomebodyMakeThis Ideas & Founder MRR Stories | AI Founder Radar",
        h1: "Reddit High-Intent Pain Points & Micro-SaaS Case Studies",
        description:
          "Unfiltered buyer complaints, 'shut up and take my money' feature requests, and transparent MRR breakdowns from r/SaaS, r/microsaas & r/SomebodyMakeThis.",
      },
      zh: {
        label: "Reddit 痛点池与实战",
        shortLabel: "Reddit",
        seoTitle:
          "Reddit 独立开发痛点池与变现复盘：r/SaaS、r/SomebodyMakeThis 高赞商机 | AI Founder Radar",
        h1: "Reddit 海外真实用户痛点许愿池与 MRR 复盘",
        description:
          "实时挖掘 r/SomebodyMakeThis、r/SaaS 与 r/microsaas 高共鸣吐槽帖、竞品涨价求平替需求，以及草根开发者晒出的真实月入复盘。",
      },
      "zh-TW": {
        label: "Reddit 痛點池與實戰",
        shortLabel: "Reddit",
        seoTitle:
          "Reddit 獨立開發痛點池與變現復盤：r/SaaS、r/SomebodyMakeThis 高讚商機 | AI Founder Radar",
        h1: "Reddit 海外真實使用者痛點許願池與 MRR 復盤",
        description:
          "即時挖掘 r/SomebodyMakeThis、r/SaaS 與 r/microsaas 高共鳴吐槽帖、競品漲價求平替需求，以及獨立開發者分享的真實月收復盤。",
      },
      ja: {
        label: "Reddit 課題発掘＆収益事例",
        shortLabel: "Reddit",
        seoTitle:
          "Reddit海外SaaS課題発掘＆収益レポート（r/SaaS・r/SomebodyMakeThis厳選） | AI Founder Radar",
        h1: "Reddit ユーザーの強い不満・課題ニーズ＆MRR達成レポート",
        description:
          "r/SomebodyMakeThisやr/microsaasに投稿される「お金を払ってでも欲しいツール」の生の声と、個人開発者のリアルな収益報告を集約。",
      },
    },
  },
  github: {
    platform: "github",
    brandName: "GitHub",
    copy: {
      en: {
        label: "GitHub Trending & OSS",
        shortLabel: "GitHub",
        seoTitle:
          "GitHub Trending Commercial OSS, AI Infrastructure & 7-Day Breakout Repos | AI Founder Radar",
        h1: "GitHub Trending & 7-Day Breakout Open-Source Signals",
        description:
          "Daily multi-language GitHub Trending leaders and 7-day breakout repositories with verified star velocity and SaaS wrapper opportunities.",
      },
      zh: {
        label: "GitHub 飙升与开源新锐",
        shortLabel: "GitHub",
        seoTitle:
          "GitHub Trending 每日飙升与 7 日新锐开源项目：AI 基建与商业化机会 | AI Founder Radar",
        h1: "GitHub 每日飙升榜与 7 日新锐开源商业信号",
        description:
          "监控 TypeScript / Python / Rust / Go 多语言日榜与近 7 天新锐暴涨仓库，附带真实总星与单日涨星双指标及垂直 SaaS 封装建议。",
      },
      "zh-TW": {
        label: "GitHub 飆升與開源新銳",
        shortLabel: "GitHub",
        seoTitle:
          "GitHub Trending 每日飆升與 7 日新銳開源專案：AI 基建與商業化機會 | AI Founder Radar",
        h1: "GitHub 每日飆升榜與 7 日新銳開源商業信號",
        description:
          "監控 TypeScript / Python / Rust / Go 多語言日榜與近 7 天新銳暴漲儲存庫，附帶真實總星與單日漲星雙指標及垂直 SaaS 封裝建議。",
      },
      ja: {
        label: "GitHub 急上昇＆新鋭OSS",
        shortLabel: "GitHub",
        seoTitle:
          "GitHub Trending急上昇＆7日間ブレイクアウトOSS：AI基盤と商用化分析 | AI Founder Radar",
        h1: "GitHub Trending＆7日間急成長OSSビジネスシグナル",
        description:
          "主要言語別のGitHub日次トレンドと直近7日間の急成長リポジトリを監視し、スター増加数とSaaS化への応用アイデアを提示。",
      },
    },
  },
  trustmrr: {
    platform: "trustmrr",
    brandName: "TrustMRR",
    copy: {
      en: {
        label: "TrustMRR Verified Leaderboard",
        shortLabel: "TrustMRR",
        seoTitle:
          "TrustMRR Verified Startups, Stripe Revenue Breakdowns & Indie Niches | AI Founder Radar",
        h1: "TrustMRR Stripe-Verified Startup Revenue Signals",
        description:
          "Zero fake screenshots: indie products with cryptographic Stripe/payment verification on TrustMRR, analyzed for pricing and retention mechanics.",
      },
      zh: {
        label: "TrustMRR 实名营收榜",
        shortLabel: "TrustMRR",
        seoTitle:
          "TrustMRR 实名营收榜精选：真实 Stripe 验证 MRR 独立开发案例拆解 | AI Founder Radar",
        h1: "TrustMRR 官方验证真实流水（Verified MRR）项目拆解",
        description:
          "拒绝晒假图割韭菜！精选接入 Stripe 实名流水验证的 TrustMRR 飙升项目，拆解真金白银跑通的订阅单价、环比增速与高留存切口。",
      },
      "zh-TW": {
        label: "TrustMRR 實名營收榜",
        shortLabel: "TrustMRR",
        seoTitle:
          "TrustMRR 實名營收榜精選：真實 Stripe 驗證 MRR 獨立開發案例拆解 | AI Founder Radar",
        h1: "TrustMRR 官方驗證真實流水（Verified MRR）專案拆解",
        description:
          "拒絕假圖誇大！精選串接 Stripe 實名流水驗證的 TrustMRR 飆升專案，拆解真金白銀跑通的訂閱單價、月增率與高留存切角。",
      },
      ja: {
        label: "TrustMRR 認証済み収益榜",
        shortLabel: "TrustMRR",
        seoTitle:
          "TrustMRR認証スタートアップ分析：Stripe検証済みリアルMRR収益事例 | AI Founder Radar",
        h1: "TrustMRR Stripe決済認証済みスタートアップ収益分析",
        description:
          "自己申告ではなくStripe連携で実売上が証明されたTrustMRR掲載プロダクトから、手堅く稼ぐニッチSaaSの収益構造を解明。",
      },
    },
  },
  appstore: {
    platform: "appstore",
    brandName: "App Store",
    copy: {
      en: {
        label: "App Store Indie Movers",
        shortLabel: "App Store",
        seoTitle:
          "App Store Indie Utility Movers: US & Japan Top-Grossing App Breakdowns | AI Founder Radar",
        h1: "App Store (US & JP) Indie Top-Grossing Utility Signals",
        description:
          "Filtered out Big Tech giants to spotlight solo & small-studio utility apps climbing US and Japan App Store top-grossing rankings.",
      },
      zh: {
        label: "App Store 畅销黑马榜",
        shortLabel: "App Store",
        seoTitle:
          "App Store 美区/日区畅销榜独立开发黑马拆解：工具 App 订阅内购实战 | AI Founder Radar",
        h1: "App Store 美区与日区独立开发畅销黑马信号",
        description:
          "自动剔除大厂巨无霸与硬件配套应用，精准锁定美日工具/效率畅销榜里闷声发财的独立开发小团队 App 及其内购（IAP）变现套路。",
      },
      "zh-TW": {
        label: "App Store 暢銷黑馬榜",
        shortLabel: "App Store",
        seoTitle:
          "App Store 美區/日區暢銷榜獨立開發黑馬拆解：工具 App 訂閱內購實戰 | AI Founder Radar",
        h1: "App Store 美區與日區獨立開發暢銷黑馬信號",
        description:
          "自動剔除大廠巨頭與硬體配套應用，精準鎖定美日工具/效率暢銷榜裡低調獲利的獨立開發小團隊 App 及其內購（IAP）變現策略。",
      },
      ja: {
        label: "App Store 売上急上昇アプリ",
        shortLabel: "App Store",
        seoTitle:
          "App Store（米国・日本）売上上位の個人開発ツールアプリ＆サブスク分析 | AI Founder Radar",
        h1: "App Store（日米）個人開発・少人数チームの売上上位アプリ分析",
        description:
          "大手企業のアプリを除外し、米国・日本の仕事効率化／ユーティリティ売上ランキングで躍進するインディーアプリの課金設計を追跡。",
      },
    },
  },
};

export function isValidTopicSlug(
  value: string | undefined | null
): value is TopicSlug {
  if (!value) return false;
  return (TOPIC_SLUGS as readonly string[]).includes(value);
}

export function isValidSourcePlatform(
  value: string | undefined | null
): value is SourcePlatform {
  if (!value) return false;
  return (SOURCE_PLATFORMS as readonly string[]).includes(value);
}

export interface TopicMatchCandidate {
  titleZh: string;
  titleOrig: string;
  whatItIs: string;
  businessSignal: string;
  indieTakeaway: string;
  tags: string[];
  sourcePlatform: SourcePlatform;
  sourceSublabel: string;
  translations?: SignalTranslations | null;
}

/**
 * Deterministic, locale-invariant topic classifier:
 * Evaluates canonical English/Chinese/Japanese fields so `/en/topic/X`,
 * `/zh/topic/X`, `/zh-TW/topic/X`, and `/ja/topic/X` ALWAYS contain the exact
 * same symmetric set of signal items (100% hreflang parity).
 */
export function matchCanonicalTopics(
  candidate: TopicMatchCandidate
): TopicSlug[] {
  const enBlock = candidate.translations?.en;
  const jaBlock = candidate.translations?.ja;

  const corpus = [
    candidate.titleOrig,
    candidate.titleZh,
    candidate.whatItIs,
    candidate.businessSignal,
    candidate.indieTakeaway,
    candidate.sourceSublabel,
    ...(candidate.tags ?? []),
    enBlock?.title ?? "",
    enBlock?.whatItIs ?? "",
    enBlock?.businessSignal ?? "",
    enBlock?.indieTakeaway ?? "",
    ...(enBlock?.tags ?? []),
    jaBlock?.title ?? "",
    ...(jaBlock?.tags ?? []),
  ].join(" ");

  const matched: TopicSlug[] = [];

  for (const slug of TOPIC_SLUGS) {
    const def = TOPIC_DEFINITIONS[slug];
    const byPlatform =
      def.platforms?.includes(candidate.sourcePlatform) ?? false;
    if (byPlatform || def.pattern.test(corpus)) {
      matched.push(slug);
    }
  }

  return matched;
}

/**
 * Resolves a single display hashtag (e.g. `#Chrome插件`, `#Shopify`, `#OpenSource`)
 * to a canonical TopicSlug if it directly corresponds to an evergreen topic hub.
 */
export function resolveTopicSlugFromTag(tag: string): TopicSlug | null {
  const cleaned = tag.trim();
  if (!cleaned) return null;

  for (const slug of TOPIC_SLUGS) {
    if (TOPIC_DEFINITIONS[slug].pattern.test(cleaned)) {
      return slug;
    }
  }
  return null;
}

export function getTopicCopy(
  slug: TopicSlug,
  locale: Locale
): LocalizedHubCopy {
  return TOPIC_DEFINITIONS[slug].copy[locale] ?? TOPIC_DEFINITIONS[slug].copy.en;
}

export function getSourceCopy(
  platform: SourcePlatform,
  locale: Locale
): LocalizedHubCopy {
  return (
    SOURCE_DEFINITIONS[platform].copy[locale] ??
    SOURCE_DEFINITIONS[platform].copy.en
  );
}

export function filterItemsByTopic(
  items: SignalItem[],
  slug: TopicSlug
): SignalItem[] {
  return items.filter((item) => matchCanonicalTopics(item).includes(slug));
}
