import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/schema";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "donate.sqlite");

let sqlite: Database.Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      goal_amount REAL NOT NULL,
      raised_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USDT',
      status TEXT NOT NULL DEFAULT 'active',
      kind TEXT NOT NULL DEFAULT 'campaign',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id INTEGER NOT NULL REFERENCES targets(id),
      donor_name TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USDT',
      status TEXT NOT NULL DEFAULT 'pending',
      order_id TEXT NOT NULL UNIQUE,
      provider_payment_id TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const cols = database
    .prepare(`PRAGMA table_info(targets)`)
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "kind")) {
    database.exec(
      `ALTER TABLE targets ADD COLUMN kind TEXT NOT NULL DEFAULT 'campaign'`,
    );
  }

  const general = database
    .prepare(`SELECT id FROM targets WHERE kind = 'general' LIMIT 1`)
    .get() as { id: number } | undefined;
  if (!general) {
    database
      .prepare(
        `INSERT INTO targets (title, goal_amount, raised_amount, currency, status, kind, created_at, completed_at)
         VALUES (?, 0, 0, 'USDT', 'active', 'general', ?, NULL)`,
      )
      .run("حمایت عمومی از MrClock", new Date().toISOString());
  } else {
    database
      .prepare(
        `UPDATE targets SET status = 'active', completed_at = NULL WHERE id = ?`,
      )
      .run(general.id);
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;

  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    ensureSchema(sqlite);
    dbInstance = drizzle(sqlite, { schema });
    return dbInstance;
  } catch (error) {
    console.error("database_open_failed", {
      dbPath,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function nowIso() {
  return new Date().toISOString();
}
