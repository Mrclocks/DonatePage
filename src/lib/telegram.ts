import { getSettings } from "@/lib/settings";

export async function sendTelegramMessage(text: string) {
  const settings = await getSettings();
  if (!settings.telegramEnabled) {
    return { ok: false, skipped: true as const, reason: "disabled" };
  }
  if (!settings.telegramBotToken || !settings.telegramChatId) {
    return { ok: false, skipped: true as const, reason: "missing_config" };
  }

  const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: settings.telegramChatId,
      text,
      disable_web_page_preview: true,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    return {
      ok: false as const,
      skipped: false as const,
      reason: JSON.stringify(data),
    };
  }

  return { ok: true as const, skipped: false as const };
}

export function donationTelegramText(input: {
  donorName?: string | null;
  amount: number;
  currency: string;
  targetTitle: string;
}) {
  const name = input.donorName?.trim() || "ناشناس";
  return [
    "دونیت جدید — MrClock",
    `نام: ${name}`,
    `مبلغ: ${input.amount} USDT`,
    `تارگت: ${input.targetTitle}`,
  ].join("\n");
}
