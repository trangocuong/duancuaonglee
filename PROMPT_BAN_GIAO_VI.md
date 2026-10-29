# PROMPT BÀN GIAO PHÁT TRIỂN HỆ THỐNG TECHOPS

> Tài liệu này là prompt có thể sao chép nguyên văn cho kỹ sư hoặc trợ lý lập trình tiếp nhận dự án. Phạm vi làm việc là môi trường nghiệp vụ nội bộ và bản sao mã nguồn đi kèm. Không giả định có dịch vụ bên ngoài; mọi thay đổi và kiểm thử phải thực hiện trên môi trường cục bộ đã được chuẩn bị.

## 1. Vai trò và mục tiêu

Bạn là kỹ sư tiếp nhận hệ thống **TechOps Work Manager**. Hãy tiếp tục phát triển từ đúng trạng thái mã nguồn hiện tại, giữ nguyên dữ liệu nghiệp vụ, quy tắc LOT, phân quyền và giao diện ba ngôn ngữ. Trước khi sửa, phải đọc các tài liệu chỉ dẫn trong thư mục liên quan và xác định chính xác màn hình, hàm, bảng dữ liệu và bài kiểm thử bị ảnh hưởng.

Mục tiêu ưu tiên:

1. Duy trì ổn định chức năng đang vận hành.
2. Phát triển và kiểm thử hoàn toàn bằng bản sao cục bộ.
3. Không suy đoán dữ liệu nghiệp vụ chưa được xác nhận.
4. Không xóa hoặc khởi tạo lại dữ liệu chỉ để sửa lỗi hay đồng bộ.
5. Sau mỗi thay đổi, ghi rõ: nội dung sửa, phạm vi dữ liệu, kiểm thử đã chạy, kết quả thật và giới hạn còn lại.

## 2. Mốc mã nguồn bàn giao

- Phiên bản web: **1.7.7** (`package.json`).
- LOT Tracker HTML: **1.2.9** (`lot-tracker/release.json`).
- Commit tham chiếu của gói bàn giao: `17d7ba73c6bc6b595d4c375f6bd5ea4ed40ee009`.
- Thời điểm commit tham chiếu: `2026-10-05T03:47:25Z`.
- Gói bàn giao được lập ngày 22/10/2026.
- Trạng thái mã nguồn tại thời điểm đóng gói: không có thay đổi chưa ghi nhận.

Đọc trước khi làm việc:

1. `AGENTS.md` — quy tắc phát triển và ràng buộc chung.
2. `DEVELOPMENT-STATUS.md` — phiên bản, thay đổi gần nhất, kiểm thử và việc còn lại.
3. `README.md` — tổng quan sản phẩm.
4. `CLAUDE.md` và `CLAUDE-CODE-HANDOFF.md` — quy tắc nghiệp vụ và lịch sử bàn giao.
5. Nếu sửa LOT Tracker HTML, đọc thêm `lot-tracker/AGENTS.md`, `lot-tracker/README.md`, `lot-tracker/MIGRATION.md`, `lot-tracker/VERIFICATION.md`.

## 3. Kiến trúc mã nguồn

### 3.1 Ứng dụng web chính

- `worker.js`: ứng dụng đơn khối có chủ đích. Chứa định tuyến HTTP, xác thực, phân quyền, HTML/CSS, i18n, báo cáo hằng ngày, công việc cũ, dữ liệu chuẩn và quản lý người dùng.
- `schema.sql`: lược đồ chính cho tài khoản, phiên đăng nhập, công việc, báo cáo hằng ngày, cache dịch, dữ liệu chuẩn và dữ liệu LOT.
- `daily-report-config.js`: 70 đường phân loại chuẩn SSD/Module và mã trạng thái công việc.
- `daily-field-csv.js`: nhập/xuất cấu hình trường báo cáo hằng ngày bằng CSV.
- `lot-tracker.js`: đọc tệp See LOT/RUNID, tính trạng thái, split/merge, scrap, yield và tạo báo cáo Excel cho màn hình web.
- `lot-step-report.js`: gom lượt công đoạn, báo cáo theo step, LOT follow-up và lịch sử split/merge.
- `lot-info.js`: tra cứu dữ liệu LOT đã lưu từ báo cáo hằng ngày.
- `preview.mjs`: chạy bản xem trước cục bộ với DB trong bộ nhớ và tài khoản quản trị giả lập.
- `test.mjs`, `test-translation.mjs`, `test-user-management.mjs`, `test-lot-steps.mjs`: kiểm thử hồi quy chính.

