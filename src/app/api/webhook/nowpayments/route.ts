import { NextResponse } from "next/server";
import {
  getDonationByOrderId,
  markDonationFailed,
  markDonationPaid,
} from "@/lib/donations";
import {
  amountsMatch,
  extractIpnPayment,
  verifyNowPaymentsIpn,
} from "@/lib/nowpayments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`webhook:nowpayments:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-nowpayments-sig");

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!verifyNowPaymentsIpn(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const extracted = extractIpnPayment(payload);
  if (!extracted.orderId) {
    return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
  }

  const donation = getDonationByOrderId(extracted.orderId);
  if (!donation) {
    // Do not reveal whether order exists beyond not_found — reject unknown orders.
    return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  }

  if (extracted.failed) {
    const result = markDonationFailed(
      extracted.orderId,
      extracted.providerPaymentId || undefined,
    );
    return NextResponse.json({ ok: true, failed: true, ...result });
  }

  if (!extracted.paid) {
    // waiting / confirming / partially_paid / etc. — acknowledge, do not mark paid
    return NextResponse.json({
      ok: true,
      ignored: true,
      status: extracted.paymentStatus,
    });
  }

  if (!amountsMatch(Number(donation.amount), extracted.priceAmount)) {
    console.error("ipn_amount_mismatch", {
      orderId: extracted.orderId,
      expected: donation.amount,
      received: extracted.priceAmount,
    });
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  const result = await markDonationPaid(
    extracted.orderId,
    extracted.providerPaymentId || undefined,
  );

  return NextResponse.json(result);
}
