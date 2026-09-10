import { NextResponse } from "next/server";
import { z } from "zod";
import { markDonationPaid } from "@/lib/donations";
import { isDemoMode } from "@/lib/nowpayments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  orderId: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  // Hard block outside explicit demo mode (impossible to hit accidentally in live prod).
  if (!isDemoMode()) {
    return NextResponse.json({ error: "Demo disabled" }, { status: 403 });
  }

  const ip = clientIp(request);
  const limited = rateLimit(`demo-pay:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await markDonationPaid(parsed.data.orderId, `demo_paid`);
  if (!result.ok) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