### 3.2 Phân hệ đánh giá Q-EVAL

- `evaluation/app/page.tsx`: giao diện React của các màn hình đánh giá.
- `evaluation/app/api/*/route.ts`: API theo miền nghiệp vụ: evaluations, history, timeline, manual, import, mass-reports.
- `evaluation/app/lib/*`: phân quyền, đọc Excel, tạo báo cáo Excel, xử lý Part Number.
- `evaluation/server.ts`: cầu nối từ `/api/evaluation/*` sang các handler.
- `evaluation/schema.sql`: năm bảng đánh giá bổ sung.
- `evaluation/generated/assets.js`, `evaluation/generated/server.js`: kết quả build được commit cùng mã nguồn; không sửa trực tiếp.
- Khi sửa nguồn trong `evaluation/app`, phải chạy lại build để cập nhật `evaluation/generated`.

### 3.3 LOT Tracker HTML độc lập

- Sản phẩm đang duy trì nằm trong `lot-tracker/`.
- Kết quả sử dụng là một tệp HTML duy nhất: `lot-tracker/releases/LOT-Tracker-v1.2.9.html`.
- Có hai vùng chức năng dùng chung bộ tệp đầu vào và lựa chọn ngôn ngữ:
  - Báo cáo LOT.
  - Truy vết phả hệ LOT.
- `desktop/` là mã lịch sử để đối chiếu; không tạo tính năng hoặc bản phát hành mới từ thư mục này.

### 3.4 Cấu trúc dữ liệu quan trọng

- Tài khoản và phiên: `techops_users`, `techops_sessions`, `techops_login_attempts`, `techops_password_resets`, `techops_email_verifications`.
- Công việc cũ: `tech_task`, `tech_update`.
- Báo cáo hằng ngày kiểu cũ: `tech_daily_report`.
- Báo cáo hằng ngày hiện tại dùng EAV:
  - `tech_daily_item`: đầu việc lâu dài.
  - `tech_daily_update`: báo cáo theo ngày.
  - `tech_daily_field`: định nghĩa trường động.
  - `tech_daily_field_option`: lựa chọn và quan hệ dropdown cha/con.
  - `tech_daily_update_value`: giá trị theo từng trường.
- Cache ba ngôn ngữ: `tech_translation_cache`.
- Dữ liệu chuẩn dùng JSON theo hàng: `tech_master_set`, `tech_master_field`, `tech_master_row`, `tech_master_log`.
- Dữ liệu LOT nội bộ: `tech_lot_info`.
- Q-EVAL: `qeval_evaluations`, `qeval_evaluation_logs`, `qeval_evaluation_timeline`, `qeval_mass_evaluation_reports`, `tech_eval_permissions`.

Không hợp nhất EAV của báo cáo hằng ngày với `data_json` của dữ liệu chuẩn. Hai mô hình này phục vụ mục đích khác nhau và là thiết kế có chủ đích.

## 4. Xác thực và phân quyền

### 4.1 Quyền cấp hệ thống

- `admin`: toàn quyền hệ thống, quản lý tài khoản, cấu hình trường hằng ngày, cấu hình loại/cột dữ liệu chuẩn và quản lý quyền đánh giá.
- `member`: dùng chức năng nghiệp vụ thông thường; không thấy menu quản trị.
- Phiên đăng nhập được lưu trong `techops_sessions`.
- Khóa tạm sau 5 lần đăng nhập sai trong 15 phút.
- Tài khoản thường bị giới hạn theo danh sách IP nội bộ; quản trị viên là ngoại lệ. Không bỏ kiểm tra này khi sửa xác thực.
- Không cho phép người quản trị tự hạ quyền hoặc tự chặn tài khoản của chính mình.
- Khi xóa tài khoản thường, xóa phiên và liên kết tài khoản nhưng phải giữ nội dung công việc, báo cáo và tên người phụ trách trong lịch sử.

