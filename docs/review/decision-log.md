# Decision Log: Review spec và đồng bộ code (FleetBus)

Quyền quyết định: D5 (Claude, với vai BA kiêm người dùng, tự quyết và ghi log). Chủ dự án duyệt lại và có thể đảo bất kỳ quyết định nào.
Cột "Duyệt" ghi những quyết định ảnh hưởng nhiều nhất để chủ dự án chú ý.

## Quy trình (D1 đến D6)

| # | Quyết định | Phương án đã cân nhắc | Lý do |
|---|---|---|---|
| D1 | Thứ tự A (Server/API), B (theo app), C (theo flow), D (toàn bộ) | Chỉ chọn một phạm vi | Chủ dự án yêu cầu |
| D2 | Mỗi giai đoạn: review, sửa spec, sửa code bằng TDD, commit riêng | Chỉ báo cáo; tự sửa hết | Dễ kiểm soát và rollback |
| D3 | Truy vết đầy đủ trong `traceability-matrix.md` | Chỉ test | Thấy phần chưa cover |
| D4 | Spec được sửa, Claude đóng vai BA kiêm user | Spec bất biến | Chủ dự án yêu cầu |
| D5 | Tự quyết mọi thay đổi spec, kể cả tiền và bảo mật, có ghi log | Hỏi trước với tiền và bảo mật | Chủ dự án chọn |
| D6 | Phương án 1: spec trước, code sau theo từng giai đoạn | Rà soát toàn bộ spec rồi sửa code; chỉ vá chỗ lệch | Giữ spec và code đồng bộ liên tục |

## Giai đoạn A: quyết định nghiệp vụ

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D7 | Webhook VietQR: kiểm chữ ký HMAC (`X-Signature`) khi có secret, khớp PNR chính xác, số tiền phải bằng đúng tổng đơn. Sai tiền: `AMOUNT_MISMATCH`, không xuất vé, cảnh báo cho quản lý. Tiền đến sau hạn: `UNMATCHED_OVERDUE` kèm yêu cầu hoàn tiền | A14, A17, A22 | Chỉ kiểm số tiền | Chữ ký chặn giả mạo, số tiền chặn thanh toán thiếu. Báo `200` cho đơn quá hạn để ngân hàng không gửi lại | Cao |
| D8 | "Tôi đã chuyển tiền" chỉ yêu cầu đối soát, không bao giờ tự xác nhận | A15 | Giữ tự xác nhận | Giữ nguyên là lỗ hổng xuất vé miễn phí | Cao |
| D9 | Giá do server tính từ giá ghế. Mọi giá client gửi bị bỏ qua | A13 | Cho client gợi ý giá | Giá là dữ liệu tin cậy duy nhất | Cao |
| D10 | Tạo đơn bắt buộc có `hold_id` còn hạn, cùng chủ, đúng bộ ghế. Hold trở thành khóa thanh toán đến khi đơn hết hạn | A16, A17 | Chỉ kiểm hold | Chặn bán trùng ghế khi khách đang thanh toán | Cao |
| D11 | Chữ ký QR kiểm đầu tiên, so sánh constant-time. Vé khớp theo `ticket_id` trong manifest của chuyến. Mọi nhánh lên xe qua một hàm và phát `PASSENGER_BOARDED`. Một khóa dùng chung `FLEETBUS_TICKET_SECRET` | A24, A25, A36, A37 | Chỉ sửa QR đơn | Một đường duy nhất tránh bỏ sót. Phát hiện thêm: hai service từng dùng hai khóa khác nhau nên PIN offline chưa từng chạy được | Cao |
| D12 | Bậc hoàn tiền theo `PAX-021` (>= 12h 100%, 6 đến 12h 80%, < 6h 0%). Giá và giờ lấy từ vé đã lưu. Hủy một chiều, một lần. Trạng thái `REFUND_REQUESTED` -> `REFUNDED` / `REFUND_REJECTED` do quản lý duyệt đúng một lần | A18, A19, A20, A48 | Đổi spec theo code | Spec nhất quán nội bộ, ví dụ AC-001 khớp. Code là bên sai | Cao |
| D13 | Ví vé tra theo số điện thoại đầy đủ, khớp chính xác (chủ vé hoặc người được ủy quyền). Thiếu hoặc không đủ: `400 INVALID_PHONE` | A29 | Giữ tham số tìm theo chuỗi con | Ngăn rò rỉ dữ liệu cá nhân | Cao |
| D14 | Thêm middleware xác thực Bearer và Idempotency-Key | A01, A02 | Sửa từng endpoint | Một chỗ kiểm duy nhất, dễ test | Cao |
| D15 | Triển khai D14 theo hai giai đoạn: server có sẵn cơ chế sau một công tắc, app Flutter được cập nhật ở giai đoạn B, sau đó bật bắt buộc mặc định. Trong thời gian chuyển tiếp, `userId` và `phone` là đầu vào bắt buộc và được khớp chính xác | A01, A02 | Bật bắt buộc ngay | Bật ngay làm hỏng cả 3 app vì client chưa gửi token. Ghi là OQ-022, còn mở | Cao |
| D16 | Khóa bí mật và secret webhook lấy từ biến môi trường (`FLEETBUS_TICKET_SECRET`, `FLEETBUS_WEBHOOK_SECRET`). Production thiếu biến thì không khởi động. Ngoài production dùng giá trị dev | A28 | Hard-code | Không để khóa trong source. Webhook chưa có secret thì chỉ kiểm số tiền (môi trường dev) | Trung bình |
| D17 | Không chọn sẵn bảo hiểm. Voucher sai trả `voucher_error` thay vì im lặng | A21 | Giữ mặc định bật | Bảo hiểm không có trong spec và là khoản tính tiền ngoài ý muốn của khách | Trung bình |
| D18 | PNR sinh dạng `BG-` và 6 chữ số, kiểm không trùng. Trước đây chỉ còn 4 chữ số ngẫu nhiên và dạng `BG-BG1234` | A22 | Giữ định dạng | Va chạm PNR làm webhook xuất vé nhầm đơn | Trung bình |
| D19 | Tầng (deck) của ghế lấy từ layout của chuyến | A23 | Giữ phỏng đoán theo tiền tố mã ghế | Phỏng đoán sai với `B06` đến `B09` | Thấp |
| D20 | Bỏ `mock_otp` khỏi phản hồi khi `NODE_ENV=production`. Phản hồi OTP đưa payload vào `data`, như phần còn lại của API | A33, A35 | Giữ nguyên | Lộ OTP trong production làm vô hiệu hóa xác thực | Cao |

