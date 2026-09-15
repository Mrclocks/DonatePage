/**
 * App donation limits (USD ≈ USDT on the form).
 * Live check on this merchant's NOWPayments account (2026-09-15):
 * $10 USDT TRC20 / BTC → "less than minimal"; $15+ succeeds.
 * Other merchants (e.g. PasarGuard) can be lower — mins are per-account.
 */
export const MIN_DONATION_USDT = 15;
export const MAX_DONATION_USDT = 1_000_000;
export const DONATION_AMOUNT_PRESETS = [15, 25, 50] as const;
export const DEFAULT_DONATION_USDT = 25;
