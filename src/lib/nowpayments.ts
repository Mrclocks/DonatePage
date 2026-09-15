import { createHmac, timingSafeEqual } from "node:crypto";

/** NOWPayments invoice price denomination for this app (USDT, not fiat USD). */
export const PRICE_CURRENCY = "usdt" as const;

/** Default network for paying the USDT invoice (BEP20 / BSC). */
export const DEFAULT_PAY_CURRENCY = "usdtbsc" as const;

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
  payAddress?: string;
  payAmount?: number;
  payCurrency?: string;
  raw?: unknown;
};

export type IpnExtract = {
  paid: boolean;
  failed: boolean;
  orderId: string;
  /** payment_id from IPN (created when customer pays an invoice). */
  paymentId: string;
  /** invoice_id from IPN (matches Hosted Invoice create response id). */
  invoiceId: string;
  priceAmount: number;
  priceCurrency: string;
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
  // Callbacks/IPN must never be derived from client-controlled Origin/Host.
  if (!process.env.APP_URL?.trim()) {
    throw new Error("APP_URL is required in production");
  }
  if (process.env.NOWPAYMENTS_ALLOW_DEMO === "true") return;
  if (!process.env.NOWPAYMENTS_API_KEY) {
    throw new Error("NOWPAYMENTS_API_KEY is required in production");
  }
  if (!process.env.NOWPAYMENTS_IPN_SECRET) {
    throw new Error("NOWPAYMENTS_IPN_SECRET is required in production");
  }
}

function configuredPayCurrency() {
  const raw = process.env.NOWPAYMENTS_PAY_CURRENCY?.trim().toLowerCase();
  if (!raw) return "";
  // Common alias users type for Binance Smart Chain USDT.
  if (raw === "usdtbep20" || raw === "bep20" || raw === "usdt-bep20") {
    return "usdtbsc";
  }
  return raw;
}

/**
 * Locked pay coin for this donation app. Default USDT BEP20 (usdtbsc).
 * Env override supported; aliases like usdtbep20 map to usdtbsc.
 */
export function resolvePayCurrency(): string {
  return configuredPayCurrency() || DEFAULT_PAY_CURRENCY;
}

function extractNowPaymentsError(raw: unknown, status: number) {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const message = String(obj.message || obj.error || "").trim();
    if (message) return `NOWPayments (${status}): ${message}`;
  }
  return `NOWPayments error (${status})`;
}

async function postNowPayments(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const raw = await response.json().catch(() => ({}));
  return { response, raw };
}

