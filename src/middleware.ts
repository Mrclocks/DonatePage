import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function sanitize(value: string) {
  const cleaned = value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "");
  return cleaned || "admin";
}

function adminPathFromCookieHint(request: NextRequest) {
  // Optional cookie set after path change so middleware can rewrite without FS.
  const hinted = request.cookies.get("mrclock_admin_path")?.value;
  if (hinted) return sanitize(hinted);
  return sanitize(process.env.ADMIN_PATH || "admin");
}

function applySecurityHeaders(response: NextResponse, pathname: string) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminPath = adminPathFromCookieHint(request);

  // Rewrite custom admin path -> internal /admin routes
  if (pathname === `/${adminPath}` || pathname === `/${adminPath}/`) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    const response = NextResponse.rewrite(url);
    response.cookies.set("mrclock_admin_path", adminPath, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
    return applySecurityHeaders(response, pathname);
  }
  if (
    pathname === `/${adminPath}/login` ||
    pathname === `/${adminPath}/login/`
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    const response = NextResponse.rewrite(url);
    response.cookies.set("mrclock_admin_path", adminPath, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
    return applySecurityHeaders(response, pathname);
  }

  // Hide default /admin when a custom path is configured
  if (
    adminPath !== "admin" &&
    (pathname === "/admin" || pathname.startsWith("/admin/"))
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return applySecurityHeaders(NextResponse.next(), pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
