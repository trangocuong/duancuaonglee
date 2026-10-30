# 📘 HƯỚNG DẪN BÀN GIAO & PHÁT TRIỂN TIẾP — DỰ ÁN TECHOPS WORK MANAGER

> **Dành cho:** Kỹ sư tiếp nhận dự án để mang về nhà hoặc máy khác tiếp tục phát triển.  
> **Repository:** `https://github.com/trangocuong/duancuaonglee.git`  
> **Phiên bản:** Web 1.7.7 / LOT Tracker 1.2.9  
> **Trạng thái:** Dự án đã được chuẩn hóa 100% theo mô hình Clean Architecture: xóa toàn bộ file trùng lặp ngoài root, gom toàn bộ test vào `tests/`, mã nguồn vào `src/`, 100% test suites PASS!

---

## 1. 🚀 HƯỚNG DẪN CÀI ĐẶT & CHẠY DỰ ÁN TRÊN MÁY MỚI

Khi bạn clone dự án về máy ở nhà, chỉ cần thực hiện 4 bước sau:

### Bước 1: Clone mã nguồn
```bash
git clone https://github.com/trangocuong/duancuaonglee.git
cd duancuaonglee/techops
```

### Bước 2: Chuẩn bị môi trường
- **Node.js:** Yêu cầu Node.js **>= 22.0.0** (khuyến nghị **v24.x** vì dự án dùng module chuẩn `node:sqlite`).
- **Pnpm:** Cài đặt pnpm toàn cục nếu chưa có:
  ```bash
  npm install -g pnpm
  ```

### Bước 3: Cài đặt thư viện dependencies
```bash
cd techops
pnpm install
```

### Bước 4: Khởi động Server Local (Không cần Cloudflare / Không cần Internet)
```bash
node preview.mjs
```
- Mở trình duyệt truy cập: **`http://127.0.0.1:8788/daily-reports`**
- **Cơ chế CSDL SQLite tự động:** Khi chạy lần đầu trên máy mới, `preview.mjs` sẽ **tự động khởi tạo file CSDL `techops_local.db`**, nạp schema + dữ liệu mẫu `demo-seed.sql` + tạo sẵn tài khoản Admin.

---

## 2. 🔑 TÀI KHOẢN ĐĂNG NHẬP & PHÂN QUYỀN

| Vai trò | Email / Username | Mật khẩu | Chức năng |
|---|---|---|---|
| **Quản trị viên (Admin)** | `admin@hanyangdgtvina.com` | `AdminPassword123!` | Toàn quyền: Duyệt user mới (`/admin/users`), cấu hình cột (`/daily-fields`), thiết lập Master Data (`/master/setup`) |
| **Thành viên thử nghiệm** | `preview@local` | (Tự động đăng nhập qua session) | Kiểm tra nhanh không cần gõ mật khẩu |

---

## 3. 🧪 KIỂM THỬ HỆ THỐNG (TEST SUITE)

```bash
cd techops

# 1. Chạy toàn bộ 371 bài test hệ thống web chính (đã chuyển vào tests/):
pnpm test
# hoặc: node tests/test.mjs
# Kỳ vọng: 371 passed, 0 failed

# 2. Bộ 43 bài test phân hệ đánh giá Q-EVAL:
node evaluation/test.mjs
# Kỳ vọng: 43 passed, 0 failed

# 3. Bộ 28 bài test thuật toán phả hệ LOT:
node lot-tracker/trace/test/test-regression.cjs
# Kỳ vọng: test-regression: 28/28 통과 (PASS)
```

---

## 4. 🗂️ CẤU TRÚC THƯ MỤC CHUẨN MỰC (CLEAN ARCHITECTURE)

Thư mục gốc `techops/` giờ đây hoàn toàn sạch sẽ, không còn file trùng lặp hay test nằm rải rác:

```
techops/
├── worker.js                          ← Entry point Router siêu gọn (269 dòng, điều hướng HTTP)
├── preview.mjs                        ← Dev server local dùng SQLite đĩa cứng
├── schema.sql                         ← Schema CSDL Auth & Báo cáo ngày
├── demo-seed.sql                      ← Dữ liệu mẫu ban đầu
├── lot-info-migration.sql             ← Script CSDL lịch sử (giữ lại theo yêu cầu test)
├── status-code-migration.sql          ← Script CSDL lịch sử (giữ lại theo yêu cầu test)
├── package.json                       ← Scripts npm chuẩn ("test": "node tests/test.mjs")
├── wrangler.toml                      ← Cấu hình Cloudflare Worker
│
├── tests/                             ← [QUY HOẠCH MỚI] GOM TOÀN BỘ FILE TEST
│   ├── test.mjs                       ← 371 test case hệ thống web
│   ├── test-user-management.mjs       ← Test phân quyền & quản trị tài khoản
│   ├── test-translation.mjs           ← Test engine dịch Workers AI
│   └── test-lot-steps.mjs             ← Test giải thuật phân tích bước LOT
│
├── src/                               ← [100% SOURCE CODE THỰC THI ỨNG DỤNG]
│   ├── routes/                        ← Các Controller điều hướng
│   │   ├── auth.js, users.js, daily-reports.js, daily-items.js, daily-fields.js, master.js, tasks.js, evaluation.js
│   ├── modules/                       ← Các Services & thuật toán lõi
│   │   ├── lot/
│   │   │   ├── lot-info.js            ← Form nhập LOT + API /api/lot-info
│   │   │   ├── lot-tracker.js         ← Giao diện web LOT Tracker (/lot-tracker)
│   │   │   └── lot-step-report.js     ← Engine phân tích bước LOT
│   │   ├── daily/
│   │   │   ├── daily-helpers.js       ← Ghép giá trị động, kiểm tra chú ý, match P/N SSD/MDL
│   │   │   └── daily-field-csv.js     ← Parser CSV cấu hình trường
│   │   └── translation/
│   │       └── translation-service.js ← Engine dịch Workers AI, Cache SQLite
│   ├── config/
│   │   └── daily-config.js            ← Cấu hình cây phân loại báo cáo ngày
│   ├── i18n/                          ← Từ điển đa ngôn ngữ theo màn hình (auth, daily, lot, master, nav, common, index)
│   ├── views/                         ← layout.js (Khung HTML, full CSS)
│   └── utils/                         ← helpers.js (PBKDF2 hash, cookies, tokens)
│
├── evaluation/                        ← Sub-project Q-EVAL (React + TypeScript)
└── lot-tracker/                       ← Sub-project giải thuật truy vết phả hệ LOT
```
