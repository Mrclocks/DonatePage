import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const targets = sqliteTable("targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  goalAmount: real("goal_amount").notNull(),
  raisedAmount: real("raised_amount").notNull().default(0),
  currency: text("currency").notNull().default("USDT"),
  status: text("status").notNull().default("active"), // active | completed
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const donations = sqliteTable(
  "donations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetId: integer("target_id")
      .notNull()
      .references(() => targets.id),
    donorName: text("donor_name"),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("USDT"),
    status: text("status").notNull().default("pending"), // pending | paid | failed
    orderId: text("order_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    createdAt: text("created_at").notNull(),
    paidAt: text("paid_at"),
  },
  (table) => [uniqueIndex("donations_order_id_idx").on(table.orderId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const adminLogs = sqliteTable("admin_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
});