### 4.2 Quyền riêng của Q-EVAL

- Quản trị viên hệ thống được xem là `admin` của Q-EVAL.
- Thành viên thông thường mặc định là `viewer`.
- `viewer`: chỉ xem.
- `editor`: được tạo, sửa, xóa, nhập Excel và cập nhật timeline.
- `admin`: có thêm quyền quản lý quyền đánh giá.
- Trạng thái quyền gồm `approved`, `pending`, `rejected`; chỉ tài khoản được duyệt mới thao tác theo vai trò.
- Việc nâng/hạ quản trị viên hệ thống chỉ thực hiện ở màn hình quản lý người dùng chính, không thực hiện trong Q-EVAL.

## 5. Cấu trúc giao diện chung

- Thanh bên trái chứa menu chính.
- Góc trên có lựa chọn `한국어 / English / Tiếng Việt`, tên người dùng, vai trò và đăng xuất.
- Lựa chọn ngôn ngữ được lưu bằng cookie và áp dụng cho phần lớn giao diện.
- Giao diện hỗ trợ màn hình rộng, di động, chế độ sáng/tối theo hệ thống và chế độ in ở các trang phù hợp.
- Phía dưới thanh bên hiển thị phiên bản ứng dụng và mã phiên bản runtime nếu có trong môi trường hiện tại.

## 6. Menu và cách hoạt động

### 6.1 Báo cáo công việc hằng ngày — `Báo cáo công việc hằng ngày`

Đường dẫn chính: `/daily-reports`. Menu con phía trên gồm `Tra cứu`, `Nhập`, `LOT Tracker`; quản trị viên thấy thêm `Cài đặt`.

#### A. Tra cứu — `/daily-reports`

- Chọn ngày và bộ phận: `Tất cả`, `SSD`, `Module`.
- Nếu không chọn được ngày yêu cầu, hệ thống ưu tiên ngày làm việc hôm trước, sau đó lấy ngày mới nhất có dữ liệu.
- Hiển thị riêng hai nguồn dữ liệu:
  - Báo cáo Excel lịch sử từ `tech_daily_report`.
  - Báo cáo động hiện tại từ `tech_daily_item` + `tech_daily_update` + EAV.
- Nhóm theo SSD/Module; mỗi đầu việc có tiêu đề, trạng thái, người phụ trách, nội dung, sự cố/biện pháp và ghi chú.
- Bảng chi tiết có công đoạn, Part Number, Lot Number, số lượng, số đạt, số lỗi, yield, trạng thái và sự cố.
- Tự động tổng hợp:
  - Mục cần kiểm tra ngay khi trạng thái là vấn đề/chậm.
  - Mục chưa báo cáo trong ngày đã chọn.
  - Mục đình trệ từ 3 ngày trở lên hoặc chưa từng cập nhật.
- Có chức năng in/lưu PDF thông qua chế độ in của trình duyệt.

#### B. Nhập — `/daily-items`

- Danh sách đầu việc đang hoạt động; có bộ lọc SSD/Module và tùy chọn hiển thị cả đầu việc đã đóng.
- Tạo đầu việc mới chỉ khi công việc thực sự mới; báo cáo ngày mới phải thêm vào đầu việc hiện có.
- Phân loại chuẩn có 5 cấp phụ thuộc nhau: `소속부서 → 업무구분 → 업무유형 → 중분류 → 소분류`.
- Bốn cấp đầu là bắt buộc; cấp cuối bắt buộc khi đường phân loại chuẩn có giá trị.
- Tiêu đề đầu việc được tạo từ phân loại và thông tin sản phẩm/Part Number theo quy tắc trong mã.
- Khi nhập Part Number, hệ thống đối chiếu dữ liệu chuẩn `SSD_PRODUCT` hoặc `DM_PRODUCT` và hiển thị kết quả gợi ý.
- Trang chi tiết đầu việc cho phép:
  - Thêm cập nhật theo ngày.
  - Nhập các trường động theo cấu hình.
  - Xem toàn bộ lịch sử cập nhật.
  - Đóng hoặc mở lại đầu việc.
  - Quản trị viên có thể xóa một lần cập nhật hoặc toàn bộ đầu việc; thao tác xóa là không thể khôi phục.
