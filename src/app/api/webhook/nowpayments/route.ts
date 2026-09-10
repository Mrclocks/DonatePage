import { NextResponse } from "next/server";
import {
  getDonationByOrderId,
  markDonationFailed,
  markDonationPaid,
} from "@/lib/donations";
import {
  amountsMatch,
  extractIpnPayment,
  priceCurrencyIsUsdt,
  providerPaymentMatches,
  resolveProviderPaymentId,
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
    return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  }

  // If we already bound this order to an invoice/payment, IPN must match it.
  if (!providerPaymentMatches(donation.providerPaymentId, extracted)) {
    console.error("ipn_provider_conflict", {
      orderId: extracted.orderId,
      stored: donation.providerPaymentId,
      paymentId: extracted.paymentId,
      invoiceId: extracted.invoiceId,
    });
    return NextResponse.json(
      { error: "Provider payment mismatch" },
      { status: 409 },
    );
  }

  const providerPaymentId = resolveProviderPaymentId(
    donation.providerPaymentId,
    extracted,
  );

  if (extracted.failed) {
    // Only fail a pending order; never touch raisedAmount.
    if (donation.status !== "pending") {
      return NextResponse.json({
        ok: true,
        ignored: true,
        status: donation.status,
      });
    }
    const result = markDonationFailed(extracted.orderId, providerPaymentId);
    return NextResponse.json({ failed: true, ...result });
  }

  if (!extracted.paid) {
    // waiting / confirming / partially_paid / etc. — acknowledge, do not mark paid
    return NextResponse.json({
      ok: true,
      ignored: true,
      status: extracted.paymentStatus,
    });
  }

  // Paid path: must still be pending (or already paid → idempotent below).
  if (donation.status === "paid") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (donation.status !== "pending") {
    return NextResponse.json(
      { error: "Order not pending" },
      { status: 409 },
    );
  }

  if (!priceCurrencyIsUsdt(extracted.priceCurrency)) {
    console.error("ipn_currency_mismatch", {
      orderId: extracted.orderId,
      received: extracted.priceCurrency,
    });
    return NextResponse.json({ error: "Currency mismatch" }, { status: 400 });
  }

  if (!amountsMatch(Number(donation.amount), extracted.priceAmount)) {
    console.error("ipn_amount_mismatch", {
      orderId: extracted.orderId,
      expected: donation.amount,
      received: extracted.priceAmount,
    });
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  const result = await markDonationPaid(extracted.orderId, providerPaymentId);
  return NextResponse.json(result);
}
