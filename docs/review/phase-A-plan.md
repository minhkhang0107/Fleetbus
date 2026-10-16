# Kế hoạch Giai đoạn A: Server/API

Ngày: 2026-10-06
Tham chiếu: `docs/review/design.md` (D1 đến D6)
Phạm vi: `source/server/` và các test của nó. Không sửa Flutter (thuộc giai đoạn B).

## 1. Mốc ban đầu (đã đo)

- `npm test`: 112/112 pass, 15 suite.
- `npm run lint`: sạch.
- Server: khoảng 5.000 dòng JS. Gồm 3 file route (passenger 279, driver 286, manager 236 dòng), `webhookRoutes`, `apiServer.js`, event bridge, và các service passenger, driver, manager.
- Spec đối chiếu chính: `screen-spec/_governance/api-screen-map.md` (30 màn PAX, 19 DRI, 30 MGR), `open-questions.md` (OQ-001 đến OQ-016), `traceability-matrix.md`, các file `PAX-*`, `DRI-*`, `MGR-*`, và REV-01 đến REV-07.

## 2. Giả thuyết cần kiểm chứng (chưa phải kết luận)

Đây là những điểm tôi thấy khi lướt qua. Mỗi điểm phải được xác minh bằng đọc code trước khi thành phát hiện `FND-xx`.

1. **Lệch đường dẫn giữa spec và code.** Spec dùng dạng `/api/v1/trips/{id}/seat-map`, `/api/v1/bookings/create`, `/api/v1/driver/trips/{id}/start`. Code có cả dạng `/api/v1/passenger/trips/:id/seat-map` và dạng gốc. Cần quyết định đường dẫn chuẩn, vì đây sẽ ảnh hưởng tới cả 3 app Flutter.
2. **Endpoint có trong spec nhưng chưa thấy trong code**, ví dụ: `payments/initiate`, `payments/{id}/status`, `trips/{id}/eta`, `replacement-info`, `disruptions`, `ops/payments`, `ops/alerts`, `ops/notifications/broadcast`, `ops/rbac/roles`, `ops/settings`, `ops/seat-layouts`, `routes/{id}/geometry`, `driver/trips/{id}/stops/{stopId}/arrive`. Có thể đã làm dưới tên khác. Phải kiểm chứng.
3. **Endpoint có trong code nhưng không có trong spec**, ví dụ: `ops/crew`, `ops/radar`, `ops/dispatch/board`, `ops/reports/executive`. Cần quyết định bổ sung vào spec hoặc bỏ.
4. **Telemetry**: OQ-002 nói MQTT là kênh chính và REST chỉ dùng replay. Code hiện có REST `telemetry`. Cần xem spec thực tế có khả thi với kiến trúc không.
5. **Quy tắc nghiệp vụ**: TTL giữ ghế 600s (OQ-001), COD thành `CONFIRMED_UNPAID` rồi `PAID` (OQ-003), mask số điện thoại cho tài xế (OQ-007), webhook trễ thành `UNMATCHED_OVERDUE` (OQ-008), cửa sổ QR ±2 (OQ-012), stale GPS 60s (OQ-016).
6. **Idempotency-Key**: spec yêu cầu ở nhiều endpoint POST. Chưa biết code có xử lý không.
7. **Auth và RBAC**: cần kiểm tra mỗi endpoint có kiểm tra vai trò đúng như cột Auth trong spec.

## 3. Các bước thực hiện

Mỗi bước có đầu ra và tiêu chí kiểm tra. Các bước tuần tự, trừ khi ghi chú khác.

### A1. Kiểm kê endpoint (đọc, không sửa)
- Liệt kê toàn bộ route thật từ `passengerRoutes.js`, `driverRoutes.js`, `managerRoutes.js`, `webhookRoutes.js`, `apiServer.js`.
- Lập bảng đối chiếu hai chiều: spec có mà code không, code có mà spec không, và hai bên khớp nhưng khác đường dẫn, method hoặc auth.
- **Đầu ra**: bảng kiểm kê trong `docs/review/phase-A-findings.md`.
- **Kiểm tra**: mọi dòng trong `api-screen-map.md` được gán một trạng thái.

