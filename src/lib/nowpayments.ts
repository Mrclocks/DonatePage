import { createHmac, timingSafeEqual } from "node:crypto";

export type CreateInvoiceInput = {
  orderId: string;
  amount: number;
  currency: "USDT";
  donorName?: string | null;
  successUrl: string;
  cancelUrl: string;
  ipnCallbackUrl: string;
};

export type CreateInvoiceResult = {
  checkoutUrl: string;
  providerPaymentId?: string;
  raw?: unknown;
};

export type IpnExtract = {
  paid: boolean;
  failed: boolean;
  orderId: string;
  providerPaymentId: string;
  priceAmount: number;
  paymentStatus: string;
};

function mode() {
  return (process.env.NOWPAYMENTS_MODE || "live").toLowerCase();
}

function apiBase() {
  return (
    process.env.NOWPAYMENTS_API_BASE || "https://api.nowpayments.io"
  ).replace(/\/$/, "");
}

export function getIpnSecret() {
  return process.env.NOWPAYMENTS_IPN_SECRET || "";
}

/**
 * Demo checkout is only for local/dev unless explicitly forced.
 * Production requires NOWPAYMENTS_ALLOW_DEMO=true — never enable by accident.
 */
export function isDemoMode() {
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.NOWPAYMENTS_ALLOW_DEMO === "true" &&
      (mode() === "demo" || !process.env.NOWPAYMENTS_API_KEY)
    );
  }
  return mode() === "demo" || !process.env.NOWPAYMENTS_API_KEY;
}

export function assertLiveConfigured() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NOWPAYMENTS_ALLOW_DEMO === "true") return;
  if (!process.env.NOWPAYMENTS_API_KEY) {
    throw new Error("NOWPAYMENTS_API_KEY is required in production");
  }
  if (!process.env.NOWPAYMENTS_IPN_SECRET) {
    throw new Error("NOWPAYMENTS_IPN_SECRET is required in production");
  }
}

export async function createNowPaymentsInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  if (isDemoMode()) {
    const token = Buffer.from(
      JSON.stringify({
        orderId: input.orderId,
        amount: input.amount,
        currency: "USDT",
      }),
    ).toString("base64url");
    return {
      checkoutUrl: `/demo-pay?token=${token}`,
      providerPaymentId: `demo_${input.orderId}`,
    };
  }

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY is missing");
  }

  // Amounts/goals are USDT-denominated; NOWPayments invoice price uses USD at 1:1.
  const description = input.donorName
    ? `Donation from ${input.donorName}`
    : `Donation ${input.orderId}`;

  const payload = {
    price_amount: Number(input.amount.toFixed(8)),
    price_currency: "usd",
    order_id: input.orderId,
    order_description: description,
    ipn_callback_url: input.ipnCallbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };

  const response = await fetch(`${apiBase()}/v1/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`NOWPayments error (${response.status})`);
  }

  const data = raw as Record<string, unknown>;
  const checkoutUrl = String(data.invoice_url || "");
  if (!checkoutUrl) {
    throw new Error("NOWPayments response missing invoice_url");
  }

  return {
    checkoutUrl,
    providerPaymentId: String(data.id || data.payment_id || ""),
    raw,
  };
}

/** Recursively sort object keys (NOWPayments IPN requirement). */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Verify NOWPayments IPN HMAC-SHA512 signature.
 * Docs: sort body keys, JSON.stringify, HMAC-SHA512 with IPN secret,
 * compare to x-nowpayments-sig header.
 */
export function verifyNowPaymentsIpn(
  payload: Record<string, unknown>,
  signatureHeader: string | null,
) {
  const secret = getIpnSecret();
  if (!secret) {
    // Never accept unsigned IPNs in production.
    return false;
  }
  if (!signatureHeader) return false;

  const sorted = sortKeysDeep(payload);
  const expected = createHmac("sha512", secret)
    .update(JSON.stringify(sorted))
    .digest("hex");
  const provided = signatureHeader.trim();

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const PAID_STATUSES = new Set(["finished"]);
const FAILED_STATUSES = new Set(["failed", "expired", "refunded"]);

export function extractIpnPayment(payload: Record<string, unknown>): IpnExtract {
  const paymentStatus = String(
    payload.payment_status || payload.status || "",
  ).toLowerCase();

  const orderId = String(payload.order_id || payload.orderId || "");
  const providerPaymentId = String(
    payload.payment_id || payload.invoice_id || payload.id || "",
  );

  const priceAmount = Number(
    payload.price_amount ?? payload.actually_paid_at_fiat ?? 0,
  );

  return {
    paid: PAID_STATUSES.has(paymentStatus),
    failed: FAILED_STATUSES.has(paymentStatus),
    orderId,
    providerPaymentId,
    priceAmount: Number.isFinite(priceAmount) ? priceAmount : 0,
    paymentStatus,
  };
}

/** Accept IPN price when it covers the original donation (USDT ≈ USD 1:1). */
export function amountsMatch(expected: number, received: number) {
  if (!Number.isFinite(expected) || !Number.isFinite(received)) return false;
  if (expected <= 0 || received <= 0) return false;
  // Allow tiny float noise; reject underpayment.
  const tolerance = Math.max(0.01, expected * 0.001);
  return received + tolerance >= expected;
}
