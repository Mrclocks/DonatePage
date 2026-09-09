import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, nowIso } from "@/lib/db";
import { adminLogs, donations, targets } from "@/lib/schema";
import { donationTelegramText, sendTelegramMessage } from "@/lib/telegram";

export type TargetKind = "general" | "campaign";

export function getGeneralTarget() {
  const db = getDb();
  return db
    .select()
    .from(targets)
    .where(eq(targets.kind, "general"))
    .get();
}

export function getActiveCampaigns() {
  const db = getDb();
  return db
    .select()
    .from(targets)
    .where(and(eq(targets.status, "active"), eq(targets.kind, "campaign")))
    .orderBy(desc(targets.id))
    .all();
}

/** @deprecated prefer getActiveCampaigns / getDonateTarget */
export function getActiveTarget() {
  const campaigns = getActiveCampaigns();
  if (campaigns[0]) return campaigns[0];
  return getGeneralTarget();
}

export function getDonateTarget(targetId?: number | null) {
  const db = getDb();
  if (targetId != null) {
    const row = db.select().from(targets).where(eq(targets.id, targetId)).get();
    if (!row) return null;
    if (row.kind === "general") return row;
    if (row.status === "active") return row;
    return null;
  }
  return getGeneralTarget() || getActiveCampaigns()[0] || null;
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
    .where(and(eq(targets.status, "completed"), ne(targets.kind, "general")))
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
  currency?: "USDT";
  activate?: boolean;
}) {
  const db = getDb();
  const createdAt = nowIso();

  // Multiple campaigns can stay active at once. General is never created here.
  const result = db
    .insert(targets)
    .values({
      title: input.title,
      goalAmount: input.goalAmount,
      raisedAmount: 0,
      currency: input.currency || "USDT",
      status: input.activate === false ? "completed" : "active",
      kind: "campaign",
      createdAt,
      completedAt: input.activate === false ? createdAt : null,
    })
    .run();

  logAdmin("create_target", `${input.title} / ${input.goalAmount}`);
  return Number(result.lastInsertRowid);
}

export function updateTarget(
  id: number,
  input: {
    title?: string;
    goalAmount?: number;
    activate?: boolean;
  },
) {
  const db = getDb();
  const existing = db.select().from(targets).where(eq(targets.id, id)).get();
  if (!existing) return false;

  if (existing.kind === "general") {
    // General stays open; only title/raised stay editable lightly
    db.update(targets)
      .set({
        title: input.title ?? existing.title,
        status: "active",
        completedAt: null,
      })
      .where(eq(targets.id, id))
      .run();
    logAdmin("update_general_target", String(id));
    return true;
  }

  const now = nowIso();
  db.update(targets)
    .set({
      title: input.title ?? existing.title,
      goalAmount: input.goalAmount ?? existing.goalAmount,
      status:
        input.activate === undefined
          ? existing.status
          : input.activate
            ? "active"
            : "completed",
      completedAt:
        input.activate === false
          ? now
          : input.activate === true
            ? null
            : existing.completedAt,
    })
    .where(eq(targets.id, id))
    .run();

  logAdmin("update_target", String(id));
  return true;
}

export function deleteTarget(id: number) {
  const db = getDb();
  const existing = db.select().from(targets).where(eq(targets.id, id)).get();
  if (!existing) return false;
  if (existing.kind === "general") {
    throw new Error("هدف عمومی قابل حذف نیست");
  }

  db.delete(donations).where(eq(donations.targetId, id)).run();
  db.delete(targets).where(eq(targets.id, id)).run();
  logAdmin("delete_target", String(id));
  return true;
}

export function createPendingDonation(input: {
  targetId: number;
  amount: number;
  currency?: "USDT";
  donorName?: string | null;
  orderId: string;
  providerPaymentId?: string | null;
}) {
  const db = getDb();
  db.insert(donations)
    .values({
      targetId: input.targetId,
      amount: input.amount,
      currency: input.currency || "USDT",
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
    const isGeneral = target.kind === "general" || Number(target.goalAmount) <= 0;
    const shouldComplete =
      !isGeneral && raised >= Number(target.goalAmount);
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
  getDb(); // ensures general target exists
  const general = getGeneralTarget();
  const campaigns = getActiveCampaigns();
  const destinations = [
    ...(general ? [general] : []),
    ...campaigns,
  ];
  const topDonors = getTopDonors(10);
  const history = listCompletedTargets().slice(0, 12);
  return { general, campaigns, destinations, topDonors, history };
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
