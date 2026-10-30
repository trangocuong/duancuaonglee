/**
 * Backup Database Script — Sao lưu cơ sở dữ liệu SQLite an toàn khi hệ thống đang chạy
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DB_PATH || path.resolve("./techops_local.db");

if (!fs.existsSync(dbPath)) {
  console.error(`[Backup Error] Không tìm thấy tệp cơ sở dữ liệu tại: ${dbPath}`);
  process.exit(1);
}

const backupDir = path.resolve("./backups");
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const backupFile = path.join(backupDir, `techops_backup_${timestamp}.db`);

try {
  console.log(`[Backup] Bắt đầu sao lưu ${dbPath}...`);
  const db = new DatabaseSync(dbPath);
  // Sử dụng lệnh VACUUM INTO chuẩn của SQLite để tạo bản sao lưu nhất quán tức thì (hot backup)
  // ngay cả khi đang có người đọc/ghi dữ liệu.
  const escapedBackupFile = backupFile.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedBackupFile}';`);
  db.close();

  const stats = fs.statSync(backupFile);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`[Backup Thành công] Đã lưu bản sao lưu tại:`);
  console.log(`  -> ${backupFile} (${sizeMb} MB)`);
} catch (err) {
  console.error("[Backup Thất bại]", err);
  process.exit(1);
}
