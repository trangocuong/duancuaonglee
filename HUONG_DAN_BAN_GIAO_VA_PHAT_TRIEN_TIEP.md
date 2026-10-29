# 📘 HƯỚNG DẪN BÀN GIAO & PHÁT TRIỂN TIẾP — DỰ ÁN TECHOPS WORK MANAGER

> **Dành cho:** Kỹ sư tiếp nhận dự án để mang về nhà hoặc máy khác tiếp tục phát triển.  
> **Repository:** `https://github.com/trangocuong/duancuaonglee.git`  
> **Phiên bản:** Web 1.7.7 / LOT Tracker 1.2.9  
> **Ngày bàn giao:** 29/10/2026

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
- **Cơ chế CSDL SQLite tự động:** Khi chạy lần đầu trên máy mới, `preview.mjs` sẽ **tự động khởi tạo file CSDL `techops_local.db`**, chạy toàn bộ `schema.sql` (auth + daily reports) + `evaluation/schema.sql` (Q-EVAL 25 bảng) + nạp dữ liệu mẫu `demo-seed.sql` + tạo sẵn tài khoản Admin. Bạn không cần cài đặt SQL Server hay cấu hình thủ công.

---

## 2. 🔑 TÀI KHOẢN ĐĂNG NHẬP & PHÂN QUYỀN

| Vai trò | Email / Username | Mật khẩu | Chức năng |
|---|---|---|---|
| **Quản trị viên (Admin)** | `admin@hanyangdgtvina.com` | `AdminPassword123!` | Toàn quyền: Duyệt user mới (`/admin/users`), cấu hình cột (`/daily-fields`), thiết lập Master Data (`/master/setup`) |
| **Thành viên thử nghiệm** | `preview@local` | (Tự động đăng nhập qua session) | Kiểm tra nhanh không cần gõ mật khẩu |

### Luồng Đăng ký tài khoản mới:
1. Vào đường dẫn: `http://127.0.0.1:8788/signup`
2. Nhập Email có đuôi `@hanyangdgtvina.com` (ví dụ: `yourname@hanyangdgtvina.com`) và mật khẩu >= 8 ký tự.
3. Tài khoản đăng ký mới sẽ ở trạng thái **Chờ duyệt (Pending)**.
4. Đăng nhập bằng tài khoản `admin@hanyangdgtvina.com`, vào menu **Quản lý người dùng (`/admin/users`)** -> Bấm **Duyệt (Approve)** là tài khoản mới vào dùng được ngay.

---

## 3. 🧪 KIỂM THỬ HỆ THỐNG (TEST SUITE)

Sau mỗi lần bạn sửa code hoặc tách module ở nhà, hãy chạy 3 lệnh test này để đảm bảo không làm hỏng tính năng:

```bash
cd techops

# 1. Kiểm tra cú pháp nhanh:
node --check worker.js

# 2. Bộ 371 bài test hệ thống web chính (Auth, Daily, Routing):
node test.mjs
# Kỳ vọng: 371 passed, 0 failed

# 3. Bộ 43 bài test phân hệ đánh giá Q-EVAL:
node evaluation/test.mjs
# Kỳ vọng: 43 passed, 0 failed

# 4. Bộ 28 bài test thuật toán phả hệ LOT:
node lot-tracker/trace/test/test-regression.cjs
# Kỳ vọng: test-regression: 28/28 통과 (PASS)
```

> **Lưu ý quan trọng về Test:** 371 bài test do AI viết bằng so khớp chuỗi (string matching). Bạn **tuyệt đối không sửa file test** để ép test pass; code mới phải đáp ứng đúng hành vi của app.

---

## 4. 🗂️ BẢN ĐỒ CẤU TRÚC MÃ NGUỒN ĐÃ TÁCH (`techops/src/`)

File khổng lồ ban đầu `worker.js` (5.215 dòng) đã được tách gần 50% ra thành các module chuyên trách trong `techops/src/`:

