# IndieRadar — Global Micro-SaaS, AI & Indie Hacker Signal Radar

Daily 5-minute intelligence on Micro-SaaS launches, verified MRR case studies, and high-intent user pain points — distilled into structured Founder Playbooks in **English (`en`)**, **Simplified Chinese (`zh`)**, **Traditional Chinese (`zh-TW`)**, and **Japanese (`ja`)**.

每天 5 分钟，一站式获取全球出海、AI、Micro-SaaS 与独立 App 的新品趋势、真实营收案例（MRR）与海外用户痛点许愿池（内置英 / 简 / 繁 / 日四语种与独立归档 SEO）。

## Tech Stack / 技术栈

- **Framework**: Next.js 15 (App Router, Static ISR) + React 19 + TypeScript
- **UI & Typography**: Tailwind CSS v4 + Lucide Icons (Light / Dark themes, tabular commercial numbers, localized CJK typography)
- **Database & ORM**: Supabase PostgreSQL + Drizzle ORM (graceful fallback to `src/data/local-signals.json` when `DATABASE_URL` is empty)
- **i18n & SEO**: `/en`, `/zh`, `/zh-TW`, `/ja` + `/[locale]/daily/[date]` static archives, `hreflang` matrix, dynamic `sitemap.xml`, `robots.txt`, OpenGraph image & Schema.org `ItemList` JSON-LD
- **Collection & AI Distillation**: GitHub Actions Cron + Local Rapid-MLX / Ollama / Gemini Flash-Lite / OpenAI-compatible API + `opencc-js` (`cn -> twp`)
- **Analytics**: Built-in env switches for PostHog, Google Analytics 4, and Microsoft Clarity

## Quick Start / 快速开始

```bash
# 1. Start local preview (works out of the box with zero API keys)
npm run dev

# 2. Configure DATABASE_URL & GEMINI_API_KEY (or LLM_API_KEY / local MLX) in .env.local:
npm run db:push         # Push Drizzle schema to Supabase PostgreSQL
npm run radar:sync      # Fetch PH / Show HN / IH / Acquire / Reddit & distill in 4 languages
npm run radar:backfill  # Backfill en / zh-TW / ja translations for existing DB records
```
