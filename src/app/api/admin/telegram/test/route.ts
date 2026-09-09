import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendTelegramMessage(
    "تست اتصال تلگرام — MrClock Donate\nاگر این پیام را می‌بینید، تنظیمات درست است.",
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason || "Telegram send failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
