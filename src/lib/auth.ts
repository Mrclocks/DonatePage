import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "mrclock_admin";
const ADMIN_PATH_COOKIE = "mrclock_admin_path";
const PASSWORD_HASH_KEY = "adminPasswordHash";
const SESSION_NBF_KEY = "adminSessionNotBefore";

function getSecret() {
  const secret =
    process.env.SESSION_SECRET ||
    "dev-only-insecure-session-secret-change-me!!";
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  ) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createAdminSession() {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Invalidate all admin JWTs issued before now (e.g. after password change). */
export function invalidateAdminSessions() {
  try {
    const db = getDb();
    const value = String(Math.floor(Date.now() / 1000));
    db.insert(settings)
      .values({ key: SESSION_NBF_KEY, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value },
      })
      .run();
  } catch {
    // best-effort; cookie delete still applies to current client
  }
}

function getSessionNotBefore() {
  try {
    const db = getDb();
    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, SESSION_NBF_KEY))
      .get();
    const nbf = Number(row?.value || 0);
    return Number.isFinite(nbf) ? nbf : 0;
  } catch {
    return 0;
  }
}

export async function isAdminAuthenticated() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;
    const { payload } = await jwtVerify(token, getSecret());
    const nbf = getSessionNotBefore();
    if (nbf && typeof payload.iat === "number" && payload.iat < nbf) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getStoredPasswordHash() {
  try {
    const db = getDb();
    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, PASSWORD_HASH_KEY))
      .get();
    return row?.value || null;
  } catch {
    return null;
  }
}

export async function setAdminPassword(password: string) {
  const hash = await hashPassword(password);
  const db = getDb();
  db.insert(settings)
    .values({ key: PASSWORD_HASH_KEY, value: hash })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: hash },
    })
    .run();
}

export function requireAdminPasswordConfigured() {
  const stored = getStoredPasswordHash();
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plain = process.env.ADMIN_PASSWORD;
  if (!stored && !hash && !plain) {
    throw new Error("ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required");
  }
}

export async function validateAdminPassword(password: string) {
  const stored = getStoredPasswordHash();
  if (stored) return verifyPassword(password, stored);

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) return verifyPassword(password, hash);

  const plain = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(password);
  const b = Buffer.from(plain);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminPathCookieOptions(pathValue: string) {
  return {
    name: ADMIN_PATH_COOKIE,
    value: pathValue,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export function createOrderId() {
  return `mc_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
