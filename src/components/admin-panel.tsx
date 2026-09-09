"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/utils";

type Target = {
  id: number;
  title: string;
  goalAmount: number;
  raisedAmount: number;
  currency: string;
  status: string;
  createdAt: string;
};

type SettingsView = {
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  defaultCurrency: "USD" | "USDT";
  hasTelegramToken?: boolean;
};

export function AdminPanel() {
  const router = useRouter();
  const [targets, setTargets] = useState<Target[]>([]);
  const [settings, setSettings] = useState<SettingsView>({
    telegramBotToken: "",
    telegramChatId: "",
    telegramEnabled: false,
    defaultCurrency: "USDT",
  });
  const [title, setTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("1000");
  const [currency, setCurrency] = useState<"USD" | "USDT">("USDT");
  const [activate, setActivate] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function load() {
    const [targetsRes, settingsRes] = await Promise.all([
      fetch("/api/admin/targets"),
      fetch("/api/admin/settings"),
    ]);
    if (targetsRes.status === 401 || settingsRes.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const targetsData = await targetsRes.json();
    const settingsData = await settingsRes.json();
    setTargets(targetsData.targets || []);
    setSettings(settingsData.settings);
    setCurrency(settingsData.settings.defaultCurrency || "USDT");
  }

  useEffect(() => {
    void load();
  }, []);

  function createTarget() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          goalAmount: Number(goalAmount),
          currency,
          activate,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "خطا در ذخیره تارگت");
        return;
      }
      setTitle("");
      setGoalAmount("1000");
      setMessage("تارگت ذخیره شد");
      await load();
    });
  }

  function saveSettings() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "خطا در ذخیره تنظیمات");
        return;
      }
      setMessage("تنظیمات ذخیره شد");
      await load();
    });
  }

  function testTelegram() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/telegram/test", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "ارسال تست ناموفق");
        return;
      }
      setMessage("پیام تست ارسال شد");
    });
  }

  function logout() {
    startTransition(async () => {
      await fetch("/api/admin/logout", { method: "POST" });
      router.replace("/admin/login");
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-6 md:py-14">
      <div className="flex items-center justify-between gap-4">
        <BrandMark href="/" />
        <Button variant="outline" onClick={logout} disabled={pending}>
          خروج
        </Button>
      </div>

      {message ? (
        <p className="text-sm text-orange-300">{message}</p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-2">
        <GlassCard>
          <div className="mb-8 space-y-2">
            <p className="text-sm text-slate-400">تارگت جدید</p>
            <h1 className="text-2xl font-semibold text-white">ساخت هدف دونیت</h1>
          </div>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">عنوان</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="هدف ماه"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">مبلغ هدف</Label>
              <Input
                id="goal"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={currency === "USDT" ? "default" : "outline"}
                onClick={() => setCurrency("USDT")}
              >
                USDT
              </Button>
              <Button
                type="button"
                variant={currency === "USD" ? "default" : "outline"}
                onClick={() => setCurrency("USD")}
              >
                USD
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-sm text-white">فعال‌سازی فوری</p>
                <p className="text-xs text-slate-400">
                  تارگت فعلی بسته و این یکی فعال می‌شود
                </p>
              </div>
              <Switch checked={activate} onCheckedChange={setActivate} />
            </div>
            <Button className="w-full" disabled={pending} onClick={createTarget}>
              ذخیره
            </Button>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-8 space-y-2">
            <p className="text-sm text-slate-400">لیست</p>
            <h2 className="text-2xl font-semibold text-white">تارگت‌ها</h2>
          </div>
          <div className="space-y-4">
            {targets.length === 0 ? (
              <p className="text-sm text-slate-400">هنوز تارگتی نیست</p>
            ) : (
              targets.map((target) => (
                <div
                  key={target.id}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{target.title}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {formatMoney(target.raisedAmount, target.currency as "USD" | "USDT")}{" "}
                        /{" "}
                        {formatMoney(target.goalAmount, target.currency as "USD" | "USDT")}
                      </p>
                    </div>
                    <span
                      className={
                        target.status === "active"
                          ? "text-xs text-orange-300"
                          : "text-xs text-slate-400"
                      }
                    >
                      {target.status === "active" ? "فعال" : "تمام‌شده"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="mb-8 space-y-2">
          <p className="text-sm text-slate-400">تنظیمات</p>
          <h2 className="text-2xl font-semibold text-white">ربات تلگرام</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="token">Bot Token</Label>
            <Input
              id="token"
              value={settings.telegramBotToken}
              onChange={(e) =>
                setSettings((s) => ({ ...s, telegramBotToken: e.target.value }))
              }
              placeholder="123456:ABC..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chat">Chat ID</Label>
            <Input
              id="chat"
              value={settings.telegramChatId}
              onChange={(e) =>
                setSettings((s) => ({ ...s, telegramChatId: e.target.value }))
              }
              placeholder="-100..."
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.telegramEnabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, telegramEnabled: checked }))
              }
            />
            <span className="text-sm text-slate-300">ارسال نوتیف فعال باشد</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" disabled={pending} onClick={testTelegram}>
              تست اتصال
            </Button>
            <Button disabled={pending} onClick={saveSettings}>
              ذخیره تنظیمات
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
