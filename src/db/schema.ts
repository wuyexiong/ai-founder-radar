import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { SignalTranslations, SummaryTranslations } from "@/types/signal";

export const signalItems = pgTable(
  "signal_items",
  {
    id: text("id").primaryKey(),
    dateKey: text("date_key").notNull(),
    titleZh: text("title_zh").notNull(),
    titleOrig: text("title_orig").notNull(),
    category: text("category").notNull(), // launch | revenue | pain_point | ai_trend
    whatItIs: text("what_it_is").notNull(),
    businessSignal: text("business_signal").notNull(),
    indieTakeaway: text("indie_takeaway").notNull(),
    metricsBadge: text("metrics_badge").notNull(),
    metricType: text("metric_type").notNull(), // revenue | heat | pain
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    translations: jsonb("translations")
      .$type<SignalTranslations>()
      .notNull()
      .default({}),
    score: doublePrecision("score").notNull().default(7.5),
    isTopPick: boolean("is_top_pick").notNull().default(false),
    sourcePlatform: text("source_platform").notNull(),
    sourceSublabel: text("source_sublabel").notNull().default(""),
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("signal_items_source_url_idx").on(table.sourceUrl),
    index("signal_items_date_key_idx").on(table.dateKey),
    index("signal_items_category_idx").on(table.category),
    index("signal_items_source_platform_idx").on(table.sourcePlatform),
  ]
).enableRLS();

export const dailyStats = pgTable("daily_stats", {
  dateKey: text("date_key").primaryKey(),
  scannedCount: integer("scanned_count").notNull().default(0),
  selectedCount: integer("selected_count").notNull().default(0),
  estimatedReadMinutes: integer("estimated_read_minutes").notNull().default(5),
  summaryNote: text("summary_note").notNull().default(""),
  summaryTranslations: jsonb("summary_translations")
    .$type<SummaryTranslations>()
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    locale: text("locale").notNull().default("en"), // en | zh | zh-TW | ja
    status: text("status").notNull().default("pending"), // pending | active | unsubscribed
    unsubscribeToken: text("unsubscribe_token").notNull(),
    confirmToken: text("confirm_token"),
    confirmSentAt: timestamp("confirm_sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    signupIpHash: text("signup_ip_hash"),
    lastSentDate: text("last_sent_date"), // YYYY-MM-DD 幂等防重发标记
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("newsletter_subscribers_email_idx").on(table.email),
    uniqueIndex("newsletter_subscribers_token_idx").on(table.unsubscribeToken),
    index("newsletter_subscribers_confirm_token_idx").on(table.confirmToken),
    index("newsletter_subscribers_ip_updated_idx").on(
      table.signupIpHash,
      table.updatedAt
    ),
    index("newsletter_subscribers_status_idx").on(table.status),
  ]
).enableRLS();

export const userFeedback = pgTable(
  "user_feedback",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull().default("suggestion"), // suggestion | bug | source | other
    message: text("message").notNull(),
    contact: text("contact"),
    pagePath: text("page_path").notNull().default("/"),
    locale: text("locale").notNull().default("en"), // en | zh | zh-TW | ja
    status: text("status").notNull().default("open"), // open | reviewed | resolved | archived
    submitterIpHash: text("submitter_ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_feedback_status_created_idx").on(table.status, table.createdAt),
    index("user_feedback_type_idx").on(table.type),
    index("user_feedback_ip_created_idx").on(
      table.submitterIpHash,
      table.createdAt
    ),
  ]
).enableRLS();