## Giai đoạn A, Lô 1b: vòng đời chuyến, tiền mặt, riêng tư, đội xe

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D21 | Tài xế chỉ thấy `phone_masked`. Số thật ở lại server để gửi thông báo, mọi phản hồi (manifest, danh sách chuyến, quét vé, COD, vé vẫy) đã lọc | A38 | Chỉ che ở route manifest | Phát hiện thêm ba đường khác cũng lộ số thật | Cao |
| D22 | Máy trạng thái chuyến: `DISPATCHED` -> `READY` (đủ phiếu kiểm tra) -> `IN_TRANSIT` -> `COMPLETED`. Bắt đầu cần `READY`. Telemetry, vé vẫy và kết thúc cần `IN_TRANSIT`. Kết thúc đúng một lần | A41 | Cho `DISPATCHED` bắt đầu thẳng | Bỏ qua kiểm tra an toàn là sai theo DRI-004 | Cao |
| D23 | COD: giá do server giữ trên vé, thu một lần, tiền thu phải đủ giá, phương thức thối tiền phải hợp lệ, `FARE_MISMATCH` nếu client gửi giá khác | A39 | Tin giá của client | Giá do tài xế nhập là kẽ hở thất thoát | Cao |
| D24 | Biên lai nợ có mã duy nhất theo vé `DR-<vé>-<K>`, ghi vào sổ nợ của chuyến và liệt kê khi kết thúc. Ví khách có sổ cộng tiền (`creditWallet`) | A39 | Dùng 6 ký tự cuối của mã vé | Mã cũ có thể trùng giữa hai vé | Trung bình |
| D25 | Vé vẫy dùng giá chuyến của server (giá phẳng, chưa tính theo đoạn), bắt buộc có ghế, chuyến phải đang chạy, không gán số điện thoại bịa. Tiền vé vẫy tính riêng khỏi COD | A40 | Cho tài xế nhập giá | Giá theo đoạn nằm ngoài phạm vi (YAGNI) | Cao |
| D26 | Kết thúc chuyến: server tự tính tổng tiền, số khách, no-show, biên lai nợ từ manifest. Tổng client gửi bị bỏ qua. Báo thêm `unresolved_passenger_count` | A41 | Tin tổng của client | DRI-017 muốn đối soát, không phải tự khai | Cao |
| D27 | Đổi xe: xe phải có thật, `STANDBY`, đủ ghế, tài xế mới (nếu có) phải tồn tại. Kiểm tra trước khi đổi bất kỳ trạng thái nào. Xe cũ thành `MAINTENANCE`. Không còn bịa xe | A47 | Chặn cứng hay gợi ý ghế dư | Thiếu ghế chặn bằng `CAPACITY_INSUFFICIENT`, xử lý khách dư vẫn là việc của điều độ (MGR-023 BR-REPLACE-001) | Cao |
| D28 | Event bridge không còn "rơi về chuyến đầu tiên" khi không tìm thấy chuyến. Hủy vé giảm số ghế đã bán của quản lý | A50 | Giữ fallback để demo | Fallback ghi vé và thông báo nhầm chuyến | Cao |
| D29 | Chuyến `trp_hn_th_01` của quản lý được khai báo sẵn, không tạo ngầm khi tra cứu | A52 | Giữ tạo theo yêu cầu | Tra cứu không được sinh dữ liệu | Thấp |
| D30 | Giữ một mặc định tạm thời: `x-driver-id` vẫn mặc định `drv_8821a` ở route cho đến khi D15 bật xác thực | A01, A42 | Bắt buộc ngay | Cùng lý do với D15 | Cao |

