import { NextResponse } from "next/server";
import { getDonationByOrderId } from "@/lib/donations";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`pay-status:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const orderId = new URL(request.url).searchParams.get("order")?.trim() || "";
  if (!orderId) {
    return NextResponse.json({ error: "Missing order" }, { status: 400 });
  }

  const donation = getDonationByOrderId(orderId);
  if (!donation) {
    return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  }

  return NextResponse.json({
    orderId: donation.orderId,
    status: donation.status,
    amount: Number(donation.amount) || 0,
    payAddress: donation.payAddress || "",
    payAmount: Number(donation.payAmount ?? donation.amount) || 0,
    payCurrency: (donation.payCurrency || "usdtbsc").toLowerCase(),
  });
}
