import fs from "node:fs";
import path from "node:path";

function sanitize(value: string) {
  const cleaned = value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "");
  return cleaned || "admin";
}

export function getAdminPath() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const filePath = path.join(dataDir, "admin-path.txt");
  try {
    if (fs.existsSync(filePath)) {
      const fromFile = fs.readFileSync(filePath, "utf8");
      if (fromFile.trim()) return sanitize(fromFile);
    }
  } catch {
    // ignore and fall back to env
  }
  return sanitize(process.env.ADMIN_PATH || "admin");
}

export function setAdminPath(nextPath: string) {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const safe = sanitize(nextPath);
  fs.writeFileSync(path.join(dataDir, "admin-path.txt"), safe, "utf8");
  return safe;
}

export function adminUrl(suffix = "") {
  const base = `/${getAdminPath()}`;
  if (!suffix) return base;
  return `${base}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}
