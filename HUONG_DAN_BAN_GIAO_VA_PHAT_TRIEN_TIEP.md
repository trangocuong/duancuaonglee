# 📘 HƯỚNG DẪN BÀN GIAO & PHÁT TRIỂN TIẾP — DỰ ÁN TECHOPS WORK MANAGER

> **Dành cho:** Kỹ sư tiếp nhận dự án để mang về nhà hoặc máy khác tiếp tục phát triển.  
> **Repository:** `https://github.com/trangocuong/duancuaonglee.git`  
> **Phiên bản:** Web 1.7.7 / LOT Tracker 1.2.9  
> **Trạng thái:** Toàn bộ monolith `worker.js` (5.215 dòng) đã tách thành công xuống còn **269 dòng** (~95% reduction), 100% test suites PASS!

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

Sau mỗi lần bạn sửa code hoặc thêm tính năng ở nhà, hãy chạy 3 lệnh test này để đảm bảo không làm hỏng tính năng:

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

## 4. 🗂️ BẢN ĐỒ CẤU TRÚC MÃ NGUỒN ĐÃ HOÀN TẤT CHUẨN HÓA

Toàn bộ file đơn khối `worker.js` (5.215 dòng) đã được bóc tách hoàn chỉnh thành kiến trúc module chuyên nghiệp:

```
techops/
├── worker.js                          ← Entry point Router siêu gọn (269 dòng, điều hướng HTTP)
├── i18n.js                            ← Proxy trỏ vào src/i18n/index.js (giữ tương thích ngược)
├── preview.mjs                        ← Dev server local dùng SQLite đĩa cứng
├── schema.sql                         ← Schema CSDL Auth & Báo cáo ngày
├── demo-seed.sql                      ← Dữ liệu mẫu ban đầu
├── test.mjs                           ← 371 test case
│
├── src/                               ← HỆ THỐNG MỚI ĐÃ CHUẨN HÓA 100%
│   ├── routes/                        ← CÁC CONTROLLER ĐIỀU HƯỚNG TỪNG PHÂN HỆ
│   │   ├── auth.js                    ← Đăng nhập, đăng ký, quên mật khẩu, đổi pass, xác thực email
│   │   ├── users.js                   ← Quản trị người dùng Admin: duyệt, phân quyền, xoá, khoá
│   │   ├── daily-reports.js           ← Màn hình Báo cáo ngày SSD/Module, thẻ tổng hợp, việc cần chú ý
│   │   ├── daily-items.js             ← Danh sách mục công việc, form tạo mới, cập nhật tiến độ ngày
│   │   ├── daily-fields.js            ← Quản lý trường động EAV, Import/Export CSV, Cascading dropdowns
│   │   ├── master.js                  ← Quản lý Dữ liệu chuẩn (Master data sets & fields)
│   │   ├── tasks.js                   ← Bảng công việc cũ (Legacy task board), tiến độ, JSON API
│   │   └── evaluation.js              ← Cổng nhúng phân hệ Q-EVAL iframe & static assets
│   │
│   ├── modules/                       ← CÁC SERVICES XỬ LÝ NGHIỆP VỤ LÕI
│   │   ├── daily/
│   │   │   ├── daily-helpers.js       ← Ghép giá trị động, trạng thái chú ý, match mã sản phẩm SSD/MDL
│   │   │   └── daily-field-csv.js     ← Parser CSV cho cấu hình trường
│   │   ├── lot/
│   │   │   ├── lot-info.js            ← Form nhập LOT + API /api/lot-info
│   │   │   ├── lot-tracker.js         ← Giao diện web LOT Tracker (/lot-tracker)
│   │   │   └── lot-step-report.js     ← Engine phân tích bước LOT
│   │   └── translation/
│   │       └── translation-service.js ← Engine dịch Workers AI (@cf/meta/m2m100-1.2b), Cache SQLite, nhận diện ngôn ngữ
│   │
│   ├── i18n/                          ← HỆ THỐNG ĐA NGÔN NGỮ THEO TÍNH NĂNG (FEATURE-BASED)
│   │   ├── common.js                  ← Nút chung (Lưu, Huỷ, Xoá), trạng thái, phân loại chung
│   │   ├── nav.js                     ← Thanh điều hướng, menu sidebar, tab con
│   │   ├── auth.js                    ← Toàn bộ câu chữ Đăng nhập, Đăng ký, Đổi pass
│   │   ├── daily.js                   ← Toàn bộ câu chữ Báo cáo ngày, Items, Fields, CSV words
│   │   ├── lot.js                     ← Toàn bộ câu chữ LOT (lotWords, trackerWords, stepReportWords)
│   │   ├── master.js                  ← Toàn bộ câu chữ Master data
│   │   └── index.js                   ← File tổng hợp, export t(), getLang(), DICTIONARY
│   │
│   ├── views/
│   │   └── layout.js                  ← Khung HTML dùng chung, full CSS Responsive/Dark/Print, Header
│   │
│   └── utils/
│       └── helpers.js                 ← 20 hàm tiện ích: PBKDF2 hash, cookies, escapeHtml, tokens, security headers
```

---

## 5. 💡 GIẢI ĐÁP CÁC THẮC MẮC QUAN TRỌNG

