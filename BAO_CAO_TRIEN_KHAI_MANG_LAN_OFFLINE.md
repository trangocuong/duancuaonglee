# Báo Cáo Triển Khai: Tối Ưu Hoá Hệ Thống Chạy Mạng LAN Nội Bộ (100% Offline)

Hệ thống TechOps đã được cấu hình và tối ưu hoá hoàn chỉnh để hoạt động độc lập trên **máy chủ mạng LAN nội bộ** trong phân xưởng/nhà máy mà không phụ thuộc vào kết nối Internet hay dịch vụ đám mây bên ngoài.

---

## 1. Các Thay Đổi Kỹ Thuật Đã Thực Hiện

### 1. Máy chủ mạng LAN chuyên dụng ([`techops/server.mjs`](file:///f:/workspace%20code/DuAnCuaOngLee/techops/server.mjs))
- Lắng nghe trên mọi giao tiếp mạng (`0.0.0.0:8788`).
- Tự động quét card mạng của máy chủ (`node:os`) và in ra màn hình console danh sách địa chỉ IP truy cập trong mạng LAN (ví dụ: `http://192.168.1.15:8788`, `http://10.0.28.134:8788`).
- Đa người dùng (Multi-User Authentication): Mỗi thành viên đăng nhập bằng tài khoản cá nhân, lưu giữ phiên làm việc và ngôn ngữ riêng theo tài khoản.

### 2. Quy trình Đăng ký Offline & Quản trị viên Phê duyệt
- **Không gửi email xác nhận**: Phù hợp cho mạng xưởng không có Internet / Mail server.
- **Bắt buộc Quản trị viên duyệt**:
  - Khi thành viên đăng ký tại `/signup`, tài khoản được tạo ở trạng thái **Chờ phê duyệt (`Pending`)**.
  - Người dùng chưa thể đăng nhập ngay và được chuyển về `/login?pending_approval=1` kèm thông báo: *"Đăng ký thành công! Tài khoản đang chờ Quản trị viên phê duyệt trước khi có thể đăng nhập."*
  - Quản trị viên vào trang **Quản trị người dùng (`/admin/users`)** xem danh sách và click nút **"Phê duyệt"** để kích hoạt tài khoản.

### 3. Tự động nhận diện dải IP Private LAN ([`techops/src/utils/lan-helpers.js`](file:///f:/workspace%20code/DuAnCuaOngLee/techops/src/utils/lan-helpers.js))
- Hỗ trợ các dải IP nội bộ chuẩn theo RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1`.
- Thành viên đăng nhập từ các máy tính khác trong xưởng không còn bị chặn bởi bộ lọc IP văn phòng cũ.

### 4. Tối ưu hiệu năng đồng thời cho SQLite (WAL Mode)
- Kích hoạt chế độ `PRAGMA journal_mode = WAL;` (Write-Ahead Logging).
- Thiết lập `PRAGMA synchronous = NORMAL;` và `PRAGMA busy_timeout = 5000;`.
- Giúp hàng chục máy trạm trong xưởng đọc ghi dữ liệu cùng một lúc mà không bị nghẽn hay khóa cơ sở dữ liệu (`database is locked`).

### 5. Tiện ích Vận hành 1-Click & Sao lưu dữ liệu
- **Khởi động 1-click Windows**: File [`techops/start-lan.bat`](file:///f:/workspace%20code/DuAnCuaOngLee/techops/start-lan.bat) — chỉ cần click đúp chuột trên máy chủ là server tự chạy và hiển thị link truy cập.
- **Tiện ích Sao lưu**: File [`techops/scripts/backup-db.mjs`](file:///f:/workspace%20code/DuAnCuaOngLee/techops/scripts/backup-db.mjs) sử dụng lệnh `VACUUM INTO` chuẩn của SQLite để tạo bản sao lưu nhất quán tức thì mà không cần tắt server:
  ```powershell
  npm run db:backup
  ```

---

## 2. Kết Quả Kiểm Thử (Verification Results)

| Bài kiểm tra | Kết quả | Trạng thái |
| :--- | :--- | :--- |
| **TechOps Main Test Suite** (`pnpm test`) | **371 / 371 PASS** | ✅ Thành công 100% |
| **Q-EVAL Subsystem Tests** (`node evaluation/test.mjs`) | **43 / 43 PASS** | ✅ Thành công 100% |
| **LOT Trace Regression Tests** (`node test-regression.cjs`) | **28 / 28 PASS** | ✅ Thành công 100% |
| **Quy trình đăng ký & duyệt tài khoản LAN** | Signup -> Pending -> Block -> Approve -> Login OK | ✅ Đã kiểm chứng thực tế |
| **Tiện ích sao lưu dữ liệu** (`npm run db:backup`) | Tạo bản sao lưu thành công tại `backups/` | ✅ Đã kiểm chứng thực tế |

---

## 3. Hướng Dẫn Sử Dụng Nhanh Trong Mạng LAN

### Cách khởi động máy chủ:
- **Cách 1 (Đơn giản nhất)**: Click đúp vào file [`techops/start-lan.bat`](file:///f:/workspace%20code/DuAnCuaOngLee/techops/start-lan.bat).
- **Cách 2 (Dùng lệnh)**:
  ```powershell
  cd "f:\workspace code\DuAnCuaOngLee\techops"
  npm run start:lan
  ```

### Màn hình máy chủ sẽ hiển thị:
```text
==================================================================
   🚀 TECHOPS - MÁY CHỦ MẠNG LAN NỘI BỘ ĐÃ SẴN SÀNG (OFFLINE 100%)
==================================================================
 - Truy cập tại máy chủ:  http://localhost:8788
 - Truy cập qua LAN (Ethernet): http://192.168.1.15:8788
------------------------------------------------------------------
 * Chế độ đa người dùng: BẬT
 * Tự động mở khoá IP mạng nội bộ (LAN): BẬT
 * Đăng ký tài khoản mới: CẦN QUẢN TRỊ VIÊN DUYỆT (tại /admin/users)
 * Cơ sở dữ liệu: F:\workspace code\DuAnCuaOngLee\techops\techops_local.db (SQLite WAL mode: Hoạt động)
==================================================================
```
👉 Bạn chỉ cần gửi đường link `http://<IP-máy-chủ>:8788` cho các máy tính khác trong cùng xưởng là mọi người có thể truy cập được ngay.
