/**
 * NOWPayments hosted checkout rejects USDT-BSC payments below network minimum
 * ("Crypto amount X is less than minimal") — Confirm stays stuck with a 400.
 * Empirically ~5 USDT fails and ~25 USDT works on this merchant; keep a safe floor.
 */
export const MIN_DONATION_USDT = 15;
export const MAX_DONATION_USDT = 1_000_000;
export const DONATION_AMOUNT_PRESETS = [15, 25, 50] as const;
export const DEFAULT_DONATION_USDT = 25;