## Giai đoạn A, Lô 1c-i: kho ghế dùng chung

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D31 | Một kho ghế duy nhất cho app, quầy POS, hotline và vé vẫy. Bán qua kênh nào cũng phải qua kiểm tra ghế trống. Mọi chuyến bán được đều có sơ đồ ghế, chuyến lạ không bị tạo ngầm | A31, A40, A45 | Mỗi kênh tự đếm | Bộ đếm riêng làm bán trùng ghế | Cao |
| D32 | Giữ chỗ hotline là khóa ghế có thời hạn trong kho chung, tự hết khi quá hạn, không cần bộ hẹn giờ (kiểm tra khi đọc hoặc bán). Khách đến quầy nhận vé bằng `reservation_id` và đúng bộ ghế đã giữ, hold chuyển thành `CONVERTED`, ghế không bị đếm hai lần | A46 | Chỉ cộng bộ đếm; thêm bộ hẹn giờ nền | Bộ hẹn giờ nền tăng độ phức tạp, kiểm tra lười cho kết quả như nhau | Cao |
| D33 | Chế độ giữ chỗ theo spec: `UNTIL_DEPARTURE_OFFSET` hoặc `CUSTOM_EXPIRY_MINUTES`. Chuyến đã quá giờ vẫn giữ mặc định 15 phút để dữ liệu mẫu cố định chạy được | A46 | Từ chối chuyến đã khởi hành | Dữ liệu mẫu có giờ khởi hành 2026-08-28 | Trung bình |
| D34 | POS: hình thức thanh toán `CASH_POS`, `CARD_POS`, `BANK_TRANSFER`. Vé POS mang tuyến, giờ khởi hành và giá thật để hủy và hoàn tiền đúng | A45 | Giữ vé POS với giờ khởi hành là lúc xuất vé | Giờ sai làm hoàn tiền về 0% | Cao |
| D35 | Mỗi người dùng một hold hoạt động trên một chuyến, tối đa 5 ghế. Giữ bộ ghế khác thì thay hold cũ. Giữ lại cùng bộ thì trả hold cũ, không kéo dài. Sơ đồ ghế không lộ ai đang giữ ghế | A31 | Cho giữ lặp vô hạn | Chống giữ ghế vô thời hạn và lộ định danh | Trung bình |
| D36 | `npm run lint` kiểm tra từng file qua `tools/lint.js`. Trước đó `node --check a b c` chỉ kiểm file đầu tiên nên lệnh luôn "sạch" | A53 (mới) | Giữ nguyên | Kiểm tra giả làm vô hiệu hóa mọi khẳng định "lint sạch" | Trung bình |

