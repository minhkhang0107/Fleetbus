# Thiết kế: Review spec và đồng bộ code theo spec (FleetBus)

Ngày: 2026-10-06
Trạng thái: Đã xác nhận (Understanding Lock và 4 phần thiết kế)

## 1. Understanding Summary

- **Xây gì**: một đợt review và sửa lỗi để FleetBus (server Node + 3 app Flutter) khớp với `screen-spec/`, sau khi spec đã được rà soát và chỉnh cho hợp lý. Không làm tính năng mới.
- **Vì sao**: `STATE.md` báo hoàn thành và 112 test pass, nhưng chưa có bằng chứng code bám spec. Kế hoạch REV-01 đến REV-07 cũng chưa rõ đã vào code chưa.
- **Cho ai**: chủ dự án. Sản phẩm cuối phục vụ hành khách, tài xế và quản lý.
- **Vai trò của Claude**: đóng vai BA kiêm người dùng cuối. Tìm lỗ hổng, mâu thuẫn, bước thiếu và luồng khó dùng trong spec, sửa spec trực tiếp, rồi sửa code theo spec đã cập nhật.
- **Tiêu chí xong**: mỗi yêu cầu trong spec mới có ít nhất một test pass. `traceability-matrix.md` trỏ tới code và test.
- **Non-goals**: không thêm tính năng ngoài spec, không chạy hay kiểm thử UI Flutter trên thiết bị, không sửa hạ tầng build hay deploy, không đổi phạm vi sản phẩm.

## 2. Assumptions

1. **Hiệu năng**: giữ nguyên mức hiện tại. Chỉ coi là lỗi nếu spec nêu ngưỡng cụ thể (ví dụ QR quét 200ms, telemetry 1Hz).
2. **Quy mô**: dữ liệu mock trong bộ nhớ, một server cục bộ. Không tối ưu cho tải lớn.
3. **Bảo mật**: các điểm spec yêu cầu (HMAC QR, TOTP ±2 window, PIN 6 số, che số điện thoại, RBAC, webhook VietQR) phải đúng. Lỗ hổng rõ ràng gặp trên đường đi sẽ được báo, nhưng không làm audit bảo mật đầy đủ.
4. **Độ tin cậy**: không làm hỏng test hiện có. Sau mỗi lần sửa, `npm test` và `npm run lint` phải xanh.
5. **Bảo trì**: commit nhỏ theo từng giai đoạn, theo conventional commit, có cập nhật `STATE.md`. Chỉ commit khi chủ dự án yêu cầu.
6. **Flutter**: chỉ đối chiếu code với spec bằng đọc. Nếu SDK Flutter có sẵn, `flutter analyze` chỉ là tham khảo.
7. **OQ chưa chốt**: Claude quyết định với vai trò BA và ghi lý do vào `open-questions.md`.

## 3. Decision Log

| # | Quyết định | Phương án đã cân nhắc | Lý do |
|---|---|---|---|
| D1 | Thứ tự A (Server/API), B (theo app), C (theo flow), D (toàn bộ) | Chỉ chọn một phạm vi | Chủ dự án yêu cầu. Đi từ server ra ngoài giúp nền móng ổn trước |
| D2 | Mỗi giai đoạn gồm review, sửa, rồi commit riêng | Chỉ báo cáo, hoặc tự sửa hết | Dễ kiểm soát và dễ rollback |
| D3 | Truy vết đầy đủ trong `traceability-matrix.md` | Chỉ có test | Thấy được phần chưa cover |
| D4 | Spec được sửa, Claude đóng vai BA kiêm user | Spec là chuẩn bất biến | Chủ dự án yêu cầu |
| D5 | Tự quyết mọi thay đổi spec, kể cả tiền và bảo mật, có ghi log | Hỏi trước với tiền và bảo mật; chỉ sửa lỗi hình thức | Chủ dự án chọn. Duyệt lại qua Decision Log cuối mỗi giai đoạn |
| D6 | Phương án 1: spec trước, code sau theo từng giai đoạn | Rà soát toàn bộ spec rồi mới sửa code; chỉ vá chỗ lệch rõ ràng | Giữ spec và code đồng bộ liên tục. Giai đoạn D gom việc rà soát tổng thể |

## 4. Thiết kế

### 4.1 Chu trình mỗi giai đoạn

1. **Khảo sát**: đọc spec và code trong phạm vi, chạy `npm test` và `npm run lint` lấy mốc.
2. **Review hai góc nhìn**: BA (mâu thuẫn, bước thiếu, trạng thái hoặc mã lỗi không định nghĩa, OQ treo) và người dùng (chỗ khó dùng, thiếu phản hồi).
3. **Lập danh sách phát hiện** (`FND-xx`) với phân loại và mức độ.
4. **Sửa spec**: file màn hình, `api-screen-map`, FLOW, `open-questions`, kèm Decision Log.
5. **Sửa code bằng TDD**: test fail trước, sau đó sửa cho pass.
6. **Xác minh**: test và lint xanh, ma trận truy vết đầy đủ.
7. **Đóng giai đoạn**: cập nhật `STATE.md`, commit riêng.

