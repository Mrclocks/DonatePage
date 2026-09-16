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
  MAX_DONATION_USDT,
  MIN_DONATION_USDT,
} from "@/lib/donation-limits";
import {
  assertLiveConfigured,
  createNowPaymentsInvoice,
} from "@/lib/nowpayments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  amount: z
    .number()
    .min(MIN_DONATION_USDT)
    .max(MAX_DONATION_USDT),
  donorName: z.string().trim().max(80).optional().nullable(),
  targetId: z.number().int().positive().optional().nullable(),
});

function appUrl(request: Request) {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;

  // Never trust Origin/Host in production — attackers can point IPN/success URLs elsewhere.
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is required in production");
  }

  return (
    request.headers.get("origin") ||
    `http://${request.headers.get("host") || "localhost:3000"}`
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
    const amountIssue = parsed.error.issues.find((i) => i.path[0] === "amount");
    if (amountIssue) {
      const tooLow = amountIssue.code === "too_small";
      return NextResponse.json(
        {
          error: tooLow
            ? `مبلغ کمتر از ${MIN_DONATION_USDT} USDT مجاز نیست`
            : "مبلغ نامعتبر است",
        },
        { status: 400 },
      );
    }
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
      updateDonationProvider(orderId, payment.providerPaymentId, {
        payAddress: payment.payAddress,
        payAmount: payment.payAmount,
        payCurrency: payment.payCurrency,
      });
    }

    return NextResponse.json({
      checkoutUrl: payment.checkoutUrl,
      orderId,
      targetId: target.id,
      targetTitle: target.title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("donate_create_failed", { orderId, message });
    markDonationFailed(orderId);

    const lower = message.toLowerCase();
    let userError = "ساخت پرداخت ناموفق بود";
    if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("(401)")) {
      userError = "API Key مربوط به NOWPayments نامعتبر است";
    } else if (lower.includes("ipn") || lower.includes("secret")) {
      userError = "تنظیمات IPN / کلیدها ناقص است";
    } else if (message.includes("NOWPayments")) {
      userError = `ساخت پرداخت ناموفق بود — ${message.slice(0, 180)}`;
    }

    return NextResponse.json({ error: userError }, { status: 502 });
  }
}
