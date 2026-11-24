import { Column, is, Param, SQL } from "drizzle-orm";
import type {
  newsletterSubscribers,
  userFeedback,
} from "../../src/db/schema";

export type SubscriberRow = typeof newsletterSubscribers.$inferSelect;
export type NewSubscriberRow = typeof newsletterSubscribers.$inferInsert;
export type FeedbackRow = typeof userFeedback.$inferSelect;
export type NewFeedbackRow = typeof userFeedback.$inferInsert;

export type SeedSubscriberInput = Omit<
  SubscriberRow,
  "confirmToken" | "confirmSentAt" | "confirmedAt" | "signupIpHash"
> &
  Partial<
    Pick<
      SubscriberRow,
      "confirmToken" | "confirmSentAt" | "confirmedAt" | "signupIpHash"
    >
  >;

const DB_COLUMN_TO_PROP: Record<string, keyof SubscriberRow> = {
  id: "id",
  email: "email",
  locale: "locale",
  status: "status",
  unsubscribe_token: "unsubscribeToken",
  confirm_token: "confirmToken",
  confirm_sent_at: "confirmSentAt",
  confirmed_at: "confirmedAt",
  signup_ip_hash: "signupIpHash",
  last_sent_date: "lastSentDate",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

function isStringChunk(chunk: unknown): chunk is { value: string[] } {
  return (
    typeof chunk === "object" &&
    chunk !== null &&
    "value" in chunk &&
    Array.isArray((chunk as { value: unknown }).value)
  );
}

function toComparableMillis(val: unknown): number {
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") return val;
  if (typeof val === "string") return new Date(val).getTime();
  return Number.NaN;
}

function evaluateLeafSql(row: SubscriberRow, sqlNode: SQL): boolean {
  let colName: string | undefined;
  const opParts: string[] = [];
  const params: unknown[] = [];

  const visit = (chunks: readonly unknown[]) => {
    for (const chunk of chunks) {
      if (is(chunk, SQL)) {
        visit(chunk.queryChunks);
      } else if (is(chunk, Column)) {
        colName = chunk.name;
      } else if (is(chunk, Param)) {
        if (Array.isArray(chunk.value)) {
          params.push(...chunk.value);
        } else {
          params.push(chunk.value);
        }
      } else if (isStringChunk(chunk)) {
        opParts.push(chunk.value.join(""));
      } else if (Array.isArray(chunk)) {
        visit(chunk);
      } else if (
        typeof chunk === "string" ||
        typeof chunk === "number" ||
        typeof chunk === "boolean" ||
        chunk instanceof Date
      ) {
        params.push(chunk);
      }
    }
  };

  visit(sqlNode.queryChunks);

  if (!colName) return true;
  const prop = DB_COLUMN_TO_PROP[colName];
  if (!prop) return true;

  const rowVal = row[prop];
  const opText = opParts.join("").toLowerCase();

  if (opText.includes(">=")) {
    const lhs = toComparableMillis(rowVal);
    const rhs = toComparableMillis(params[0]);
    if (Number.isNaN(lhs) || Number.isNaN(rhs)) return false;
    return lhs >= rhs;
  }

  if (/\bin\s*\(/.test(opText) || opText.includes(" in ")) {
    return params.includes(rowVal);
  }

  if (params.length === 0) return false;
  return rowVal === params[0];
}

function sqlContainsColumn(sqlNode: SQL): boolean {
  for (const chunk of sqlNode.queryChunks) {
    if (is(chunk, Column)) return true;
    if (is(chunk, SQL) && sqlContainsColumn(chunk)) return true;
  }
  return false;
}

function matchesCondition(row: SubscriberRow, condition: unknown): boolean {
  if (!condition) return true;
  if (!is(condition, SQL)) return true;

  const hasDirectColumn = condition.queryChunks.some((c) => is(c, Column));
  if (!hasDirectColumn) {
    const childConditions = condition.queryChunks.filter(
      (c): c is SQL => is(c, SQL) && sqlContainsColumn(c)
    );
    if (childConditions.length > 0) {
      return childConditions.every((sub) => matchesCondition(row, sub));
    }
  }

  return evaluateLeafSql(row, condition);
}

function normalizeSeedRow(input: SeedSubscriberInput): SubscriberRow {
  return {
    ...input,
    confirmToken: input.confirmToken ?? null,
    confirmSentAt: input.confirmSentAt ?? null,
    confirmedAt: input.confirmedAt ?? null,
    signupIpHash: input.signupIpHash ?? null,
  };
}

export function createMockNewsletterDb(
  initialRows: SeedSubscriberInput[] = [],
  options: { throwOnQuery?: boolean } = {}
) {
  const rows: SubscriberRow[] = initialRows.map(normalizeSeedRow);

  const guardThrow = () => {
    if (options.throwOnQuery) {
      throw new Error(
        "postgresql://postgres:secret_pass@db.supabase.co:5432/postgres connection refused"
      );
    }
  };

  const makeSelectResult = (filtered: SubscriberRow[]) => {
    const cloned = () => filtered.map((r) => ({ ...r }));
    return {
      limit: async (n: number) => {
        guardThrow();
        return cloned().slice(0, n);
      },
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builder is PromiseLike
      then<TResult1 = SubscriberRow[], TResult2 = never>(
        onfulfilled?:
          | ((value: SubscriberRow[]) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> {
        return Promise.resolve()
          .then(() => {
            guardThrow();
            return cloned();
          })
          .then(onfulfilled, onrejected);
      },
    };
  };

  const mockDb = {
    rows,
    select() {
      return {
        from(_table: unknown) {
          return {
            where(condition: unknown) {
              const matched = rows.filter((r) => matchesCondition(r, condition));
              return makeSelectResult(matched);
            },
            limit: async (n: number) => {
              guardThrow();
              return rows.slice(0, n).map((r) => ({ ...r }));
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        async values(input: NewSubscriberRow | NewSubscriberRow[]) {
          guardThrow();
          const list = Array.isArray(input) ? input : [input];
          for (const item of list) {
            if (rows.some((r) => r.email === item.email)) {
              throw new Error(
                "duplicate key value violates unique constraint newsletter_subscribers_email_idx"
              );
            }
            const now = new Date();
            rows.push({
              id: item.id,
              email: item.email,
              locale: item.locale ?? "en",
              status: item.status ?? "pending",
              unsubscribeToken: item.unsubscribeToken,
              confirmToken: item.confirmToken ?? null,
              confirmSentAt: item.confirmSentAt ?? null,
              confirmedAt: item.confirmedAt ?? null,
              signupIpHash: item.signupIpHash ?? null,
              lastSentDate: item.lastSentDate ?? null,
              createdAt: item.createdAt ?? now,
              updatedAt: item.updatedAt ?? now,
            });
          }
        },
      };
    },
    update(_table: unknown) {
      return {
        set(patch: Partial<SubscriberRow>) {
          return {
            async where(condition: unknown) {
              guardThrow();
              for (const row of rows) {
                if (matchesCondition(row, condition)) {
                  Object.assign(row, patch);
                }
              }
            },
          };
        },
      };
    },
  };

  return mockDb;
}

const FEEDBACK_COLUMN_TO_PROP: Record<string, keyof FeedbackRow> = {
  id: "id",
  type: "type",
  message: "message",
  contact: "contact",
  page_path: "pagePath",
  locale: "locale",
  status: "status",
  submitter_ip_hash: "submitterIpHash",
  created_at: "createdAt",
};

function matchesFeedbackCondition(
  row: FeedbackRow,
  condition: unknown
): boolean {
  if (!condition) return true;
  if (!is(condition, SQL)) return true;

  const hasDirectColumn = condition.queryChunks.some((c) => is(c, Column));
  if (!hasDirectColumn) {
    const childConditions = condition.queryChunks.filter(
      (c): c is SQL => is(c, SQL) && sqlContainsColumn(c)
    );
    if (childConditions.length > 0) {
      return childConditions.every((sub) =>
        matchesFeedbackCondition(row, sub)
      );
    }
  }

  let colName: string | undefined;
  const opParts: string[] = [];
  const params: unknown[] = [];

  const visit = (chunks: readonly unknown[]) => {
    for (const chunk of chunks) {
      if (is(chunk, SQL)) {
        visit(chunk.queryChunks);
      } else if (is(chunk, Column)) {
        colName = chunk.name;
      } else if (is(chunk, Param)) {
        if (Array.isArray(chunk.value)) {
          params.push(...chunk.value);
        } else {
          params.push(chunk.value);
        }
      } else if (isStringChunk(chunk)) {
        opParts.push(chunk.value.join(""));
      } else if (Array.isArray(chunk)) {
        visit(chunk);
      } else if (
        typeof chunk === "string" ||
        typeof chunk === "number" ||
        typeof chunk === "boolean" ||
        chunk instanceof Date
      ) {
        params.push(chunk);
      }
    }
  };

  visit(condition.queryChunks);
  if (!colName) return true;
  const prop = FEEDBACK_COLUMN_TO_PROP[colName];
  if (!prop) return true;

  const rowVal = row[prop];
  const opText = opParts.join("").toLowerCase();

  if (opText.includes(">=")) {
    const lhs = toComparableMillis(rowVal);
    const rhs = toComparableMillis(params[0]);
    if (Number.isNaN(lhs) || Number.isNaN(rhs)) return false;
    return lhs >= rhs;
  }

  if (params.length === 0) return false;
  return rowVal === params[0];
}

export function createMockFeedbackDb(
  initialRows: FeedbackRow[] = [],
  options: { throwOnQuery?: boolean } = {}
) {
  const rows: FeedbackRow[] = initialRows.map((r) => ({ ...r }));

  const guardThrow = () => {
    if (options.throwOnQuery) {
      throw new Error(
        "postgresql://postgres:secret_pass@db.supabase.co:5432/postgres connection refused"
      );
    }
  };

  return {
    rows,
    select() {
      return {
        from(_table: unknown) {
          return {
            where(condition: unknown) {
              const matched = rows.filter((r) =>
                matchesFeedbackCondition(r, condition)
              );
              return {
                limit: async (n: number) => {
                  guardThrow();
                  return matched.slice(0, n).map((r) => ({ ...r }));
                },
              };
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        async values(input: NewFeedbackRow | NewFeedbackRow[]) {
          guardThrow();
          const list = Array.isArray(input) ? input : [input];
          const now = new Date();
          for (const item of list) {
            rows.push({
              id: item.id,
              type: item.type ?? "suggestion",
              message: item.message,
              contact: item.contact ?? null,
              pagePath: item.pagePath ?? "/",
              locale: item.locale ?? "en",
              status: item.status ?? "open",
              submitterIpHash: item.submitterIpHash ?? null,
              createdAt: item.createdAt ?? now,
            });
          }
        },
      };
    },
  };
}