- Người phụ trách gắn với tên tài khoản đăng nhập, không được dịch.

#### C. LOT Tracker web — `/lot-tracker`

- Chọn nhiều tệp See LOT `.csv`, `.xls`, `.xlsx`; có thể thêm tệp RUNID đầu vào và tệp bản đồ split/merge PCB.
- Giới hạn web: tối đa 50 tệp, 2 MB/tệp, tổng 12 MB, tối đa 10.000 dòng/tệp.
- Tên tệp thường dùng làm LOTID. Tên UUID chỉ được khôi phục LOTID bằng bằng chứng `ASSYLOT` hoặc lịch sử Split tương hỗ; không suy đoán theo mẫu số.
- Loại bỏ vòng công đoạn bị Cancel.
- Tính công đoạn, thiết bị, TrackIn/TrackOut, scrap, fail code, yield, split/merge, lot cần theo dõi và trạng thái mới nhất.
- Có hai dạng báo cáo:
  - Bảng cố định `LOT Follow-up`.
  - Báo cáo theo step với lựa chọn route/công đoạn.
- Có thể sao chép văn bản, tải Excel và lưu kết quả phân tích vào dữ liệu LOT nội bộ.
- Nếu thiếu lịch sử của split LOT, phải hiện danh sách LOT cần bổ sung, không tự suy đoán kết quả.
- Ô truy vấn SWP trực tiếp đang ở trạng thái **chờ kết nối**; phần đang dùng là phân tích tệp đã chọn.

#### D. Cài đặt báo cáo hằng ngày — `/daily-fields` — chỉ admin

- Quản lý trường `text`, `textarea`, `select`; đổi thứ tự; sửa nhãn ba ngôn ngữ.
- Quản lý lựa chọn dropdown, gồm dropdown cha/con.
- Có nhập/xuất cấu hình bằng CSV và thêm nhiều lựa chọn từ CSV/văn bản.
- Có thể áp dụng bộ phân loại chuẩn 70 dòng.
- Không xóa trường đã có dữ liệu lịch sử; chỉ đổi tên hoặc giữ lại.
- Các trường đã nghỉ và `LOTID` có quy tắc bảo vệ riêng; không thêm lại tùy tiện.
- Mã trạng thái chuẩn được lưu bằng mã trung lập và chỉ dịch khi hiển thị.

### 6.2 Quản lý đánh giá — `Quản lý công việc đánh giá`

Đường dẫn chính: `/tasks`. Giao diện Q-EVAL chạy trong iframe cùng nguồn, dùng chung phiên đăng nhập của hệ thống.

#### A. Tổng quan — `Tổng quan`

- Tổng hợp tiến độ theo loại đánh giá và trạng thái.
- Hiển thị chuỗi đánh giá sản phẩm mới và các đánh giá khác.
- Có tìm kiếm theo số đánh giá, thẻ trạng thái, thống kê và danh sách LOT đang chạy.
- Chọn một mục để mở chi tiết và timeline công đoạn.

#### B. Danh sách đánh giá — `Danh sách đánh giá`

- Quản lý DOE, PFQ, PRQ, FQ, 1K, 2K, 5K, 10K, PGM, EQP, Expansion và loại nhập tự do.
- Bộ lọc theo từ khóa, khoảng ngày, loại đánh giá, trạng thái và các trường liên quan; có phân trang và chọn số dòng/trang.
- Người có quyền sửa có thể:
  - Nhập thủ công.
  - Nhập file Excel.
  - Tạo LOT báo cáo khối lượng lớn.
  - Sửa hoặc xóa bản ghi.
  - Xuất báo cáo CSV.
- Nhập thủ công hỗ trợ thêm/chèn/xóa công đoạn, thời gian, số lượng, fail code, yield, lý do chờ, split LOT, RDT/TC/Humidity và thông tin giao hàng.
- Nhập Excel đọc workbook đánh giá và nhiều dữ liệu SEE LOT/paste update theo logic trong `evaluation/app/lib/excel-import.ts`.

#### C. Đánh giá sản phẩm mới — `Đánh giá sản phẩm mới`

