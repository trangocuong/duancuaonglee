# TÀI LIỆU BÀN GIAO & HƯỚNG DẪN HỆ THỐNG TECHOPS

> **Dự án**: TechOps Management System (Hệ thống quản lý tác nghiệp kỹ thuật & Báo cáo hàng ngày)  
> **Thời điểm bàn giao**: 01/11/2026  
> **Trạng thái kiểm thử**: **452/452 bài test PASS 100%** (381 core + 43 evaluation + 28 lot tracker)  
> **Phiên bản mã nguồn**: Branch `main` (đồng bộ GitHub)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

| Thành phần | Công nghệ / Đặc điểm |
|------------|---------------------|
| **Ngôn ngữ** | JavaScript ESM hiện đại (Node.js 22+ / Cloudflare Workers runtime) |
| **Kiểu render** | SSR (Server-Side Rendering) — Máy chủ render HTML hoàn chỉnh, không phụ thuộc client JS framework nặng |
| **Cơ sở dữ liệu** | SQLite native (`node:sqlite` trên local server, Cloudflare D1 trên cloud) với chế độ WAL (Write-Ahead Logging) chịu tải cao |
| **Môi trường vận hành** | Hỗ trợ 100% Mạng LAN Nội bộ Offline (không cần Internet, không phụ thuộc CDN bên ngoài) |
| **Đa ngôn ngữ** | Hỗ trợ 3 ngôn ngữ: Tiếng Hàn (`ko`), Tiếng Anh (`en`), Tiếng Việt (`vi`). Ngôn ngữ ưu tiên được lưu tự động theo từng tài khoản vào DB |

---

## 2. PHÂN QUYỀN & TRẢI NGHIỆM NGƯỜI DÙNG (UX)

Giao diện được thiết kế **tối giản, tách bạch rõ ràng giữa Tác nghiệp và Cài đặt** để người dùng không bị rối mắt:

### A. Dành cho Nhân viên (Member) — Thao tác tác nghiệp gọn nhẹ
* **Không thấy các cài đặt phức tạp**: Nhân viên chỉ thấy các tính năng nghiệp vụ cần làm hàng ngày, hoàn toàn ẩn các mục cấu hình kỹ thuật.
* **Các mục trên Menu chính**:
  1. **Báo cáo hàng ngày (`/daily-reports` & `/daily-items`)**:
     * Xem tiến độ công việc theo ngày, lọc theo bộ phận (`SSD`, `Module`, `All`).
     * Nhận diện các hạng mục chậm trễ (*Trì trệ > 3 ngày*) hoặc có vấn đề cần xử lý gấp (*Action Required*).
     * Nhập báo cáo tiến độ mới mỗi ngày.
  2. **Tra cứu LOT Tracker (`/lot-tracker`)**: Tải file Excel tiến trình để tự động bóc tách và vẽ cây phả hệ kế thừa LOT dạng SVG trực quan.
  3. **Đánh giá nghiệp vụ Q-Eval (`/tasks`)**: Giao diện đánh giá nghiệp vụ độc lập tải mượt mà.
  4. **Tra cứu Dữ liệu chuẩn Master Data (`/master`)**: Tra cứu thông tin sản phẩm, mã công đoạn với bộ lọc nhanh.
  5. **Hồ sơ cá nhân**: Nhấp vào tên tài khoản ở góc trên bên phải để:
     * Chuyển đổi nhanh ngôn ngữ hiển thị (Hàn / Anh / Việt).
     * Đổi mật khẩu cá nhân (bắt buộc nhập mật khẩu hiện tại để bảo mật).

### B. Dành cho Quản trị viên (Admin) — Cài đặt tập trung đúng ngữ cảnh
Admin có đầy đủ quyền tác nghiệp như Member, đồng thời có thêm các công cụ quản trị được đặt đúng vị trí:
1. **Quản lý người dùng (`/admin/users`)**: Nằm trên thanh menu bên trái:
   * Xem danh sách tài khoản đã đăng ký.
   * Duyệt tài khoản mới đăng ký từ mạng LAN (chuyển từ *Chờ duyệt* sang *Hoạt động*).
   * Khóa/Kích hoạt tài khoản, cấp lại mật khẩu tạm thời, thăng cấp Admin hoặc xóa tài khoản.
2. **Cài đặt trường báo cáo động (`/daily-fields`)**: Nằm ở tab phụ bên trong khu vực Báo cáo:
   * Thêm/sửa/xóa các trường nhập liệu tự do.
   * **Sắp xếp thứ tự các lựa chọn (Options)**: Có nút ▲ Lên / ▼ Xuống trực tiếp để điều chỉnh thứ tự ưu tiên các mục trong dropdown.
   * Nhập/xuất danh sách trường và lựa chọn qua file CSV UTF-8.
   * Nút **"Áp dụng cấu hình chuẩn"** (70 tổ hợp MDL·SSD) có hộp thoại cảnh báo đa ngôn ngữ an toàn.
