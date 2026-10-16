# Giai đoạn D: Rà soát tổng thể

Ngày: 2026-10-07
Phương pháp: kiểm bằng script toàn bộ `screen-spec/` (79 màn hình, 5 file quản trị, 7 flow) và đối chiếu với server (`apiCatalog.js`) và test. Kết quả: `npm test` **198/198**, `npm run lint` 56 file, `npm run e2e` thành công.

## 1. Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Danh mục có đủ file màn hình, không file thừa | 79 trên 79, không thừa. `DRI-012-cod-collection.md` là liên kết mềm tới `DRI-012-cod.md` (một file thật), không phải bản trùng |
| Route trong danh mục và trong file màn hình | Khớp, trừ `PAX-024` (`:id` so với `:incidentId`): đã sửa danh mục |
| Liên kết tương đối trong `screen-spec/` | 0 hỏng |
| Endpoint của `api-screen-map` so với server | Mọi endpoint chưa phục vụ đều nằm trong danh sách hoãn hoặc gộp ở mục 5; `gps-health` của `DRI-014` còn thiếu trong bản đồ: đã thêm |
| Quy tắc (`BR-*`) của ma trận truy vết có trong file màn hình, và test spec (`TC-*`) được nêu có tồn tại | 83 quy tắc và mọi `TC` đều tồn tại, không mồ côi |
| Màn hình có hàng trong ma trận truy vết | Trước: 48 trên 79. Nay: đủ 79 (mục 5) |
| Màn hình có trong bản đồ điều hướng | Trước: 57 trên 79. Nay: đủ 79 (mục 6) |
| Quy tắc viết trong màn hình nhưng không hàng nào dẫn tới | 63 quy tắc: đã liệt kê ở mục 6 của ma trận kèm dấu hiệu có test nào nêu tên hay không |
| `OQ` còn mở | 4, đều không chặn trừ `OQ-029` (màn hình Flutter chưa nối API) |

## 2. Phát hiện

| ID | Phát hiện | Mức | Trạng thái |
|---|---|---|---|
| FND-D01 | 31 màn hình không có hàng ở ma trận truy vết, 22 không có trong bản đồ điều hướng; không ai biết màn hình nào chưa có bằng chứng | Trung bình | Đã bổ sung; cột "Automated tests" nói rõ "none: spec only", không khẳng định đã chạy |
| FND-D02 | 63 quy tắc trong màn hình không hàng nào dẫn tới; 5 mã yêu cầu được trích dẫn nhưng không có nội dung | Thấp | Đã liệt kê; năm mã mồ côi được ghi là nhãn nguồn, không phải quy tắc phải làm |
| FND-D03 | Dữ liệu mẫu của chuyến `trp_991823`: điều hành ghi `IN_TRANSIT` còn xe `29B-123.45` đang chạy, trong khi tài xế chưa bắt đầu | Trung bình | Đã sửa: chuyến `DISPATCHED`, xe `ASSIGNED`, chuyển `IN_TRANSIT` khi tài xế bắt đầu (`TRIP_STARTED`). Hai test cũ đổi kỳ vọng: `TC-MGR-02` (xe đang chạy 2 thành 1), `TC-MGR-04` (chuyến `DISPATCHED`) |
| FND-D04 | `README.md` và `walkthrough.md` gốc có liên kết `file:///home/david/Downloads/...` hỏng | Thấp | Đã đổi sang đường dẫn tương đối, đã kiểm mọi đích tồn tại |
| FND-D05 | `DRI-014` có endpoint thật `gps-health` nhưng bản đồ ghi "không có"; dữ liệu của endpoint phần lớn là giả lập | Thấp | Đã ghi vào bản đồ kèm chú thích giả lập |

## 3. Việc không làm

- `cross-screen-state-map`, `analytics-screen-map`, `component-catalog`, `accessibility`: các file này chủ ý chỉ nêu màn hình chính hoặc quy tắc chung, nên thiếu nhiều màn hình không phải lỗi. Không bịa nội dung cho 40 đến 77 màn hình còn lại.
- Cột Status của danh mục vẫn là `Draft` cho cả 79 màn hình: chủ dự án chưa duyệt, tôi không đổi.
- Số ghế mẫu của `trp_991823` (28 trên 34) không khớp sơ đồ 22 ghế; sơ đồ ghế là nguồn thật, số đếm là dữ liệu mẫu. Chưa sửa vì các test dùng số tương đối.

## 4. Tổng kết cả bốn giai đoạn

| Giai đoạn | Phát hiện | Test sau giai đoạn |
|---|---|---|
| A (server) | 53 | 165 |
| B (client Flutter) | 12 | 182 |
| C (luồng xuyên app) | 13 | 198 |
| D (tổng thể) | 5 | 198 |

**Còn mở và chặn việc giao sản phẩm:** `OQ-029`: không màn hình Flutter nào gọi API, 32 màn hình spec chưa có, mã Dart mới chưa biên dịch. Cần Flutter SDK. Tiếp theo: `OQ-027` (TOTP 2FA), `OQ-028` (nhả ghế theo chặng), `OQ-030` (trạm dừng), WebSocket và MQTT (`OQ-002`).
