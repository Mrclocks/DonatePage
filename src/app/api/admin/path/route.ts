import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminPathCookieOptions, isAdminAuthenticated } from "@/lib/auth";
import { getAdminPath, setAdminPath } from "@/lib/admin-path";
import { logAdmin } from "@/lib/donations";

export const runtime = "nodejs";

const schema = z.object({
  path: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9-_]+$/, "فقط حروف، عدد، - و _"),
});

const RESERVED = new Set([
  "api",
  "success",
  "demo-pay",
  "_next",
  "favicon.ico",
]);

function syncEnvAdminPath(nextPath: string) {
  const envPath = path.join(process.cwd(), ".env");
  try {
    if (!fs.existsSync(envPath)) return;
    let text = fs.readFileSync(envPath, "utf8");
    if (/^ADMIN_PATH=/m.test(text)) {
      text = text.replace(/^ADMIN_PATH=.*$/m, `ADMIN_PATH=${nextPath}`);
    } else {
      text = `${text.trimEnd()}\nADMIN_PATH=${nextPath}\n`;
    }
    fs.writeFileSync(envPath, text, "utf8");
  } catch {
    // best-effort; file + cookie still apply
  }
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ path: getAdminPath() });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "مسیر نامعتبر است (فقط حروف انگلیسی، عدد، - و _)" },
      { status: 400 },
    );
  }

  const nextPath = parsed.data.path.toLowerCase();
  if (RESERVED.has(nextPath)) {
    return NextResponse.json(
      { error: "این مسیر رزرو شده است" },
      { status: 400 },
    );
  }

  const saved = setAdminPath(nextPath);
  syncEnvAdminPath(saved);
  process.env.ADMIN_PATH = saved;
  logAdmin("admin_path_changed", saved);

  const response = NextResponse.json({ ok: true, path: saved });
  const cookie = adminPathCookieOptions(saved);
  response.cookies.set(cookie.name, cookie.value, cookie);
  return response;
}
