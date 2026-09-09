import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAdminAuthenticated,
  setAdminPassword,
  validateAdminPassword,
} from "@/lib/auth";
import { logAdmin } from "@/lib/donations";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "رمز جدید باید حداقل ۸ کاراکتر باشد" },
      { status: 400 },
    );
  }

  const valid = await validateAdminPassword(parsed.data.currentPassword);
  if (!valid) {
    return NextResponse.json({ error: "رمز فعلی نادرست است" }, { status: 401 });
  }

  await setAdminPassword(parsed.data.newPassword);
  logAdmin("password_changed");
  return NextResponse.json({ ok: true });
}
