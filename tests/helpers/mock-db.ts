import { Column, is, Param, SQL } from "drizzle-orm";
import type { newsletterSubscribers } from "../../src/db/schema";

export type SubscriberRow = typeof newsletterSubscribers.$inferSelect;
export type NewSubscriberRow = typeof newsletterSubscribers.$inferInsert;

const DB_COLUMN_TO_PROP: Record<string, keyof SubscriberRow> = {
  id: "id",
  email: "email",
  locale: "locale",
  status: "status",
  unsubscribe_token: "unsubscribeToken",
  last_sent_date: "lastSentDate",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

function extractEqPredicate(
  condition: unknown
): { prop: keyof SubscriberRow; value: unknown } | null {
  if (!is(condition, SQL)) return null;

  let colName: string | undefined;
  let paramVal: unknown;
  let hasParam = false;

  const visit = (chunks: readonly unknown[]) => {
    for (const chunk of chunks) {
      if (is(chunk, SQL)) {
        visit(chunk.queryChunks);
      } else if (is(chunk, Column)) {
        colName = chunk.name;
      } else if (is(chunk, Param)) {
        paramVal = chunk.value;
        hasParam = true;
      } else if (
        typeof chunk === "string" ||
        typeof chunk === "number" ||
        typeof chunk === "boolean"
      ) {
        paramVal = chunk;
        hasParam = true;
      }
    }
  };

  visit(condition.queryChunks);

  if (!colName || !hasParam) return null;
  const prop = DB_COLUMN_TO_PROP[colName];
  if (!prop) return null;
  return { prop, value: paramVal };
}

function matchesCondition(row: SubscriberRow, condition: unknown): boolean {
  if (!condition) return true;
  const pred = extractEqPredicate(condition);
  if (!pred) return true;
  return row[pred.prop] === pred.value;
}

export function createMockNewsletterDb(
  initialRows: SubscriberRow[] = [],
  options: { throwOnQuery?: boolean } = {}
) {
  const rows: SubscriberRow[] = initialRows.map((r) => ({ ...r }));

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
              throw new Error("duplicate key value violates unique constraint newsletter_subscribers_email_idx");
            }
            const now = new Date();
            rows.push({
              id: item.id,
              email: item.email,
              locale: item.locale ?? "en",
              status: item.status ?? "active",
              unsubscribeToken: item.unsubscribeToken,
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
