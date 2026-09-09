import { createHmac, timingSafeEqual } from "node:crypto";

export type CreatePaymentInput = {
  orderId: string;
  amount: number;
  currency: "USDT";
  chain: "BEP20";
  donorName?: string | null;
  successUrl: string;
  cancelUrl: string;
  callbackUrl: string;
};

export type CreatePaymentResult = {
  checkoutUrl: string;
  providerPaymentId?: string;
  raw?: unknown;
};

function mode() {
  return (process.env.ONEPAYMENT_MODE || "demo").toLowerCase();
}

function apiBase() {
  return (
    process.env.ONEPAYMENT_API_BASE || "https://api.onepayment.pro"
  ).replace(/\/$/, "");
}

function createPath() {
  return process.env.ONEPAYMENT_CREATE_PATH || "/v1/payments";
}

export function getWebhookSecret() {
  return process.env.ONEPAYMENT_WEBHOOK_SECRET || "";
}

export function isDemoMode() {
  // Never allow demo payment completion on a public production deploy
  // unless explicitly forced with ONEPAYMENT_ALLOW_DEMO=true.
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.ONEPAYMENT_ALLOW_DEMO === "true" &&
      (mode() === "demo" || !process.env.ONEPAYMENT_API_KEY)
    );
  }
  return mode() === "demo" || !process.env.ONEPAYMENT_API_KEY;
}

export function assertLiveWebhookConfigured() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ONEPAYMENT_ALLOW_DEMO === "true") return;
  if (!process.env.ONEPAYMENT_API_KEY) {
    throw new Error("ONEPAYMENT_API_KEY is required in production");
  }
  if (!process.env.ONEPAYMENT_WEBHOOK_SECRET) {
    throw new Error("ONEPAYMENT_WEBHOOK_SECRET is required in production");
  }
}

export async function createOnePayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  if (isDemoMode()) {
    const token = Buffer.from(
      JSON.stringify({
        orderId: input.orderId,
        amount: input.amount,
        currency: "USDT",
        chain: "BEP20",
      }),
    ).toString("base64url");
    return {
      checkoutUrl: `/demo-pay?token=${token}`,
      providerPaymentId: `demo_${input.orderId}`,
    };
  }

  // live path continues below — currency/chain locked to USDT BEP20

  const apiKey = process.env.ONEPAYMENT_API_KEY;
  if (!apiKey) {
    throw new Error("ONEPAYMENT_API_KEY is missing");
  }

  const payload = {
    merchant_id: process.env.ONEPAYMENT_MERCHANT_ID || undefined,
    amount: Number(input.amount.toFixed(2)),
    currency: "USDT",
    chain: "BEP20",
    network: "BEP20",
    token: "USDT",
    order_id: input.orderId,
    customer_name: input.donorName || undefined,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    callback_url: input.callbackUrl,
    redirect_url: input.successUrl,
    notify_url: input.callbackUrl,
  };

  const response = await fetch(`${apiBase()}${createPath()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `OnePayment error (${response.status}): ${JSON.stringify(raw)}`,
    );
  }

  const data = (raw?.data || raw) as Record<string, unknown>;
  const checkoutUrl =
    (data.checkout_url as string) ||
    (data.payment_url as string) ||
    (data.url as string) ||
    (data.link as string);

  if (!checkoutUrl) {
    throw new Error("OnePayment response missing checkout URL");
  }

  return {
    checkoutUrl,
    providerPaymentId: String(
      data.id || data.payment_id || data.transaction_id || "",
    ),
    raw,
  };
}

export function verifyOnePaymentWebhook(
  rawBody: string,
  signatureHeader: string | null,
) {
  const secret = getWebhookSecret();
  if (!secret) {
    // Only allow unsigned webhooks in local/dev demo — never in production.
    return process.env.NODE_ENV !== "production" && isDemoMode();
  }
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function extractPaidOrder(payload: Record<string, unknown>) {
  const nested =
    (payload.payment as Record<string, unknown> | undefined) ||
    (payload.data as Record<string, unknown> | undefined) ||
    payload;

  const status = String(
    nested.status || payload.status || payload.event || "",
  ).toLowerCase();

  const eventType = String(
    (payload.event as { type?: string } | undefined)?.type ||
      payload.type ||
      "",
  ).toLowerCase();

  const paid =
    ["paid", "success", "approved", "completed", "1"].includes(status) ||
    ["payment.approved", "payment.paid", "order.paid"].includes(eventType);

  const orderId = String(
    nested.order_id ||
      nested.orderId ||
      nested.merchant_order_id ||
      payload.order_id ||
      "",
  );

  const providerPaymentId = String(
    nested.id || nested.payment_id || nested.transaction_id || "",
  );

  const amount = Number(nested.amount || payload.amount || 0);

  return { paid, orderId, providerPaymentId, amount };
}
