import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrderId } from "@/lib/auth";
import {
  createPendingDonation,
  getDonateTarget,
  markDonationFailed,
  updateDonationProvider,
} from "@/lib/donations";
import {
  assertLiveConfigured,
  createNowPaymentsInvoice,
} from "@/lib/nowpayments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.number().positive().max(1_000_000),
  donorName: z.string().trim().max(80).optional().nullable(),
  targetId: z.number().int().positive().optional().nullable(),
});

function appUrl(request: Request) {
  return (
    process.env.APP_URL ||
    request.headers.get("origin") ||
    `https://${request.headers.get("host")}`
  ).replace(/\/$/, "");
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`donate:${ip}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "اطلاعات نامعتبر است" }, { status: 400 });
  }

  const target = getDonateTarget(parsed.data.targetId);
  if (!target) {
    return NextResponse.json(
      { error: "مقصد حمایت معتبر نیست یا فعال نیست" },
      { status: 400 },
    );
  }

  const orderId = createOrderId();
  const base = appUrl(request);

  // Create pending internal order first — never mark paid from client.
  createPendingDonation({
    targetId: target.id,
    amount: parsed.data.amount,
    currency: "USDT",
    donorName: parsed.data.donorName,
    orderId,
  });

  try {
    assertLiveConfigured();
    const payment = await createNowPaymentsInvoice({
      orderId,
      amount: parsed.data.amount,
      currency: "USDT",
      donorName: parsed.data.donorName,
      successUrl: `${base}/success?order=${orderId}`,
      cancelUrl: `${base}/?canceled=1`,
      ipnCallbackUrl: `${base}/api/webhook/nowpayments`,
    });

    if (payment.providerPaymentId) {
      updateDonationProvider(orderId, payment.providerPaymentId);
    }

    return NextResponse.json({
      checkoutUrl: payment.checkoutUrl,
      orderId,
      targetId: target.id,
      targetTitle: target.title,
    });
  } catch (error) {
    console.error("donate_create_failed", {
      orderId,
      message: error instanceof Error ? error.message : String(error),
    });
    markDonationFailed(orderId);
    return NextResponse.json(
      { error: "ساخت پرداخت ناموفق بود" },
      { status: 502 },
    );
  }
}