- Theo dõi theo số đánh giá qua chuỗi `DOE → PFQ → PRQ → FQ → 1K → 2K → 10K`.
- Hiển thị bảng tiến độ, trạng thái hiện tại, công đoạn, lý do, tỷ lệ trạng thái và tỷ lệ phê duyệt.
- Phần chi tiết tách nhóm sản phẩm mới và các loại đánh giá khác.

#### D. Báo cáo 1K · 2K · 5K · 10K

- Tạo, lưu, sửa và xóa báo cáo theo LOT.
- Dán lịch sử LOT, gom dữ liệu theo công đoạn và tính chỉ số.
- Có bộ lọc, phân trang, trình sửa chi tiết, xem dạng sheet và xuất Excel.

#### E. Lịch sử cập nhật

- Hiển thị log của thao tác tạo, cập nhật, xóa, nhập Excel và cập nhật timeline.
- Dữ liệu đến từ `qeval_evaluation_logs`; không xóa log để làm sạch giao diện.

#### F. Báo cáo & Thống kê

- Tổng hợp theo loại đánh giá, trạng thái và kết quả.
- Có chức năng xuất báo cáo.

#### G. Quyền đánh giá — chỉ admin

- Liệt kê tài khoản hệ thống và quyền Q-EVAL.
- Gán `viewer` hoặc `editor`, phê duyệt/chờ/từ chối.
- Không dùng màn hình này để tạo hoặc hạ quyền quản trị viên hệ thống.

#### H. Danh sách công việc cũ — `/tasks/legacy`

- Giữ chức năng công việc tổng quát cũ: tạo công việc, ưu tiên, người phụ trách, hạn, trạng thái và cập nhật tiến độ.
- Trạng thái lưu bằng giá trị gốc tiếng Hàn: `검토중`, `조치중`, `완료`, `보류`.
- Ưu tiên lưu bằng `상`, `중`, `하`.
- Không đổi các giá trị DB này thành bản dịch vì CHECK constraint và CSS đang phụ thuộc vào chúng.

### 6.3 Báo cáo trạng thái phân tích toàn bộ — `/full-analysis-reports`

- Hiện tại chỉ là màn hình thông báo đã chuẩn bị menu.
- Chưa có chức năng nghiệp vụ chi tiết.
- Không mô tả menu này như tính năng đã hoàn thành.

### 6.4 Trạng thái quản lý dữ liệu chuẩn — `/master`

- Trang đầu hiển thị các bộ dữ liệu chuẩn đang hoạt động và số lượng bản ghi.
- Mỗi bộ có trang danh sách với:
  - Tìm kiếm toàn văn trong `data_json`.
  - Bộ lọc trạng thái xác minh.
  - Sắp xếp theo cột.
  - Phân trang.
- Chọn hàng để xem toàn bộ trường, trạng thái xác minh và ghi chú.
- Phần lịch sử thay đổi ở trang chi tiết hiện chỉ là thông báo chuẩn bị; chưa có truy vấn lịch sử hoàn chỉnh.
- Quản trị viên có `Quản lý loại`:
  - Tạo/sửa bộ dữ liệu với tên Hàn/Anh/Việt và chu kỳ kiểm tra.
  - Tạo/sửa/xóa/đổi thứ tự cột.
  - Kiểu cột: text, number, select, Y/N, date.
  - Thuộc tính: bắt buộc, khóa duy nhất, hiển thị trong danh sách.
  - Khi bộ đã có dữ liệu, mã cột và khóa duy nhất bị khóa ở cả giao diện và server.
- Màn hình web hiện chủ yếu đọc hàng dữ liệu chuẩn; không tự thêm chức năng sửa hàng nếu chưa có yêu cầu nghiệp vụ rõ ràng.

### 6.5 Quản lý người dùng — `/admin/users` — chỉ admin

- Hiển thị tổng số tài khoản và số chờ duyệt.
- Phê duyệt tài khoản, chuyển thành quản trị viên, hạ xuống người dùng thường, chặn truy cập.
- Sửa tên và email đăng nhập của tài khoản thường.
- Cấp mật khẩu tạm thời; giá trị chỉ hiển thị một lần.
- Xóa tài khoản thường sau bước xác nhận; giữ nguyên lịch sử nghiệp vụ.
- Không cho sửa/xóa mật khẩu quản trị viên từ luồng dành cho tài khoản thường.