### A2. Review quy tắc nghiệp vụ theo spec màn hình
- Đọc từng file `PAX-*`, `DRI-*`, `MGR-*` có logic server: trạng thái, quy tắc, mã lỗi, validation.
- Đối chiếu với service tương ứng (`auth`, `search`, `seatMap`, `checkout`, `payment`, `tracking`, `driverService`, `managerService`, `cryptoEngine`).
- Ưu tiên theo mức cao: tiền, vé, ghế, QR, bảo mật (mục 2, điểm 5 đến 7).
- **Đầu ra**: các `FND-xx` có phân loại (spec sai, code sai, cả hai, không có bằng chứng) và mức độ.

### A3. Review REV-01 đến REV-07 và OQ-009 đến OQ-016
- Với từng REV, kiểm tra hàm trong `SPEC_CHANGES_IMPLEMENTATION_PLAN.md` có tồn tại, chạy đúng spec và có test.
- Với từng OQ, kiểm tra quyết định đã phản ánh vào code.

### A4. Review chéo bằng góc nhìn người dùng
- Đi qua các tình huống thực tế qua API: đặt vé và trả tiền trễ, quét QR lần hai, tài xế mất mạng rồi replay, quản lý đổi xe giữa chuyến, hủy vé ở từng bậc phí.
- **Đầu ra**: bổ sung `FND-xx` về bước thiếu và trạng thái không định nghĩa.

### A5. Chốt phát hiện và quyết định spec (điểm dừng 1)
- Gom `FND-xx`, ghi quyết định vào `docs/review/decision-log.md`, đặc biệt là quyết định đường dẫn chuẩn (giả thuyết 1).
- Theo D5, tôi tự quyết, và trình bạn bản tóm tắt ngắn để biết trước khi sửa. Bạn có thể đảo quyết định ngay ở bước này.

### A6. Sửa spec
- Cập nhật `api-screen-map.md`, file màn hình liên quan, `open-questions.md`, FLOW nếu bị ảnh hưởng.
- **Kiểm tra**: không còn mâu thuẫn nội bộ trong phạm vi giai đoạn.

### A7. Sửa code theo TDD
- Với mỗi phát hiện mức cao và trung bình: viết test fail, xác nhận fail đúng lý do, sửa code, xác nhận pass.
- Thay đổi hợp đồng API phải sửa cùng lúc server, `openapi.json`, test hiện có, và ghi chú rõ các client service Flutter cần chỉnh ở giai đoạn B.
- Sau mỗi nhóm sửa: chạy `npm test` và `npm run lint`.

### A8. Đóng giai đoạn
- Cập nhật `traceability-matrix.md` (yêu cầu, code, test) cho phạm vi server.
- Cập nhật `STATE.md`: số test, trạng thái.
- Chạy `npm run e2e` để kiểm tra luồng tripartite.
- Commit chức năng và commit mức thấp riêng. Chỉ commit khi bạn yêu cầu.
- Trình bạn tóm tắt kết quả và Decision Log của giai đoạn (điểm dừng 2).

## 4. Tiêu chí hoàn thành Giai đoạn A

- Mọi dòng trong `api-screen-map.md` có trạng thái rõ: đã khớp, đã sửa, hoặc hoãn kèm lý do.
- Mọi phát hiện mức cao và trung bình đã xử lý.
- `npm test`, `npm run lint` và `npm run e2e` đều xanh.
- Ma trận truy vết cho phạm vi server đầy đủ.
- Decision Log cập nhật.

## 5. Rủi ro riêng của giai đoạn A

- **Đổi đường dẫn chuẩn** có thể làm hỏng cả 3 app Flutter. Cách giảm rủi ro: giữ alias cho đường dẫn cũ nếu cần, và ghi vào danh sách việc của giai đoạn B.
- **Endpoint spec có nhưng code chưa có** có thể rất nhiều (giả thuyết 2). Với mỗi mục, tôi chọn một trong hai: triển khai ở mức tối thiểu đủ test, hoặc rút khỏi spec nếu không thực sự cần (YAGNI). Quyết định ghi vào log.
- **Khối lượng**: có thể cần chia A2 và A3 thành nhiều lượt.

## 6. Ngoài phạm vi

- Mã Flutter, dựng build, hạ tầng deploy.
- Thêm tính năng ngoài spec.
- Audit bảo mật đầy đủ (chỉ báo lỗ hổng rõ ràng gặp trên đường đi).