```
techops/
├── worker.js                          ← Entry point chính (~2.771 dòng, routing & daily logic)
├── i18n.js                            ← Từ điển đa ngôn ngữ (key-centric: ko/en/vi)
├── preview.mjs                        ← Dev server local dùng SQLite đĩa cứng
├── schema.sql                         ← Schema CSDL Auth & Báo cáo ngày
├── demo-seed.sql                      ← Dữ liệu mẫu ban đầu
├── test.mjs                           ← 371 test case
│
├── src/                               ← THƯ MỤC KIẾN TRÚC MỚI ĐÃ CHUẨN HÓA
│   ├── utils/
│   │   └── helpers.js                 ← 20 hàm tiện ích: PBKDF2 hash, cookies, escapeHtml, tokens, security headers
│   │
│   ├── views/
│   │   └── layout.js                  ← Khung HTML, toàn bộ CSS Responsive/Dark/Print, Sidebar, Subtabs, forbiddenResponse
│   │
│   ├── routes/
│   │   ├── auth.js                    ← 21 hàm Auth: Login, Logout, Signup, Verify, Reset Password, Setup, Change Password
│   │   └── users.js                   ← Quản trị người dùng Admin: Approve, Edit, Delete, Promote, Demote, Revoke, Reset Pass
│   │
│   ├── modules/
│   │   ├── translation/
│   │   │   └── translation-service.js ← Engine dịch Workers AI (@cf/meta/m2m100-1.2b), Cache SQLite, nhận diện ngôn ngữ
│   │   ├── lot/
│   │   │   ├── lot-info.js            ← Form nhập LOT + API /api/lot-info
│   │   │   ├── lot-tracker.js         ← Giao diện web LOT Tracker (/lot-tracker)
│   │   │   └── lot-step-report.js     ← Engine phân tích bước LOT
│   │   └── daily/
│   │       └── daily-field-csv.js     ← Import/Export CSV cấu hình trường
│   │
│   └── config/
│       └── daily-config.js            ← Cấu hình phân loại báo cáo ngày
```

---

## 5. 🌐 CÁCH DÙNG & MỞ RỘNG BỘ TỪ ĐIỂN ĐA NGÔN NGỮ (`techops/i18n.js`)

Bộ từ điển đã được cấu trúc lại theo dạng **Key-Centric** trực quan:

```javascript
// Thêm cụm từ mới cực kỳ đơn giản:
export const DICTIONARY = {
  // Key: { ko: "Tiếng Hàn", en: "Tiếng Anh", vi: "Tiếng Việt" }
  myNewFeature: { ko: "새로운 기능", en: "New Feature", vi: "Tính năng mới" },
};
```

- Trong code hiển thị:
  ```javascript
  const L = t(lang);
  console.log(L.myNewFeature); // Tự động lấy đúng ngôn ngữ của user hiện tại
  ```

---

## 6. 📝 KẾ HOẠCH CÁC BƯỚC TIẾP THEO KHI VỀ NHÀ

Nếu bạn muốn tiếp tục tối ưu thêm, các bước tiếp theo theo lộ trình:

1. **Bước tiếp theo 1 — Tách Cấu hình trường Báo cáo ngày (`/daily-fields`):**
   - Tạo file `techops/src/routes/daily-fields.js`.
   - Di chuyển các hàm: `pageDailyFields`, `handleDailyFieldCreate`, `pageDailyFieldDetail`, `handleDailyFieldUpdate`, `handleDailyFieldDelete`, `handleDailyFieldMove`, `handleDailyFieldOptionCreate`, `handleDailyFieldOptionDelete`, `handleDailyFieldOptionImport`, `fieldTransfer`, `applyDailyReportFieldTemplate`.

2. **Bước tiếp theo 2 — Tách Quản lý mục Báo cáo ngày (`/daily-items`):**
   - Tạo file `techops/src/routes/daily-items.js`.
   - Di chuyển: `pageDailyItems`, `handleDailyItemCreate`, `pageDailyItemDetail`, `handleDailyItemAddUpdate`, `handleDailyItemDelete`, `handleDailyItemClose`.

3. **Bước tiếp theo 3 — Tách Trang Báo cáo ngày chính (`/daily-reports`):**
   - Tạo file `techops/src/routes/daily-reports.js`.
   - Di chuyển hàm `pageDailyReports` và các logic gom nhóm trạng thái.

4. **Bước tiếp theo 4 — Tách Master Data (`/master`):**
   - Tạo file `techops/src/routes/master.js`.

Sau khi hoàn tất 4 bước trên, file `worker.js` sẽ chỉ còn đúng **~200 dòng** đóng vai trò là Router tinh gọn, toàn bộ dự án trở thành kiến trúc module chuyên nghiệp, dễ bảo trì và mở rộng lâu dài!