## Giai đoạn A, Lô 2: xác thực, phân quyền, idempotency

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D37 | Token đăng nhập được ký HMAC (tiền tố cho biết loại: `pax_jwt_`, `drv_jwt_`, `mgr_session_`), có hạn: hành khách 12 giờ, tài xế 12 giờ (một ca), quản lý 8 giờ. Chưa có refresh token | A01, A28 | Giữ token base64 không ký | Token cũ ai cũng tự tạo được. Refresh token để sau vì client chưa dùng | Cao |
| D38 | Cổng API kiểm token theo cột Auth của `api-screen-map`: công khai (cấu hình, tìm chuyến, sơ đồ ghế, đăng nhập, webhook), hành khách, tài xế, quản lý. Sai loại token: `403 FORBIDDEN` | A01 | Kiểm trong từng route | Một chỗ kiểm duy nhất (`core/gateway.js`) | Cao |
| D39 | Danh tính lấy từ token: số điện thoại ví vé, `userId` giữ ghế và đặt vé, `driverId`, số điện thoại thông báo. Tham số `phone` trong query bị bỏ qua khi bật xác thực. Bỏ các mặc định `usr_guest`, `usr_default`, số `0912345678` | A01, A29, A34 | Giữ mặc định cho tiện demo | Mặc định chung làm mọi khách dùng chung một danh tính | Cao |
| D40 | Quyền sở hữu vé: chủ vé (người thanh toán) xem, ủy quyền, hủy; người được ghi tên và người được ủy quyền chỉ xem; người khác bị `403`. Đơn hàng chỉ người thanh toán kiểm tra. Tài xế chỉ truy cập chuyến được giao | A30, A42 | Chỉ chủ vé thấy vé | Người đi cùng cần xuất trình vé | Cao |
| D41 | Vai trò quản lý theo ma trận trong MGR-029 (POS: giám đốc và thu ngân; hoàn tiền và báo cáo: giám đốc và kế toán; hoãn xe, đổi xe: giám đốc và điều độ). Chỉ giám đốc thấy số điện thoại đầy đủ. Thêm tài khoản thu ngân mẫu | A01, A38 | Cho mọi nhân viên toàn quyền | Phân quyền tối thiểu theo OQ-007 | Cao |
| D42 | Idempotency-Key bắt buộc ở các POST đánh dấu `Yes` trong bản đồ API, lưu kết quả 24 giờ, thử lại trả cùng phản hồi kèm `Idempotent-Replay: true`. Cùng key khác nội dung: `422`. Telemetry không dùng (tần suất cao) | A02 | Bắt buộc mọi POST | Telemetry 1Hz không cần chống trùng theo khóa | Cao |
| D43 | PIN và mật khẩu lưu dạng băm scrypt có muối, so sánh constant-time. Khóa tài khoản 15 phút sau 5 lần sai (`429 ACCOUNT_LOCKED`). Bằng lái hết hạn trả `403 LICENSE_EXPIRED` theo DRI-001 | A51 | Giữ so sánh chuỗi | Chống dò mật khẩu | Cao |
| D44 | 2FA TOTP cho quản trị và kế toán chưa làm, ghi là `OQ-027` còn mở | A12 | Làm giả lập | Cần kho khóa và màn hình đăng ký, nằm ngoài phạm vi Giai đoạn A | Trung bình |
| D45 | Công tắc `FLEETBUS_AUTH` (`enforce` mặc định ở production, `off` ở dev) cho đến khi giai đoạn B cập nhật app Flutter. Đây là **khoảng trống cần đóng ở giai đoạn B** | A01, A02 | Bật mặc định mọi môi trường | Bật ngay làm hỏng cả 3 app hiện chưa gửi token | Cao |
| D46 | Bỏ các alias cũ `/api/v1/app/config`, `/stations`, `/trips` ở `apiServer.js` vì chặn trước route thật và trả sai định dạng, chỉ giữ route trong `passengerRoutes.js` | A03 | Giữ để tương thích | Hai bản logic lệch nhau (một bản bỏ qua bộ lọc) | Trung bình |

