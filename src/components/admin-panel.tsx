"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ListOrdered,
  RefreshCw,
  Send,
  Target,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { clampPercent, formatMoney } from "@/lib/utils";

type TargetRow = {
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
  hasTelegramToken?: boolean;
};

export function AdminPanel() {
  const router = useRouter();
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [settings, setSettings] = useState<SettingsView>({
    telegramBotToken: "",
    telegramChatId: "",
    telegramEnabled: false,
  });
  const [title, setTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("1000");
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 md:gap-12 md:px-8 md:py-14">
      <div className="flex items-center justify-between gap-4">
        <BrandMark href="/" large />
        <Button variant="outline" onClick={logout} disabled={pending}>
          خروج
        </Button>
      </div>

      {message ? (
        <p className="text-sm text-orange-300">{message}</p>
      ) : null}

      <GlassCard className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-orange-300" />
            <h1 className="text-xl font-semibold text-white">ایجاد هدف جدید</h1>
          </div>
          <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-200">
            USDT · BEP20
          </span>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2.5">
            <Label htmlFor="title">عنوان هدف</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: توسعه پلتفرم MrClock"
            />
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="goal">مبلغ هدف (USDT)</Label>
            <Input
              id="goal"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0 USDT"
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <Switch checked={activate} onCheckedChange={setActivate} />
            <span className="text-sm text-slate-200">فعال</span>
          </label>
          <Button
            className="gap-2 rounded-xl shadow-[0_12px_40px_rgba(249,115,22,0.3)]"
            disabled={pending}
            onClick={createTarget}
          >
            <Check className="h-4 w-4" />
            ذخیره هدف
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="space-y-6">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-orange-300" />
          <h2 className="text-xl font-semibold text-white">
            اهداف قبلی و جاری
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-3 text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="px-3 text-right font-medium">عنوان هدف</th>
                <th className="px-3 text-right font-medium">مبلغ هدف</th>
                <th className="px-3 text-right font-medium">جمع کمک‌ها</th>
                <th className="px-3 text-right font-medium">پیشرفت</th>
                <th className="px-3 text-right font-medium">وضعیت</th>
                <th className="px-3 text-right font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {targets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-slate-400">
                    هنوز تارگتی نیست
                  </td>
                </tr>
              ) : (
                targets.map((target) => {
                  const percent = clampPercent(
                    (Number(target.raisedAmount) /
                      Number(target.goalAmount)) *
                      100,
                  );
                  return (
                    <tr
                      key={target.id}
                      className="rounded-xl bg-black/20 text-slate-200"
                    >
                      <td className="rounded-r-xl px-3 py-4">{target.title}</td>
                      <td className="px-3 py-4">
                        {formatMoney(target.goalAmount)}
                      </td>
                      <td className="px-3 py-4">
                        {formatMoney(target.raisedAmount)}
                      </td>
                      <td className="px-3 py-4">
                        <div className="space-y-2">
                          <Progress value={percent} className="h-2 w-28" />
                          <span className="text-xs text-slate-400">
                            {Math.round(percent)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={
                            target.status === "active"
                              ? "inline-flex items-center gap-2 text-sky-300"
                              : "inline-flex items-center gap-2 text-emerald-300"
                          }
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              target.status === "active"
                                ? "bg-sky-400"
                                : "bg-emerald-400"
                            }`}
                          />
                          {target.status === "active" ? "فعال" : "تکمیل شده"}
                        </span>
                      </td>
                      <td className="rounded-l-xl px-3 py-4 text-slate-400">
                        {new Date(target.createdAt).toLocaleDateString("fa-IR")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-orange-300" />
            <h2 className="text-xl font-semibold text-white">تنظیمات تلگرام</h2>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
              settings.telegramEnabled && settings.hasTelegramToken
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-slate-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                settings.telegramEnabled && settings.hasTelegramToken
                  ? "bg-emerald-400"
                  : "bg-slate-500"
              }`}
            />
            {settings.telegramEnabled && settings.hasTelegramToken
              ? "اتصال"
              : "غیرفعال"}
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2.5">
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
          <div className="space-y-2.5">
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

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex items-center gap-3">
            <Switch
              checked={settings.telegramEnabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, telegramEnabled: checked }))
              }
            />
            <span className="text-sm text-slate-300">
              فعال کردن اطلاع‌رسانی‌ها
            </span>
          </label>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="gap-2"
              disabled={pending}
              onClick={testTelegram}
            >
              <RefreshCw className="h-4 w-4" />
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