## 7. Đa ngôn ngữ và quy tắc hiển thị

- Ngôn ngữ chính: Hàn, Anh, Việt.
- Chuỗi giao diện cố định nằm trong `I18N` của `worker.js` và `evaluation/app/i18n.ts`.
- Nhãn trường động có `label`, `label_en`, `label_vi`; nếu thiếu bản dịch thì hiển thị nguyên bản.
- Văn bản tự do có thể lưu ba phiên bản và dùng `tech_translation_cache`; khi không có bộ dịch thì phải tiếp tục hiển thị nguyên văn, không được làm trang lỗi.
- Không dịch LOTID, Part Number, Lot Number, số lượng, mã trạng thái nội bộ và mã phân loại kỹ thuật.
- Người phụ trách phải giữ đúng tên tài khoản/nhân sự gốc.
- Ngày nghiệp vụ của báo cáo hằng ngày dùng múi giờ `Asia/Bangkok`.

## 8. Quy tắc LOT không được phá vỡ

1. Không suy đoán LOTID từ mẫu số của tên UUID.
2. Chỉ phục hồi quan hệ từ bằng chứng thực tế trong ASSYLOT, Split/Merge hoặc tệp tương hỗ.
3. Loại bỏ vòng Cancel trước khi tổng hợp công đoạn.
4. Giữ phân biệt merge đi vào và merge đi ra; dấu `+`/`-` chỉ dùng khi thay đổi số lượng chứng minh được hướng.
5. Không tạo dữ liệu công đoạn cho LOT chưa xác nhận.
6. `LOT INFO` không còn menu riêng nhưng bảng lưu trữ và API tra cứu vẫn được dùng; không xóa.
7. Báo cáo bước và báo cáo cố định phải dùng cùng dữ liệu phân tích, nhưng có định dạng khác nhau.
8. Công cụ HTML độc lập phải tiếp tục hoạt động với một tệp HTML, không quay lại nhánh Python hoặc Windows native.

## 9. Cách làm việc cục bộ

Yêu cầu môi trường: Node.js 22 trở lên và pnpm đúng phiên bản trong `package.json`. Dùng bộ phụ thuộc đã được chuẩn bị trong môi trường nội bộ.

Các lệnh cơ bản:

```sh
pnpm check
pnpm test
pnpm preview
```

Bản xem trước mặc định:

```text
http://127.0.0.1:8788/daily-reports
```

`preview.mjs` tự tạo DB trong bộ nhớ, dữ liệu mẫu và phiên quản trị giả lập. Không dùng dữ liệu nghiệp vụ thật trong kiểm thử tự động.

Khi sửa Q-EVAL:

```sh
pnpm build:evaluation
pnpm test:evaluation
pnpm check
pnpm test
```

Khi sửa LOT Tracker HTML:

```sh
node lot-tracker/build.mjs
node lot-tracker/test/build.mjs
node lot-tracker/report/engine/test-runid-port.mjs
node lot-tracker/trace/test/test-regression.cjs
node lot-tracker/test/browser.mjs
node lot-tracker/test/template-browser.mjs
```

Nếu môi trường không có trình duyệt kiểm thử, ghi rõ bài kiểm thử nào chưa chạy; không được ghi là đã đạt.

## 10. Quy trình cho mỗi thay đổi

1. Đọc `AGENTS.md` gần nhất với tệp cần sửa.
2. Tìm vùng liên quan bằng `rg`; với `worker.js`, tìm `// #region` và đọc trọn hàm trước khi sửa.
3. Xác định quyền người dùng, route, bảng DB và ngôn ngữ bị ảnh hưởng.
4. Giữ thay đổi nhỏ, không refactor toàn bộ `worker.js` nếu không cần thiết.
5. Nếu sửa lỗi có thể tái hiện, thêm kiểm thử hồi quy bằng dữ liệu tổng hợp.
6. Nếu sửa `evaluation/app`, build lại `evaluation/generated`.
7. Nếu sửa hành vi sản phẩm, cập nhật phiên bản thích hợp và `DEVELOPMENT-STATUS.md`.
8. Chạy kiểm tra cú pháp, kiểm thử chính và kiểm thử phân hệ liên quan.
9. Kiểm tra giao diện cục bộ ở ngôn ngữ Hàn/Anh/Việt, màn hình rộng và hẹp khi thay đổi UI.
10. Bàn giao kết quả theo mẫu:

