import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/auth";
import { getSettings, setSettings } from "@/lib/settings";
import { logAdmin } from "@/lib/donations";

export const runtime = "nodejs";

const schema = z.object({
  telegramBotToken: z.string().max(200).optional(),
  telegramChatId: z.string().max(100).optional(),
  telegramEnabled: z.boolean().optional(),
  defaultCurrency: z.enum(["USD", "USDT"]).optional(),
});

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettings();
  return NextResponse.json({
    settings: {
      ...settings,
      telegramBotToken: settings.telegramBotToken
        ? `${settings.telegramBotToken.slice(0, 6)}••••••••`
        : "",
      hasTelegramToken: Boolean(settings.telegramBotToken),
    },
  });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const patch: Record<string, string | boolean> = {};
  if (parsed.data.telegramChatId !== undefined) {
    patch.telegramChatId = parsed.data.telegramChatId;
  }
  if (parsed.data.telegramEnabled !== undefined) {
    patch.telegramEnabled = parsed.data.telegramEnabled;
  }
  if (parsed.data.defaultCurrency !== undefined) {
    patch.defaultCurrency = parsed.data.defaultCurrency;
  }
  if (
    parsed.data.telegramBotToken !== undefined &&
    !parsed.data.telegramBotToken.includes("•")
  ) {
    patch.telegramBotToken = parsed.data.telegramBotToken;
  }

  setSettings(patch);
  logAdmin("settings_updated");
  return NextResponse.json({ ok: true });
}
