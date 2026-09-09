import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, nowIso } from "@/lib/db";
import { adminLogs, donations, targets } from "@/lib/schema";
import { donationTelegramText, sendTelegramMessage } from "@/lib/telegram";

export function getActiveTarget() {
  const db = getDb();
  return db
    .select()
    .from(targets)
    .where(eq(targets.status, "active"))
    .orderBy(desc(targets.id))
    .get();
}

export function listTargets() {
  const db = getDb();
  return db.select().from(targets).orderBy(desc(targets.id)).all();
}

export function listCompletedTargets() {
  const db = getDb();
  return db
    .select()
    .from(targets)
    .where(eq(targets.status, "completed"))
    .orderBy(desc(targets.completedAt), desc(targets.id))
    .all();
}

export function getTopDonors(limit = 10) {
  const db = getDb();
  return db
    .select({
      donorName: donations.donorName,
      total: sql<number>`sum(${donations.amount})`.mapWith(Number),
    })
    .from(donations)
    .where(eq(donations.status, "paid"))
    .groupBy(donations.donorName)
    .orderBy(desc(sql`sum(${donations.amount})`))
    .limit(limit)
    .all()
    .map((row) => ({
      donorName: row.donorName || "ناشناس",
      total: row.total || 0,
    }));
}

export function createTarget(input: {
  title: string;
  goalAmount: number;
  currency: "USD" | "USDT";
  activate?: boolean;
}) {
  const db = getDb();
  const createdAt = nowIso();

  if (input.activate !== false) {
    const active = getActiveTarget();
    if (active) {
      db.update(targets)
        .set({
          status: "completed",
          completedAt: createdAt,
        })
        .where(eq(targets.id, active.id))
        .run();
    }
  }

  const result = db
    .insert(targets)
    .values({
      title: input.title,
      goalAmount: input.goalAmount,
      raisedAmount: 0,
      currency: input.currency,
      status: input.activate === false ? "completed" : "active",
      createdAt,
      completedAt: input.activate === false ? createdAt : null,
    })
    .run();

  logAdmin("create_target", `${input.title} / ${input.goalAmount}`);
  return Number(result.lastInsertRowid);
}

export function createPendingDonation(input: {
  targetId: number;
  amount: number;
  currency: "USD" | "USDT";
  donorName?: string | null;
  orderId: string;
  providerPaymentId?: string | null;
}) {
  const db = getDb();
  db.insert(donations)
    .values({
      targetId: input.targetId,
      amount: input.amount,
      currency: input.currency,
      donorName: input.donorName || null,
      orderId: input.orderId,
      providerPaymentId: input.providerPaymentId || null,
      status: "pending",
      createdAt: nowIso(),
    })
    .run();
}

export async function markDonationPaid(orderId: string, providerPaymentId?: string) {
  const db = getDb();
  const donation = db
    .select()
    .from(donations)
    .where(eq(donations.orderId, orderId))
    .get();

  if (!donation) return { ok: false as const, reason: "not_found" };
  if (donation.status === "paid") return { ok: true as const, already: true };

  const paidAt = nowIso();
  db.update(donations)
    .set({
      status: "paid",
      paidAt,
      providerPaymentId: providerPaymentId || donation.providerPaymentId,
    })
    .where(and(eq(donations.id, donation.id), eq(donations.status, "pending")))
    .run();

  const target = db
    .select()
    .from(targets)
    .where(eq(targets.id, donation.targetId))
    .get();

  if (target) {
    const raised = Number(target.raisedAmount || 0) + Number(donation.amount);
    const shouldComplete = raised >= Number(target.goalAmount);
    db.update(targets)
      .set({
        raisedAmount: raised,
        status: shouldComplete ? "completed" : target.status,
        completedAt: shouldComplete ? paidAt : target.completedAt,
      })
      .where(eq(targets.id, target.id))
      .run();

    await sendTelegramMessage(
      donationTelegramText({
        donorName: donation.donorName,
        amount: donation.amount,
        currency: donation.currency,
        targetTitle: target.title,
      }),
    );
  }

  return { ok: true as const, already: false };
}

export function getPublicPageData() {
  const activeTarget = getActiveTarget();
  const topDonors = getTopDonors(10);
  const history = listCompletedTargets().slice(0, 12);
  return { activeTarget, topDonors, history };
}

export function logAdmin(action: string, detail?: string) {
  const db = getDb();
  db.insert(adminLogs)
    .values({
      action,
      detail: detail || null,
      createdAt: nowIso(),
    })
    .run();
}