Sản phẩm lưu trong `docs/review/`: `phase-A-findings.md` đến `phase-D-findings.md`, và `decision-log.md`. Cuối mỗi giai đoạn có điểm dừng để chủ dự án xem tóm tắt và đảo quyết định nếu không đồng ý.

### 4.2 Phạm vi giai đoạn và phân loại

| GĐ | Phạm vi | Đối chiếu chính | Kết quả mong đợi |
|---|---|---|---|
| A | Server/API (`source/server/`) | `api-screen-map.md`, REV-01 đến 07, quy tắc nghiệp vụ trong từng màn hình | Endpoint, schema, trạng thái, mã lỗi và quy tắc tiền/vé/QR đúng spec |
| B | 3 app Flutter: Passenger, Driver, Manager | `PAX-*`, `DRI-*`, `MGR-*`, `design-system.md`, `component-catalog.md` | Mỗi màn hình đủ trường, trạng thái, text, điều hướng. Service client gọi đúng API |
| C | Flow xuyên app | FLOW-01 đến 07, `cross-app-interaction-flows.md` | Event bridge và chuỗi gọi giữa các app khớp từng bước flow |
| D | Rà soát tổng thể | `traceability-matrix`, `navigation-map`, `cross-screen-state-map`, `open-questions` | Spec nhất quán toàn cục. Không còn OQ treo, không còn yêu cầu mồ côi |

**Phân loại phát hiện**: spec sai (sửa spec rồi code), code sai (sửa code và thêm test), cả hai (spec trước rồi code), không có bằng chứng (ghi nhận, không đoán).

**Mức độ**: cao (sai tiền, vé, ghế, QR, bảo mật, hoặc phá vỡ flow chính), trung bình (thiếu trạng thái, thiếu mã lỗi, sai điều hướng), thấp (text, tên trường, chính tả, định dạng). Mức cao và trung bình được sửa hết. Mức thấp gom vào một commit riêng cuối giai đoạn.

**Chống lan man**: mỗi giai đoạn chỉ sửa trong phạm vi của nó. Phát hiện thuộc giai đoạn sau đưa vào danh sách chờ.

### 4.3 Kiểm thử, xử lý lỗi và trường hợp biên

- 112 test hiện có là lưới an toàn. Không xóa hay nới lỏng test để cho xanh. Nếu spec đổi làm test cũ sai, sửa test đó, ghi lý do vào Decision Log và nêu trong commit.
- TDD cho mọi sửa code. Tên test hoặc comment ngắn ghi mã yêu cầu (ví dụ `PAX-013`, `REV-02`).
- Flutter chỉ đối chiếu bằng đọc. Phần không chạy được phải được nói rõ, không báo là đã xác minh.
- Trước khi sửa một endpoint hoặc trường, tìm mọi nơi dùng nó (3 app và test). Đổi hợp đồng API thì sửa server và client service trong cùng giai đoạn.
- Test đỏ giữa chừng thì tìm nguyên nhân gốc, không vá tạm.
- Thay đổi spec làm đổi bản chất tính năng được đánh dấu mức cao trong Decision Log.
- Trường hợp biên cần cảnh giác: làm tròn VND, thối tiền, hoàn vé theo bậc; hết hạn giữ ghế, cửa sổ QR ±60s, GPS stale 60s; hai người giữ cùng một ghế, quét một vé hai lần; vai trò sai truy cập endpoint của vai trò khác.

### 4.4 Tiêu chí đóng giai đoạn

- `npm test` và `npm run lint` xanh.
- Mọi phát hiện mức cao và trung bình đã xử lý, hoặc có lý do ghi rõ nếu chưa.
- `traceability-matrix.md` và `STATE.md` đã cập nhật.
- Decision Log có đủ các thay đổi spec của giai đoạn.
- Một commit cho phần chức năng, một commit cho phần mức thấp.

## 5. Rủi ro đã ghi nhận

1. Quyền tự sửa spec (D5) rộng, có thể có thay đổi nghiệp vụ chủ dự án không đồng ý. Giảm rủi ro bằng Decision Log và điểm dừng cuối giai đoạn.
2. Giai đoạn B chỉ xác minh bằng đọc code, độ tin cậy thấp hơn giai đoạn A.
3. Khối lượng lớn (khoảng 70 màn hình và 7 flow), có thể cần nhiều lượt làm việc.
4. Working tree có thay đổi chưa commit ở `.agents/` và `.claude/`. Không đụng tới và không đưa vào commit của đợt này.
