import { NextResponse } from "next/server";
import { markDonationPaid } from "@/lib/donations";
import {
  extractPaidOrder,
  verifyOnePaymentWebhook,
} from "@/lib/onepayment";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`webhook:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-onepay-signature") ||
    request.headers.get("signature") ||
    request.headers.get("x-signature");

  if (!verifyOnePaymentWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const extracted = extractPaidOrder(payload);
  if (!extracted.paid || !extracted.orderId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await markDonationPaid(
    extracted.orderId,
    extracted.providerPaymentId,
  );

  return NextResponse.json(result);
}
