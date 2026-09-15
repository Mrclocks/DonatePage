/**
 * App donation limits (USD ≈ USDT on the form).
 * NOWPayments still enforces per-coin network minimums at Confirm time —
 * e.g. USDT BEP20 often rejects ~5 USDT. We allow small donations and only
 * soft-prefer BEP20 when the amount clears that network floor.
 */
export const MIN_DONATION_USDT = 5;
export const MAX_DONATION_USDT = 1_000_000;
export const DONATION_AMOUNT_PRESETS = [5, 10, 25, 50] as const;
export const DEFAULT_DONATION_USDT = 25;

/**
 * Soft-prefer usdtbsc only at/above this amount. Below it, open the hosted
 * gateway without a preferred coin so donors can pick a network that accepts $5.
 */
export const USDTBSC_SOFT_PREFER_MIN_USDT = 15;