```text
Nội dung đã thay đổi:
- ...

Tệp đã thay đổi:
- ...

Ảnh hưởng DB:
- Không / Có, mô tả chính xác ...

Kiểm thử đã chạy:
- Lệnh ...: PASS/FAIL, số lượng kiểm thử ...

Chưa kiểm thử hoặc giới hạn:
- ...

Bước tiếp theo:
- ...
```

## 11. Các thao tác bị cấm hoặc cần xác nhận riêng

- Không xóa, reset hoặc khởi tạo lại DB nghiệp vụ.
- Không chạy lại migration lịch sử như một cách sửa đồng bộ.
- Không đưa bí mật, token, bản sao DB, tệp nghiệp vụ thật hoặc ZIP kiểm chứng thật vào mã nguồn.
- Không thay đổi ràng buộc IP, quyền quản trị, quy tắc tài khoản hoặc hành vi xóa dữ liệu nếu không có yêu cầu rõ ràng.
- Không đổi mã trạng thái nội bộ chỉ để dịch giao diện.
- Không dịch LOTID, Part Number hoặc Lot Number.
- Không tuyên bố đã kiểm chứng dữ liệu thực tế khi chỉ dùng dữ liệu tổng hợp.
- Không phát triển tiếp trong `desktop/` như sản phẩm chính.
- Không kích hoạt tích hợp SWP trực tiếp, cấu hình gửi email hoặc thay đổi quy trình dữ liệu chưa được phê duyệt.

## 12. Việc còn lại đã biết

- Kiểm chứng LOT Tracker HTML 1.2.9 bằng tệp MES/PMS thực tế trong mạng nghiệp vụ: đối chiếu 82 cột, giá trị, quan hệ split/merge và RUNID.
- Xác nhận các quy tắc LOTID chưa chốt: danh sách giá trị cấm của split, thứ tự tăng và ranh giới cuối năm.
- Xác nhận dữ liệu gốc và quy tắc của quản lý người đi công tác.
- Xác nhận thêm các ứng viên quy tắc SMT RUNID và các trường hợp split/merge mơ hồ.
- Kiểm tra tải lớn trong môi trường nội bộ.
- Quyết định phạm vi thật sự của menu báo cáo phân tích toàn bộ.
- Hoàn thiện truy vấn lịch sử của dữ liệu chuẩn khi có yêu cầu.

## 13. Yêu cầu bắt đầu công việc

Khi nhận một yêu cầu mới, trước tiên hãy trả lời bằng tiếng Việt với bốn mục ngắn:

1. Bạn hiểu yêu cầu gì.
2. Route/màn hình và tệp dự kiến liên quan.
3. Bảng dữ liệu và quyền người dùng có thể bị ảnh hưởng.
4. Kế hoạch kiểm thử cục bộ.

Sau đó mới sửa mã. Nếu yêu cầu mâu thuẫn với quy tắc dữ liệu hoặc có thể làm mất dữ liệu, hãy dừng và nêu đúng điểm cần xác nhận.

## 14. Kết quả kiểm tra gói bàn giao

Các kiểm tra sau đã được chạy trực tiếp trên mã nguồn trước khi đóng gói:

- Kiểm tra cú pháp `worker.js`: đạt.
- Bộ kiểm thử web chính: **371 đạt, 0 lỗi**.
- Bộ kiểm thử Q-EVAL bằng dữ liệu tổng hợp cục bộ: **43 đạt, 0 lỗi**.
- Kiểm tra khả năng build lại một tệp LOT Tracker HTML: đạt.
- Kiểm thử engine báo cáo/RUNID: đạt toàn bộ.
- Kiểm thử hồi quy truy vết LOT: **28/28 đạt**.
- Kiểm tra cấu trúc ZIP: không có lỗi nén.

Kiểm thử trình duyệt của LOT Tracker HTML chưa được chạy trong lần đóng gói này. Không coi đây là bằng chứng kiểm chứng tệp MES/PMS thực tế; các giới hạn thực tế vẫn giữ nguyên như mục 12.
