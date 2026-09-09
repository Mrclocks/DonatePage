import { NextResponse } from "next/server";
import { destroyAdminSession, isAdminAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await destroyAdminSession();
  return NextResponse.json({ ok: true });
}