## Giai đoạn A, Lô 1c-ii: vắng mặt, phát lại telemetry, số liệu quản lý

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D47 | Đánh dấu vắng mặt: sau giờ xuất bến 10 phút, hoặc ngay khi khách báo hủy qua điện thoại (`passenger_requested_cancel`). Chỉ khách còn đang chờ mới đánh dấu được. Việc nhả ghế cho các đoạn còn lại cần mô hình đoạn đường nên để lại (`OQ-028`) | A43 | Nhả cả ghế | Chưa có tồn kho theo đoạn, nhả cả ghế sẽ bán lại ghế đang có khách ngồi trên các đoạn đầu | Trung bình |
| D48 | Phát lại telemetry: áp dụng bản ghi cũ trước, bỏ bản trùng (cùng chuyến và dấu thời gian), bỏ bản không hợp lệ, bản cũ không ghi đè vị trí mới, bản đã phát lại rời hàng đợi offline. Bản ghi không có dấu thời gian giữ thứ tự trong mảng | A44 | Giữ phát lại theo thứ tự đến | Mạng chập chờn gửi lệch thứ tự, vị trí cuối sẽ sai | Trung bình |
| D49 | Số liệu bảng điều khiển luôn tính từ dữ liệu: đúng giờ là trễ không quá 15 phút, tốc độ trung bình của xe đang chạy, hành lang theo tuyến có chuyến. Doanh thu tách `gross`, `refunded` và `net` | A49 | Giữ hằng số 96,8% và 58,5 km/h | Số cố định luôn đúng trên màn hình nhưng sai với thực tế | Trung bình |
| D50 | Báo cáo điều hành lọc theo kỳ (`from`, `to` theo spec, vẫn nhận `start_date`, `end_date` cũ), tỷ trọng kênh tính theo doanh thu và cộng đủ 100. Bỏ trường `zero_incident_days` vì không có dữ liệu nào nằm sau nó | A49 | Giữ giá trị 42 | Một con số bịa trong báo cáo điều hành | Trung bình |

## Giai đoạn A, Lô 3: hình dạng API

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D51 | Chuyến chưa có tín hiệu GPS trả `has_position: false`, `signal_status: NO_SIGNAL` thay vì một chiếc xe bịa. Có ping thì `LIVE` hoặc `STALE`. Chuyến không tồn tại trả 404. Điểm đón mặc định vẫn là toạ độ Giáp Bát vì chưa có toạ độ điểm dừng | A32 | Giữ vị trí mặc định để màn hình luôn có hình | Hành khách thấy xe đang chạy 52 km/h trong khi xe chưa xuất bến | Trung bình |
| D52 | Đường dẫn chặt: một đường dẫn con chưa có trả 404, không trả dữ liệu của endpoint cha | A04 | Giữ `startsWith` | Client nhận dữ liệu sai mà không biết | Trung bình |
| D53 | Cảnh báo (`/ops/alerts`) tách khỏi nhật ký kiểm toán (`/ops/audit-logs`). Nhật ký ghi ai, làm gì, trên gì, từ IP nào, giá trị trước và sau. Chỉ thêm vào, mỗi bản ghi bị đóng băng, không bao giờ ghi mật khẩu. Đăng nhập sai và khóa tài khoản cũng được ghi | A05 | Giữ nhập chung | MGR-028 yêu cầu nhật ký bất biến có actor, IP và khác biệt | Trung bình |
| D54 | `payments/initiate` gộp vào `bookings/create` (đơn đặt vé tạo luôn lệnh thanh toán). Hủy vé theo từng vé, hủy theo booking để sau. Telemetry dùng REST thay MQTT cho đến khi có broker | A08 | Tách đúng như spec | Tách chỉ thêm một trạng thái đặt chỗ không có cách trả tiền | Trung bình |
| D55 | Sổ endpoint hoãn trong `api-screen-map` mục 5: 16 endpoint (kho người đi cùng, ETA theo điểm dừng, hình học tuyến, lịch sử telemetry, CRUD quản trị, hiệu suất tài xế, danh sách thanh toán, phát thông báo, vai trò và cấu hình) với lý do | A07 | Làm giả lập cho đủ 26 dòng | YAGNI: không có dữ liệu hay màn hình nào phía sau | Trung bình |
| D56 | `core/apiCatalog.js` là danh mục endpoint thật; `/api/v1/openapi.json` sinh từ đó. Test kiểm mọi mục đều được phục vụ | A10 | Giữ `openapi.json` viết tay 8 đường dẫn | Tài liệu tự lệch khỏi code sau mỗi lần sửa | Thấp |
| D57 | Hồ sơ tài xế lấy theo người gọi, không lộ PIN, không báo điểm đánh giá vì không có dữ liệu | A09 | Giữ hồ sơ cố định | Tài xế nào cũng thấy tên Trần Văn Bình | Thấp |
| D58 | Tra cứu đơn theo PNR, không theo mã chuyến | A11 | Giữ hai khóa | Một mã chuyến bất kỳ trả về một đơn | Thấp |

