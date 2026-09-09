import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrderId } from "@/lib/auth";
import {
  createPendingDonation,
  getActiveTarget,
} from "@/lib/donations";
import { assertLiveWebhookConfigured, createOnePayment } from "@/lib/onepayment";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: z.enum(["USD", "USDT"]).default("USDT"),
  donorName: z.string().trim().max(80).optional().nullable(),
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
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const target = getActiveTarget();
  if (!target) {
    return NextResponse.json(
      { error: "No active donation target" },
      { status: 400 },
    );
  }

  const orderId = createOrderId();
  const base = appUrl(request);

  try {
    assertLiveWebhookConfigured();
    const payment = await createOnePayment({
      orderId,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      donorName: parsed.data.donorName,
      successUrl: `${base}/success?order=${orderId}`,
      cancelUrl: `${base}/?canceled=1`,
      callbackUrl: `${base}/api/webhook/onepayment`,
    });

    createPendingDonation({
      targetId: target.id,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      donorName: parsed.data.donorName,
      orderId,
      providerPaymentId: payment.providerPaymentId,
    });

    return NextResponse.json({
      checkoutUrl: payment.checkoutUrl,
      orderId,
    });
  } catch (error) {
    console.error("donate_create_failed");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Payment create failed",
      },
      { status: 502 },
    );
  }
}
