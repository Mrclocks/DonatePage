import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const COOKIE_NAME = "mrclock_admin";

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

export async function isAdminAuthenticated() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function requireAdminPasswordConfigured() {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plain = process.env.ADMIN_PASSWORD;
  if (!hash && !plain) {
    throw new Error("ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required");
  }
}

export async function validateAdminPassword(password: string) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) return verifyPassword(password, hash);
  const plain = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(password);
  const b = Buffer.from(plain);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
