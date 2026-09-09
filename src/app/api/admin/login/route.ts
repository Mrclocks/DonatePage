import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminPathCookieOptions,
  createAdminSession,
  validateAdminPassword,
} from "@/lib/auth";
import { getAdminPath } from "@/lib/admin-path";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`admin-login:${ip}`, 8, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const ok = await validateAdminPassword(parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await createAdminSession();
  const adminPath = getAdminPath();
  const response = NextResponse.json({ ok: true, adminPath });
  const cookie = adminPathCookieOptions(adminPath);
  response.cookies.set(cookie.name, cookie.value, cookie);
  return response;
}
