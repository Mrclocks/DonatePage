import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/auth";
import { createTarget, listTargets, logAdmin } from "@/lib/donations";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  goalAmount: z.number().positive().max(100_000_000),
  activate: z.boolean().default(true),
});

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ targets: listTargets() });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const id = createTarget({
    title: parsed.data.title,
    goalAmount: parsed.data.goalAmount,
    currency: "USDT",
    activate: parsed.data.activate,
  });
  logAdmin("target_created", String(id));
  return NextResponse.json({ ok: true, id });
}
