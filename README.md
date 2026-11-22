# IndieRadar — 出海搞钱与产品灵感雷达

每天 5 分钟，一站式获取全球出海、AI、Micro-SaaS 与独立 App 的新品趋势、真实营收案例（MRR）与海外用户痛点许愿池。

## 技术栈

- **全栈框架**: Next.js 15 (App Router) + TypeScript
- **UI 体系**: Tailwind CSS v4 + Lucide Icons（支持 Light / Dark 双主题与等宽商业数字排版）
- **数据库 & ORM**: Supabase PostgreSQL + Drizzle ORM（未配置 `DATABASE_URL` 时自动优雅降级至 `src/data/local-signals.json`）
- **自动采集与 AI 提炼**: GitHub Actions 定时任务 + Gemini Flash / DeepSeek / SiliconFlow 通用兼容接口
- **统计预留**: 原生内置 PostHog、Google Analytics 4、Microsoft Clarity 环境变量一键开启

## 快速开始

```bash
# 1. 启动本地开发预览（阶段 1 无需任何密钥即可直接查看完整看板）
npm run dev

# 2. 阶段 2：在 .env.local 填入 DATABASE_URL 与 GEMINI_API_KEY（或 LLM_API_KEY）后：
npm run db:push      # 自动在 Supabase 中创建数据表
npm run radar:sync   # 拉取 Product Hunt / Show HN / Reddit 实时信号并用 AI 提炼入库
```
