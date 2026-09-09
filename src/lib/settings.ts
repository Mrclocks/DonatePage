import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/schema";

export type AppSettings = {
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
};

export async function getSettings(): Promise<AppSettings> {
  const db = getDb();
  const rows = db.select().from(settings).all();
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    telegramBotToken:
      map.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: map.telegramChatId || process.env.TELEGRAM_CHAT_ID || "",
    telegramEnabled:
      (map.telegramEnabled ?? String(Boolean(process.env.TELEGRAM_BOT_TOKEN))) ===
      "true",
  };
}

export function setSetting(key: keyof AppSettings, value: string) {
  const db = getDb();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    })
    .run();
}

export function setSettings(partial: Partial<AppSettings>) {
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    setSetting(key as keyof AppSettings, String(value));
  }
}

export function getSettingValue(key: string) {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}
