import { Suspense } from "react";
import PayClient from "./pay-client";

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-4">
          <p className="text-sm text-slate-400">در حال بارگذاری…</p>
        </main>
      }
    >
      <PayClient />
    </Suspense>
  );
}