3. **Quản lý cấu hình & Dữ liệu Master Data (`/master`)**:
   * Tại trang danh sách từng loại bảng: Có form **+ Thêm dữ liệu mới** tự động sinh các ô nhập liệu theo đúng kiểu dữ liệu của bảng.
   * Tại trang chi tiết từng dòng: Có nút **Chỉnh sửa** và nút **Xóa dữ liệu**.
   * Quản lý loại bảng (`/master/setup`): Thêm bảng mới, cấu hình cột và kiểu dữ liệu (Text, Number, Date, Y/N, Dropdown).

---

## 3. CÁC ĐIỂM ĐÃ ĐƯỢC TỐI ƯU & KHẮC PHỤC

1. **Khắc phục lỗ hổng đổi mật khẩu**:
   * Modal đổi mật khẩu đã bổ sung ô nhập **Mật khẩu hiện tại**.
   * Hệ thống xác thực mã băm mật khẩu cũ trước khi cho phép cập nhật mật khẩu mới.
2. **Loại bỏ hoàn toàn các chuỗi cứng tiếng Hàn trong cảnh báo Admin**:
   * Các thông báo cảnh báo nguy hiểm (như nút reset trường chuẩn ở `/daily-fields`) đã được đa ngôn ngữ hóa đầy đủ sang Tiếng Việt và Tiếng Anh.
   * Trang từ chối quyền (403 Forbidden) hiển thị tiêu đề chuẩn xác *"Không có quyền truy cập"* thay vì *"Không tìm thấy trang"*.
3. **Thao tác linh hoạt, không còn fix cứng**:
   * Thứ tự các lựa chọn trong dropdown có thể di chuyển lên/xuống linh hoạt.
   * Bảng Master Data có đầy đủ chức năng Thêm - Sửa - Xóa trực tiếp từ giao diện web, không cần thao tác thủ công dưới cơ sở dữ liệu.

---

## 4. HƯỚNG DẪN KHỞI ĐỘNG & VẬN HÀNH TRÊN MÁY CHỦ LAN

### A. Khởi động máy chủ mạng LAN
Chỉ cần nhấp đúp chuột vào file:
```cmd
F:\workspace code\DuAnCuaOngLee\techops\start-lan.bat
```
Hoặc mở terminal tại thư mục `techops` và chạy:
```powershell
npm run start:lan
```
* Máy chủ sẽ tự động lắng nghe trên mọi card mạng (`0.0.0.0:8788`).
* Màn hình console sẽ tự động in ra địa chỉ IP LAN của máy chủ (ví dụ: `http://192.168.1.100:8788`). Các máy tính khác trong mạng nội bộ chỉ cần mở trình duyệt và truy cập vào địa chỉ này.

### B. Tài khoản quản trị mặc định
* **Tài khoản**: `admin@hanyangdgtvina.com`
* **Mật khẩu mặc định**: `Ong123`
*(Khuyến nghị đổi mật khẩu sau khi bàn giao thông qua nút Hồ sơ cá nhân ở góc trên bên phải).*

### C. Sao lưu dữ liệu định kỳ (Backup Database)
Để sao lưu dữ liệu SQLite an toàn (kể cả khi máy chủ đang chạy mà không làm gián đoạn):
```powershell
npm run db:backup
```
File sao lưu sẽ được lưu tự động vào thư mục `techops/backups/techops_backup_YYYYMMDD_HHMMSS.db`.

### D. Kiểm tra chất lượng mã nguồn (Verification)
Bất cứ khi nào cần kiểm tra lại độ ổn định của hệ thống:
```powershell
npm test
```
Toàn bộ các bộ kiểm thử (Unit test, Integration test, Regression test) sẽ tự động chạy và trả về kết quả `452 passed, 0 failed`.

---

## 5. DANH SÁCH TỆP TIN QUAN TRỌNG

* `techops/server.mjs`: Máy chủ HTTP LAN production-ready với SQLite WAL mode.
* `techops/worker.js`: Bộ điều hướng Front Controller / Router của toàn hệ thống.
* `techops/src/routes/`: Thư mục chứa các luồng xử lý nghiệp vụ (`auth.js`, `daily-reports.js`, `daily-items.js`, `daily-fields.js`, `master.js`, `users.js`).
* `techops/src/views/`: Thư mục chứa giao diện HTML/CSS (`layout.js`, `auth.js`, `users.js`, `tasks.js`).
* `techops/src/i18n/`: Thư mục từ điển đa ngôn ngữ (`auth.js`, `common.js`, `daily.js`, `master.js`, `nav.js`).
* `techops/database/schema.sql`: Toàn bộ cấu trúc bảng cơ sở dữ liệu.
* `techops/techops_local.db`: Tệp tin cơ sở dữ liệu SQLite thực tế đang chạy.
