import { createHmac, timingSafeEqual } from "node:crypto";

/** Invoice price denomination — fiat usd (merchant often rejects usdt as price). */
export const PRICE_CURRENCY = "usd" as const;

/** Soft-preferred pay coin on hosted checkout (BEP20 / BSC). */
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

async function nowPaymentsGet(
  apiKey: string,
  pathWithQuery: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${apiBase()}${pathWithQuery}`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const raw = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * True only when estimated crypto for this USD amount is safely above the
 * live network minimum. If estimate/min cannot be loaded, return false so we
 * do NOT force pay_currency (that is what breaks $1–$5 on USDT BSC while
 * other donate pages still work — they leave coin unlocked).
 */
async function canSoftPreferPayCurrency(
  apiKey: string,
  amountUsd: number,
  payCurrency: string,
): Promise<boolean> {
  const estimate = await nowPaymentsGet(
    apiKey,
    `/v1/estimate?amount=${encodeURIComponent(String(amountUsd))}&currency_from=${encodeURIComponent(
      PRICE_CURRENCY,
    )}&currency_to=${encodeURIComponent(payCurrency)}`,
  );
  const estimatedCrypto = Number(estimate?.estimated_amount);
  if (!Number.isFinite(estimatedCrypto) || estimatedCrypto <= 0) return false;

  // Mono-currency min in the pay coin (same units as estimated_amount).
  const minSame = await nowPaymentsGet(
    apiKey,
    `/v1/min-amount?currency_from=${encodeURIComponent(
      payCurrency,
    )}&currency_to=${encodeURIComponent(payCurrency)}&fiat_equivalent=usd`,
  );
  const minCrypto = Number(minSame?.min_amount);
  if (Number.isFinite(minCrypto) && minCrypto > 0) {
    // Buffer: hosted Confirm can quote slightly under the UI amount (fees).
    return estimatedCrypto >= minCrypto * 1.05;
  }

  // Fallback: USD-denominated min for usd → pay coin.
  const minFiat = await nowPaymentsGet(
    apiKey,
    `/v1/min-amount?currency_from=${encodeURIComponent(
      PRICE_CURRENCY,
    )}&currency_to=${encodeURIComponent(payCurrency)}&fiat_equivalent=usd`,
  );
  const minUsd = Number(minFiat?.fiat_equivalent ?? minFiat?.min_amount);
  if (Number.isFinite(minUsd) && minUsd > 0) {
    return amountUsd >= minUsd * 1.05;
  }

  return false;
}

/**
 * Soft-prefer pay coin only when we know the amount clears that coin's live
 * minimum. If unsure, omit pay_currency — other donate pages work at $1
 * because they do not lock the payer onto USDT BSC under-min.
 */
export async function resolvePreferredPayCurrencyForAmount(
  apiKey: string,
  amount: number,
): Promise<string | undefined> {
  const preferred = resolvePayCurrency();
  if (!preferred) return undefined;

  const payTicker =
    preferred === "usdtbep20" || preferred === "bep20" ? "usdtbsc" : preferred;

  const ok = await canSoftPreferPayCurrency(apiKey, amount, payTicker);
  return ok ? preferred : undefined;
}

/**
 * Hosted NOWPayments checkout (like PasarGuard donate):
 * create invoice priced in USD and redirect to invoice_url.
 * Soft-prefer pay_currency when amount clears that network's minimum.
 */
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
      payAmount: input.amount,
      payCurrency: DEFAULT_PAY_CURRENCY,
    };
  }

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY is missing");
  }

  // Always send a non-empty description — name is optional for donors.
  const trimmedName = input.donorName?.trim();
  const description = trimmedName
    ? `Donation from ${trimmedName}`
    : `Anonymous donation ${input.orderId}`;
  const amount = Number(input.amount.toFixed(8));
  const preferredPay = await resolvePreferredPayCurrencyForAmount(
    apiKey,
    amount,
  );

  const baseInvoice = {
    price_amount: amount,
    // Do NOT use price_currency=usdt — invoice create may succeed, but hosted
    // /invoice-payment Confirm fails with "Price currency USDT is not allowed".
    price_currency: PRICE_CURRENCY,
    order_id: input.orderId,
    order_description: description,
    ipn_callback_url: input.ipnCallbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };

  const attempts: Array<Record<string, unknown>> = preferredPay
    ? [
        { ...baseInvoice, pay_currency: preferredPay },
        // Fallback: open gateway without preferred coin if usdtbsc is disabled.
        { ...baseInvoice },
      ]
    : [{ ...baseInvoice }];

  const errors: string[] = [];
  for (const payload of attempts) {
    const { response, raw } = await postNowPayments(apiKey, "/v1/invoice", payload);
    if (!response.ok) {
      errors.push(extractNowPaymentsError(raw, response.status));
      continue;
    }

    const data = raw as Record<string, unknown>;
    const invoiceId =
      data.id != null && String(data.id) !== "" ? String(data.id) : "";
    const invoiceUrl = String(data.invoice_url || "").trim();
    if (!invoiceId || !invoiceUrl) {
      throw new Error("NOWPayments response missing invoice_url");
    }

    return {
      checkoutUrl: invoiceUrl,
      providerPaymentId: invoiceId,
      payAmount: amount,
      payCurrency: preferredPay,
      raw,
    };
  }

  throw new Error(errors.filter(Boolean).join(" | ") || "NOWPayments invoice failed");
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
  // Invoices are priced in usd; also accept legacy usdt* IPNs if any remain.
  return c === "usd" || c === "usdt" || c.startsWith("usdt");
}