## Thay đổi test hiện có (theo hợp đồng mới)

Không có assertion nào bị nới lỏng. Những test dưới đây từng khẳng định hành vi không an toàn và được viết lại theo spec:

| Test | Thay đổi | Quyết định |
|---|---|---|
| TC-CORE-07 | Bậc hoàn tiền 12h/6h, thêm kiểm biên | D12 |
| TC-PAY-05 | "Tôi đã chuyển tiền" vẫn chờ, webhook mới xuất vé | D8 |
| TC-SRV-06 | Giữ ghế thật, thanh toán qua webhook | D8, D10 |
| TC-SYNC-01 | Đặt vé gửi `userId` của chủ phiên giữ ghế | D10 |
| TC-SYNC-08 | Hủy một vé mới mua, không hủy vé đã lên xe. Kiểm `REFUND_REQUESTED` và `refund_id` | D12 |
| TC-DRV-05 | Tạo QR bằng khóa của chính service | D11, D16 |
| TC-MGR-07 | Duyệt hoàn tiền trên yêu cầu thật, một lần | D12 |
| TC-DRV-09 | Vé vẫy: bỏ giá client gửi, kiểm giá server 220.000 và tiền thối 30.000 | D25 |
| TC-MGR-02 | Tỷ lệ lấp đầy so với giá trị tính từ dữ liệu, bỏ ngưỡng cứng `> 80` | D29 |
| TC-SRV-03 | Hoàn tất phiếu kiểm tra và bắt đầu chuyến trước khi gửi telemetry | D22 |
| TC-SYNC-03 | Bắt đầu chuyến trước khi gửi telemetry | D22 |
| TC-SYNC-07 | Đổi sang xe `29B-888.22` có thật trong đội xe | D27 |
| Tất cả test đăng nhập HTTP | Mặc định `authMode: off` nên không đổi; test xác thực mới chạy ở `enforce` | D45 |
| TC-SRV-07 | Vé không có trong manifest trả `404 TICKET_NOT_FOUND` thay vì chấp nhận `200` hoặc `400` | D47 |
| TC-MGR-09 | Tỷ lệ đúng giờ so với giá trị tính từ chuyến, kiểm doanh thu ròng | D49 |
| TC-E2E-06 | Gửi một ping GPS trước khi hỏi radar, kiểm cả nhánh không có tín hiệu | D51 |
| TC-TRACK-03 (xóa) | Thay bằng TC-SPEC-A18, A18b, A48 chạy qua HTTP | D12 |
| `e2e_live_flow.js` | Đặt vé gửi `holdId` và `userId`, bỏ giá do client gửi | D9, D10 |

## Việc để lại cho các giai đoạn sau

- **Giai đoạn B (Flutter):** `passenger_api_service.dart` phải gửi `userId` và `holdId` khi tạo đơn, dùng `GET /passenger/tickets?phone=` với số đầy đủ, hiểu `status: REFUND_REQUESTED`, và gửi token Bearer cùng `Idempotency-Key` khi D15 bật bắt buộc.
- **Còn mở trong giai đoạn A:** FND-A01/A02 (xác thực, idempotency), A03, A04, A05, A06, A38 đến A47, A49 đến A52, và 26 endpoint spec chưa có (FND-A07).
