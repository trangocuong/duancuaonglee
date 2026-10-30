import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "./worker.js";

const dbPath = process.env.PREVIEW_DB || path.resolve("./techops_local.db");
const isNewDb = !fs.existsSync(dbPath);
const db = new DatabaseSync(dbPath);

if (isNewDb) {
  console.log(`[Preview] Đang khởi tạo cơ sở dữ liệu mới tại ${dbPath}...`);
  db.exec(fs.readFileSync("./database/schema.sql", "utf8"));
  db.exec(fs.readFileSync("./evaluation/schema.sql", "utf8"));
  db.exec(`
    INSERT INTO techops_users (username, password_hash, password_salt, display_name, role, email_verified_at)
    VALUES 
      ('preview@local', 'preview', 'preview', '미리보기 관리자', 'admin', datetime('now')),
      ('admin@hanyangdgtvina.com', 'FSizwwX0SNpQtxbuQnS/7dUHaxBX7BrIJAjB70rWKGA=', 'wGbjxFEL5wBhVxq8t+ZyyA==', 'Quản trị viên Hệ thống', 'admin', datetime('now'));
    INSERT INTO techops_sessions (id, user_id, expires_at)
    VALUES ('preview-session', 1, datetime('now', '+1 day'));
  `);
  db.exec(fs.readFileSync("./database/demo-seed.sql", "utf8"));
  console.log("[Preview] Đã nạp thành công schema và demo-seed.");
} else {
  console.log(`[Preview] Sử dụng cơ sở dữ liệu hiện có: ${dbPath}`);
  const realAdmin = db.prepare("SELECT id FROM techops_users WHERE username = 'admin@hanyangdgtvina.com'").get();
  if (!realAdmin) {
    db.prepare(`
      INSERT INTO techops_users (username, password_hash, password_salt, display_name, role, email_verified_at)
      VALUES ('admin@hanyangdgtvina.com', 'FSizwwX0SNpQtxbuQnS/7dUHaxBX7BrIJAjB70rWKGA=', 'wGbjxFEL5wBhVxq8t+ZyyA==', 'Quản trị viên Hệ thống', 'admin', datetime('now'))
    `).run();
  }
}

class D1Stmt {
  constructor(database, sql) { this.database = database; this.sql = sql; this.params = []; }
  bind(...args) { this.params = args; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.params) }; }
  async raw() { const statement=this.database.prepare(this.sql); statement.setReturnArrays(true); return statement.all(...this.params); }
  async run() {
    const info = this.database.prepare(this.sql).run(...this.params);
    return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
  }
}

const env = {
  DB: {
    prepare(sql) { return new D1Stmt(db, sql); },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  },
};

const port = Number(process.env.PREVIEW_PORT || 8788);
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("CF-Connecting-IP", "117.4.33.107");

  // Check if incoming request has a valid active session in DB
  const cookieHeader = req.headers.cookie || "";
  const sessionMatch = cookieHeader.match(/session=([^;]+)/);
  const incomingSessionId = sessionMatch ? sessionMatch[1].trim() : null;

  let validUserSession = false;
  if (incomingSessionId) {
    const existingSession = db.prepare("SELECT user_id, expires_at FROM techops_sessions WHERE id = ?").get(incomingSessionId);
    if (existingSession && new Date(existingSession.expires_at) > new Date()) {
      validUserSession = true;
    }
  }

  const url = req.url || "/";
  const isAuthPage = url.startsWith("/login") || url.startsWith("/signup") || url.startsWith("/forgot-password") || url.startsWith("/reset-password");

  // If not on auth page and no valid session, default to preview-session
  if (!validUserSession && !isAuthPage) {
    const sess = db.prepare("SELECT id FROM techops_sessions WHERE id = 'preview-session'").get();
    if (!sess) {
      db.prepare("INSERT OR REPLACE INTO techops_sessions (id, user_id, expires_at) VALUES ('preview-session', 1, datetime('now', '+1 day'))").run();
    }
    const existingCookie = headers.get("cookie") || "";
    const cleaned = existingCookie.replace(/session=[^;]*(;\s*)?/g, "").replace(/;\s*$/, "");
    headers.set("cookie", cleaned ? cleaned + "; session=preview-session" : "session=preview-session; lang=ko");
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body,
  });
  const response = await worker.fetch(request, env, {});
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Daily report preview: http://127.0.0.1:${port}/daily-reports`);
});