function paymentFromResponse(
  raw: unknown,
  orderId: string,
  fallbackAmount: number,
  fallbackPayCurrency: string,
): CreateInvoiceResult {
  const data = (raw || {}) as Record<string, unknown>;
  const paymentId =
    data.payment_id != null && String(data.payment_id) !== ""
      ? String(data.payment_id)
      : "";
  const payAddress = String(data.pay_address || "").trim();
  const payAmount = Number(data.pay_amount ?? fallbackAmount);
  const returnedPayCurrency = String(data.pay_currency || fallbackPayCurrency)
    .trim()
    .toLowerCase();

  if (!paymentId || !payAddress) {
    throw new Error("NOWPayments response missing payment address");
  }

  return {
    checkoutUrl: `/pay?order=${encodeURIComponent(orderId)}`,
    providerPaymentId: paymentId,
    payAddress,
    payAmount: Number.isFinite(payAmount) ? payAmount : fallbackAmount,
    payCurrency: returnedPayCurrency || fallbackPayCurrency,
    raw,
  };
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
      payAddress: "demo-address",
      payAmount: input.amount,
      payCurrency: DEFAULT_PAY_CURRENCY,
    };
  }

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY is missing");
  }

  const description = input.donorName
    ? `Donation from ${input.donorName}`
    : `Donation ${input.orderId}`;
  const payCurrency = resolvePayCurrency();
  const amount = Number(input.amount.toFixed(8));

  // Direct payment — do not send invoice-only fields (success_url/cancel_url).
  const paymentAttempts: Array<Record<string, unknown>> = [
    {
      price_amount: amount,
      price_currency: PRICE_CURRENCY,
      pay_currency: payCurrency,
      order_id: input.orderId,
      order_description: description,
      ipn_callback_url: input.ipnCallbackUrl,
    },
    // Some merchant accounts only accept fiat price_currency on /v1/payment.
    {
      price_amount: amount,
      price_currency: "usd",
      pay_currency: payCurrency,
      order_id: input.orderId,
      order_description: description,
      ipn_callback_url: input.ipnCallbackUrl,
    },
  ];

  const errors: string[] = [];

  for (const payload of paymentAttempts) {
    const { response, raw } = await postNowPayments(apiKey, "/v1/payment", payload);
    if (response.ok) {
      return paymentFromResponse(raw, input.orderId, amount, payCurrency);
    }
    errors.push(extractNowPaymentsError(raw, response.status));
  }

  // Fallback: invoice + invoice-payment (locks pay_currency, returns address).
  const invoicePayload = {
    price_amount: amount,
    price_currency: PRICE_CURRENCY,
    pay_currency: payCurrency,
    order_id: input.orderId,
    order_description: description,
    ipn_callback_url: input.ipnCallbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
  const invoiceRes = await postNowPayments(apiKey, "/v1/invoice", invoicePayload);
  if (!invoiceRes.response.ok) {
    errors.push(extractNowPaymentsError(invoiceRes.raw, invoiceRes.response.status));
    throw new Error(errors.filter(Boolean).join(" | ") || "NOWPayments payment failed");
  }

  const invoiceData = invoiceRes.raw as Record<string, unknown>;
  const invoiceId =
    invoiceData.id != null && String(invoiceData.id) !== ""
      ? String(invoiceData.id)
      : "";
  if (!invoiceId) {
    throw new Error("NOWPayments invoice missing id");
  }

  const lockRes = await postNowPayments(apiKey, "/v1/invoice-payment", {
    iid: Number(invoiceId) || invoiceId,
    pay_currency: payCurrency,
    order_description: description,
  });
  if (!lockRes.response.ok) {
    errors.push(extractNowPaymentsError(lockRes.raw, lockRes.response.status));
    throw new Error(
      errors.filter(Boolean).join(" | ") ||
        "NOWPayments could not lock USDTBSC. Enable USDTBSC + payout wallet in your NOWPayments dashboard.",
    );
  }

  return paymentFromResponse(lockRes.raw, input.orderId, amount, payCurrency);
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

// Credit on blockchain confirmation. `finished` means funds reached payout wallet.
const PAID_STATUSES = new Set(["confirmed", "finished"]);
const FAILED_STATUSES = new Set(["failed", "expired", "refunded"]);

export function extractIpnPayment(payload: Record<string, unknown>): IpnExtract {
  const paymentStatus = String(
    payload.payment_status || payload.status || "",
  ).toLowerCase();

  const orderId = String(payload.order_id || payload.orderId || "");
  const paymentId =
    payload.payment_id != null && String(payload.payment_id) !== ""
      ? String(payload.payment_id)
      : "";
  const invoiceId =
    payload.invoice_id != null && String(payload.invoice_id) !== ""
      ? String(payload.invoice_id)
      : payload.iid != null && String(payload.iid) !== ""
        ? String(payload.iid)
        : "";

  const priceAmount = Number(payload.price_amount ?? 0);
  const priceCurrency = String(payload.price_currency || "")
    .trim()
    .toLowerCase();

  return {
    paid: PAID_STATUSES.has(paymentStatus),
    failed: FAILED_STATUSES.has(paymentStatus),
    orderId,
    paymentId,
    invoiceId,
    priceAmount: Number.isFinite(priceAmount) ? priceAmount : 0,
    priceCurrency,
    paymentStatus,
  };
}

/**
 * If we already stored a provider id (invoice id), the IPN must reference it
 * via invoice_id or payment_id. Never accept a conflicting provider payment.
 */
export function providerPaymentMatches(
  storedProviderPaymentId: string | null | undefined,
  ipn: Pick<IpnExtract, "paymentId" | "invoiceId">,
): boolean {
  const stored = storedProviderPaymentId?.trim();
  if (!stored) return true;

  const candidates = [ipn.invoiceId, ipn.paymentId]
    .map((v) => v.trim())
    .filter(Boolean);

  if (candidates.length === 0) return false;
  return candidates.some((id) => id === stored);
}

/** Preferred id to persist from IPN (keep invoice id if that is what we stored). */
export function resolveProviderPaymentId(
  storedProviderPaymentId: string | null | undefined,
  ipn: Pick<IpnExtract, "paymentId" | "invoiceId">,
): string | undefined {
  const stored = storedProviderPaymentId?.trim();
  if (stored) return stored;
  return ipn.invoiceId || ipn.paymentId || undefined;
}

/** Accept IPN price_amount when it covers the original USDT donation amount. */
export function amountsMatch(expected: number, received: number) {
  if (!Number.isFinite(expected) || !Number.isFinite(received)) return false;
  if (expected <= 0 || received <= 0) return false;
  // Allow tiny float noise; reject underpayment.
  const tolerance = Math.max(0.01, expected * 0.001);
  return received + tolerance >= expected;
}

export function priceCurrencyIsUsdt(currency: string) {
  const c = currency.trim().toLowerCase();
  return c === PRICE_CURRENCY || c.startsWith("usdt");
}
