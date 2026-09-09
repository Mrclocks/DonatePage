"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { GlassCard } from "@/components/glass-card";
import { AlertBox } from "@/components/ui/alert-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function adminBaseFromLocation() {
  const path = window.location.pathname.replace(/\/$/, "") || "/admin";
  if (path.endsWith("/login")) {
    return path.slice(0, -"/login".length) || "/admin";
  }
  return path;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function login() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("رمز عبور نادرست است");
        return;
      }
      const data = await response.json().catch(() => ({}));
      const base =
        data.adminPath ? `/${data.adminPath}` : adminBaseFromLocation();
      router.replace(base);
      router.refresh();
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-10 px-4 py-10">
      <BrandMark href="/" large />
      <GlassCard>
        <div className="mb-8 space-y-2">
          <p className="text-sm text-orange-300/90">ورود</p>
          <h1 className="text-2xl font-semibold text-white">پنل مدیریت</h1>
        </div>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <div className="space-y-2.5">
            <Label htmlFor="password">رمز عبور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <AlertBox variant="error" title="ورود ناموفق">
              {error}
            </AlertBox>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "..." : "ورود"}
          </Button>
        </form>
      </GlassCard>
    </main>
  );
}