### ❓ Câu hỏi 1: "Hiện tại trong dự án đang có gì mà rác thế, thấy quá nhiều file?"
Trong thư mục gốc bạn thấy nhiều file là do lịch sử phát triển của nhóm Hàn Quốc trước đây:
1. **Thư mục `desktop/` (8.15 MB, 49 files):** Là dự án ứng dụng C# Windows Desktop cũ đã bị bỏ dở (abandoned). Nó chứa các bản build HTML offline (v1.0.1 đến v1.0.6) và thư viện xlsx. Nếu không phát triển app desktop C#, bạn hoàn toàn có thể bỏ qua thư mục này.
2. **Thư mục `lot-tracker/releases/`:** Chứa 10 file HTML đóng gói (bundle) tĩnh từ v1.2.0 đến v1.2.9 để người dùng nội bộ tải về mở offline khi không có mạng.
3. **Các file `*-migration.sql`:** Là các file script migration CSDL cũ (`lot-info-migration.sql`, `status-code-migration.sql`...). Toàn bộ cấu trúc chuẩn đã được gộp sẵn vào `techops/schema.sql`. (Lưu ý: Không xoá file này vì bộ test tự động `test.mjs` có bài test kiểm tra khả năng chạy lại migration).
4. **Các file `CLAUDE*.md`:** Là nhật ký ghi chú ngữ cảnh của các lập trình viên AI trước đây.

### ❓ Câu hỏi 2: "Vẫn đầy những biến ngôn ngữ trong các file code mà không phải ở file ngôn ngữ?"
- **Trước đây:** Lập trình viên trước sợ đụng vào file từ điển khổng lồ gây xung đột, nên đã khai báo cục bộ:
  - `lot-info.js` tự có biến `lotWords = { ko: ..., en: ..., vi: ... }`
  - `lot-tracker.js` tự có biến `trackerWords = { ko: ... }`
  - `lot-step-report.js` tự có `WORDS = { ... }` và `FOLLOW_UP_WORDS = { ... }`
  - `layout.js` tự có `versionLabels`, `taskMenuLabels`, `legacyTaskLabel` và các câu đổi mật khẩu.
  - `worker.js` tự có hàm `dailyUi(lang)` và `words = [...]` trong CSV import.
- **Hiện tại:** **100% các biến trên đã được dọn sạch và quy tụ về `src/i18n/`**. Không còn bất kỳ dictionary inline nào nằm rải rác trong code ứng dụng nữa.

### ❓ Câu hỏi 3: "Sau này có cách nào phân biệt khu vực ngôn ngữ của từng tính năng thay vì đi tìm?"
**ĐÃ CÓ GIẢI PHÁP TRIỆT ĐỂ:** Hệ thống i18n mới được chia theo từng tính năng (Feature-based i18n) tại thư mục `techops/src/i18n/`:
- Đang sửa màn hình **LOT Tracker / LOT Info** -> Chỉ cần mở file: **`src/i18n/lot.js`**
- Đang sửa màn hình **Báo cáo ngày / Danh sách việc** -> Mở file: **`src/i18n/daily.js`**
- Đang sửa màn hình **Đăng nhập / Đổi mật khẩu** -> Mở file: **`src/i18n/auth.js`**
- Đang sửa màn hình **Master Data** -> Mở file: **`src/i18n/master.js`**
- Đang sửa **Menu / Sidebar** -> Mở file: **`src/i18n/nav.js`**
- Các từ dùng chung (Lưu, Huỷ, Xoá, Đang tải...) -> Mở file: **`src/i18n/common.js`**

Không bao giờ phải đi tìm trong một file từ điển 2.000 dòng khổng lồ hay lục lọi trong các file view/logic nữa!

---

## 6. 🎯 BƯỚC TIẾP THEO THEO YÊU CẦU CỦA BẠN: TÍNH NĂNG POPUP TÀI KHOẢN (USER CARD)

Sau khi code đã được tách rời sạch sẽ, bạn có thể triển khai tính năng đầu tiên mà bạn đã gửi ảnh mẫu:
1. **Gom khu vực Header:**
   - Hiện tại: `한국어 · English · Tiếng Việt | 미리보기 관리자 (Quản trị viên) | Đăng xuất`
   - Chuyển thành: Một nút avatar/tên người dùng ở góc trên bên phải.
2. **Khi bấm vào tên người dùng:**
   - Mở ra popup card menu (như ảnh bạn đính kèm):
     - Hiển thị: Avatar + Tên hiển thị + Email tài khoản + Role (Quản trị viên / Thành viên).
     - Mục **Đổi mật khẩu** (mở popup đổi password).
     - Mục **Đổi ngôn ngữ** (chuyển đổi Tiếng Hàn / Tiếng Anh / Tiếng Việt).
     - Mục **Đăng xuất**.
3. **Lưu ngôn ngữ theo Account:**
   - Hiện tại ngôn ngữ lưu trong Cookie trình duyệt. Có thể thêm cột `language` vào bảng `techops_users` để khi đăng nhập trên bất kỳ máy nào, hệ thống tự load ngôn ngữ ưa thích của tài khoản đó.
