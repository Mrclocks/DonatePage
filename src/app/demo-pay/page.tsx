import { Suspense } from "react";
import DemoPayClient from "./demo-pay-client";

export default function DemoPayPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-4 text-slate-400">
          در حال بارگذاری...
        </main>
      }
    >
      <DemoPayClient />
    </Suspense>
  );
}
