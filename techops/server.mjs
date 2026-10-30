/**
 * TechOps Production LAN Server (100% Offline)
 * 
 * Chạy hệ thống trên máy chủ mạng LAN nội bộ:
 *  - Lắng nghe trên mọi card mạng (0.0.0.0)
 *  - Tự động nhận diện IP LAN và hiển thị URL truy cập cho các máy trong xưởng
 *  - Kích hoạt SQLite WAL mode (cho phép đọc/ghi đồng thời cực nhanh)
 *  - Đa người dùng (Multi-User Authentication)
 *  - Thành viên mới đăng ký ở chế độ chờ duyệt (Pending), Admin duyệt tại /admin/users
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "./worker.js";
import { getLocalLanIps } from "./src/utils/lan-helpers.js";

const dbPath = process.env.DB_PATH || path.resolve("./techops_local.db");
const isNewDb = !fs.existsSync(dbPath);
const db = new DatabaseSync(dbPath);

// Tối ưu hóa SQLite cho môi trường mạng LAN nhiều người dùng đồng thời
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA busy_timeout = 5000;");

if (isNewDb) {
  console.log(`[LAN Server] Đang khởi tạo cơ sở dữ liệu mới tại ${dbPath}...`);
  if (fs.existsSync("./database/schema.sql")) {
    db.exec(fs.readFileSync("./database/schema.sql", "utf8"));
  }
  if (fs.existsSync("./evaluation/schema.sql")) {
    db.exec(fs.readFileSync("./evaluation/schema.sql", "utf8"));
  }
  // Tạo tài khoản Quản trị viên mặc định nếu cơ sở dữ liệu mới tinh
  db.exec(`
    INSERT INTO techops_users (username, password_hash, password_salt, display_name, role, email_verified_at)
    VALUES 
      ('admin@hanyangdgtvina.com', 'FSizwwX0SNpQtxbuQnS/7dUHaxBX7BrIJAjB70rWKGA=', 'wGbjxFEL5wBhVxq8t+ZyyA==', 'Quản trị viên Hệ thống', 'admin', datetime('now'))
    ON CONFLICT(username) DO NOTHING;
  `);
  if (fs.existsSync("./database/demo-seed.sql") && process.env.LOAD_DEMO_SEED !== "false") {
    db.exec(fs.readFileSync("./database/demo-seed.sql", "utf8"));
  }
  console.log("[LAN Server] Đã nạp thành công schema ban đầu.");
} else {
  // Đảm bảo có ít nhất 1 tài khoản quản trị viên
  const hasAdmin = db.prepare("SELECT id FROM techops_users WHERE role = 'admin'").get();
  if (!hasAdmin) {
    db.prepare(`
      INSERT INTO techops_users (username, password_hash, password_salt, display_name, role, email_verified_at)
      VALUES ('admin@hanyangdgtvina.com', 'FSizwwX0SNpQtxbuQnS/7dUHaxBX7BrIJAjB70rWKGA=', 'wGbjxFEL5wBhVxq8t+ZyyA==', 'Quản trị viên Hệ thống', 'admin', datetime('now'))
      ON CONFLICT(username) DO NOTHING;
    `).run();
  }
}

class D1Stmt {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.params = [];
  }
  bind(...args) {
    this.params = args;
    return this;
  }
  async first() {
    return this.database.prepare(this.sql).get(...this.params) ?? null;
  }
  async all() {
    return { results: this.database.prepare(this.sql).all(...this.params) };
  }
  async raw() {
    const statement = this.database.prepare(this.sql);
    statement.setReturnArrays(true);
    return statement.all(...this.params);
  }
  async run() {
    const info = this.database.prepare(this.sql).run(...this.params);
    return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
  }
}

const env = {
  DB: {
    prepare(sql) {
      return new D1Stmt(db, sql);
    },
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
  LAN_MODE: true,
  ALLOW_LAN_IPS: true,
  REQUIRE_ADMIN_APPROVAL: true,
};

const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || "0.0.0.0";

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  // Trích xuất địa chỉ IP thực tế của máy trạm kết nối
  let clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  if (Array.isArray(clientIp)) clientIp = clientIp[0];
  clientIp = clientIp.split(",")[0].trim();
  if (clientIp.startsWith("::ffff:")) clientIp = clientIp.slice(7);
  headers.set("CF-Connecting-IP", clientIp);

  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const requestUrl = `http://${req.headers.host || `localhost:${port}`}${req.url}`;
  const request = new Request(requestUrl, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body,
  });

  try {
    const response = await worker.fetch(request, env, {});
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error("[LAN Server Error]", err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  const lanIps = getLocalLanIps();
  console.log("");
  console.log("==================================================================");
  console.log("   🚀 TECHOPS - MÁY CHỦ MẠNG LAN NỘI BỘ ĐÃ SẴN SÀNG (OFFLINE 100%)");
  console.log("==================================================================");
  console.log(` - Truy cập tại máy chủ:  http://localhost:${port}`);
  if (lanIps.length > 0) {
    lanIps.forEach((iface) => {
      console.log(` - Truy cập qua LAN (${iface.name}): http://${iface.address}:${port}`);
    });
  } else {
    console.log(` - Địa chỉ LAN: http://0.0.0.0:${port}`);
  }
  console.log("------------------------------------------------------------------");
  console.log(" * Chế độ đa người dùng: BẬT");
  console.log(" * Tự động mở khoá IP mạng nội bộ (LAN): BẬT");
  console.log(" * Đăng ký tài khoản mới: CẦN QUẢN TRỊ VIÊN DUYỆT (tại /admin/users)");
  console.log(` * Cơ sở dữ liệu: ${dbPath} (SQLite WAL mode: Hoạt động)`);
  console.log("==================================================================");
  console.log("");
});
