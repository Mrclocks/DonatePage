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

  // Direct payment (not hosted invoice choose-asset). Locks USDT BEP20 address.
  const description = input.donorName
    ? `Donation from ${input.donorName}`
    : `Donation ${input.orderId}`;
  const payCurrency = resolvePayCurrency();

  const payload = {
    price_amount: Number(input.amount.toFixed(8)),
    price_currency: PRICE_CURRENCY,
    pay_currency: payCurrency,
    order_id: input.orderId,
    order_description: description,
    ipn_callback_url: input.ipnCallbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    is_fixed_rate: true,
  };

  const response = await fetch(`${apiBase()}/v1/payment`, {
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
    const message =
      raw && typeof raw === "object" && "message" in raw
        ? String((raw as { message?: unknown }).message || "")
        : "";
    throw new Error(
      `NOWPayments error (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  const data = raw as Record<string, unknown>;
  const paymentId =
    data.payment_id != null && String(data.payment_id) !== ""
      ? String(data.payment_id)
      : "";
  const payAddress = String(data.pay_address || "").trim();
  const payAmount = Number(data.pay_amount ?? input.amount);
  const returnedPayCurrency = String(data.pay_currency || payCurrency)
    .trim()
    .toLowerCase();

  if (!paymentId || !payAddress) {
    throw new Error("NOWPayments response missing payment address");
  }

  // Our own pay page — avoids hosted "choose asset" BTC screen.
  return {
    checkoutUrl: `/pay?order=${encodeURIComponent(input.orderId)}`,
    providerPaymentId: paymentId,
    payAddress,
    payAmount: Number.isFinite(payAmount) ? payAmount : input.amount,
    payCurrency: returnedPayCurrency || payCurrency,
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
