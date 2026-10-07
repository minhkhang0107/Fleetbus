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

## Giai đoạn B: ba app Flutter

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D59 | Giai đoạn B giới hạn ở lớp client (service API) và test hợp đồng tĩnh. Không nối màn hình, không viết màn hình mới vì máy không có Flutter SDK để biên dịch và kiểm chứng | B01, B11 | Viết hàng nghìn dòng Dart mù; tải SDK | Mã chưa từng chạy tạo ra cảm giác an toàn giả. Tải SDK hàng GB lên máy của bạn cần bạn đồng ý | Cao |
| D60 | Ba service dùng cùng một mẫu (`_get`, `_post`, `_delete`), giữ token từ đăng nhập, gửi khóa idempotency ở các thao tác server yêu cầu. Mỗi phương thức mutating nhận `idempotencyKey` tùy chọn để thử lại đúng một thao tác bằng cùng khóa | B02 | Sinh khóa mới mỗi lần gọi | Thử lại bằng khóa mới sẽ tạo đơn hoặc thu COD lần hai, chính là điều Idempotency-Key ngăn | Cao |
| D61 | Client không gửi danh tính (`userId`, `phone`, `x-driver-id`) hay giá. Token cho server biết người dùng | B03, B05, B06, B07 | Giữ tham số tùy chọn cho tiện dev | Mọi tham số danh tính tùy chọn là một cánh cửa để giả mạo | Cao |
| D62 | `FLEETBUS_AUTH` mặc định `enforce` ở mọi môi trường, `off` chỉ khi không phải production. Các test logic nghiệp vụ qua HTTP đặt `authMode: 'off'` tường minh; test xác thực, test hình dạng API chế độ bật và e2e chạy dưới `enforce` | D45 | Giữ `off` mặc định ở dev | Client đã gửi token nên không còn lý do để mặc định yếu hơn | Cao |
| D63 | `arrive` (DRI-008) cần Idempotency-Key theo spec; thêm vào quy tắc cổng | B09 | Giữ như cũ | Spec ghi `Yes` | Thấp |
| D64 | Giữ các alias phía server cho đến khi biết chắc không còn client dùng | B08 | Xóa ngay | Không có Flutter để xác nhận không còn gọi alias nào | Thấp |
| D65 | Viết lại e2e thành client đúng hợp đồng với kiểm bắt buộc từng bước, gồm các thử nghiệm phản chứng (không token 401, QR giả bị từ chối, sai số tiền bị từ chối, bán ghế hai lần 409) | B12 | Giữ bản in kết quả | Bản cũ không bao giờ thất bại | Trung bình |
| D66 | Sửa ba tiêu đề test mobile và `STATE.md` để nêu đúng độ phủ (19/25, 14/19, 9/30) | B10 | Giữ | Tuyên bố phủ đủ khi chỉ kiểm vài file có tồn tại | Trung bình |

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
| TC-MGR-WEB-04 | Kiểm đường dẫn chuẩn thay vì alias | D60 |
| TC-MOB-05, TC-DRV-MOB-05, TC-MGR-WEB-05 | Tiêu đề nêu đúng độ phủ | D66 |
| `e2e_live_flow.js` (lần hai) | Viết lại thành client có token và kiểm bắt buộc | D65 |
| Test logic nghiệp vụ qua HTTP | `authMode: 'off'` tường minh | D62 |
| TC-TRACK-03 (xóa) | Thay bằng TC-SPEC-A18, A18b, A48 chạy qua HTTP | D12 |
| `e2e_live_flow.js` | Đặt vé gửi `holdId` và `userId`, bỏ giá do client gửi | D9, D10 |

## Việc để lại cho các giai đoạn sau

- **Giai đoạn B (Flutter):** `passenger_api_service.dart` phải gửi `userId` và `holdId` khi tạo đơn, dùng `GET /passenger/tickets?phone=` với số đầy đủ, hiểu `status: REFUND_REQUESTED`, và gửi token Bearer cùng `Idempotency-Key` khi D15 bật bắt buộc.
- **Còn mở trong giai đoạn A:** FND-A01/A02 (xác thực, idempotency), A03, A04, A05, A06, A38 đến A47, A49 đến A52, và 26 endpoint spec chưa có (FND-A07).

## Giai đoạn C: quyết định (bảy luồng xuyên app)

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D67 | Bỏ khỏi các flow những thứ không có màn hình, kênh gửi tin hay ví voucher: danh sách đen khách hotline, nhắc trước khi hết hạn, voucher 20% khi chậm quá 45 phút, thuật toán dồn ghế, endpoint `cash-summary` và `cash-reconciliation`. Ghi vào `OQ-031` | C12 | Làm hết cho khớp flow cũ | Flow viết trước màn hình; màn hình mới là chuẩn (D4). Không có SMS, Zalo hay ví voucher để kiểm | Trung bình |
| D68 | Flow mô tả hiện trạng (REST, hỏi lại, bộ nhớ) và tách kiến trúc đích (WebSocket, MQTT, Redis, PostgreSQL) ra bảng riêng | C12 | Giữ hạ tầng đích như đang là sự thật | Tài liệu nói hệ thống làm được điều nó không làm | Thấp |
| D69 | Bỏ nút nghỉ trạm dừng và hai endpoint `rest-stop` khỏi `FLOW-06`; trạng thái trạm dừng chờ dữ liệu vị trí trạm (`OQ-030`) | C12 | Thêm endpoint theo flow | Không màn hình tài xế nào có nút; `PAX-018` đã định nghĩa trạng thái tự động | Thấp |
| D70 | Ma trận ghế trả từng ghế với 5 trạng thái; cả chuyến là một chặng đến khi có mô hình chặng (`OQ-028`) | C01 | Làm ngay ma trận theo chặng | Chưa có mô hình chặng | Trung bình |
| D71 | `POST /ops/trips/{id}/seats/override-lock` `{seatCodes, locked, reason}`: lý do bắt buộc khi khóa, nguyên tử, không khóa được ghế đã bán hoặc đang giữ; vai trò `FLEET_DIRECTOR` và `DISPATCHER`; có nhật ký | C02 | Cho cả thu ngân | Khóa ghế là việc điều phối chuyến; thu ngân chỉ bán | Thấp |
| D72 | Sửa spec `PAX-021 BR-CANCEL-001`: dưới 6 giờ vẫn hủy được và hoàn 0%; điều hành công bố chậm trên 30 phút thì hoàn 100% (`DELAY_WAIVER`). Chỉ chậm do điều hành công bố mới tính, ước tính của tài xế thì không | C03 | Chặn hủy dưới 6 giờ (đúng câu chữ cũ); lấy chậm từ báo cáo sự cố của tài xế | Chặn hủy khiến khách giữ ghế vô ích; tài xế tự báo không nên quyết định tiền hoàn | **Cao** (tiền) |
| D73 | Hạn mức nợ tiền thừa 1.000.000 đ mỗi chuyến, tính mọi biên lai đã phát kể cả đã trả; vượt thì `400 DEBT_LIMIT_EXCEEDED` và tài xế trả bằng tiền mặt hoặc ví; đúng hạn mức vẫn cho | C04 | Chỉ tính biên lai chưa trả | Hạn mức giới hạn rủi ro gian lận khi phát hành, không phải số dư | **Cao** (tiền) |
| D74 | `POST /ops/debt-receipts/{code}/redeem` đặt dưới `MGR-022`, vai trò `FLEET_DIRECTOR`, `CASHIER`, `FINANCIAL_CONTROLLER`, trả một lần, có nhật ký, số điện thoại đã che | C04 | Màn hình thu ngân riêng | Chưa có màn hình; không để sổ nợ không có đường trả | Trung bình |
| D75 | Hotline: tối đa 4 ghế mỗi số điện thoại trên mọi chuyến; hold hết hạn hoặc hủy không tính | C05 | Giới hạn theo chuyến | Chống một số giữ nhiều chuyến | Thấp |
| D76 | Ví vé: tab `UPCOMING`, `HISTORY`, `CANCELLED` (`COMPLETED` là tên cũ của `HISTORY`, giá trị khác `400 INVALID_TAB`); vé `BOARDED` ở Sắp đi đến hết chuyến; `NO_SHOW` vào Lịch sử ngay | C06 | Giữ tab cũ | Đúng `BR-MYTICKETS-001` | Trung bình |
| D77 | Vé `BOARDED` hoặc `NO_SHOW` vẫn mở được, không có QR; vé đã hủy vẫn `404` | C06 | Giữ lỗi cho mọi vé không còn `ACTIVE` | `PAX-017` định nghĩa nhãn "ĐÃ LÊN XE"; vé đã dùng không được chia sẻ | Thấp |
| D78 | Radar tìm xe qua chuyến rồi mới qua biển số; trạng thái xe theo chuyến, không theo tốc độ; `STALE` sau 60 giây, `OFFLINE` sau 180 giây ở cả khách và điều hành; tuổi vị trí tính từ thời điểm của ping | C07 | Giữ đổi trạng thái theo tốc độ | Xe đứng ở trạm bị coi là xe dự phòng rảnh | Trung bình |
| D79 | Đổi xe chuyển luôn chuyến sang tài xế mới; tài xế thay thế phải `ON_DUTY` và còn giấy phép (`DRIVER_UNAVAILABLE`); danh bạ điều hành dùng cùng mã và tên với app tài xế | C08 | Chỉ đổi biển số | App tài xế là nơi tài xế mới nhận việc | Trung bình |
| D80 | Vắng mặt đến vé, thông báo khách và số đếm ở điều hành; ghế vẫn bán cả tuyến, không hoàn tiền | C09 | Nhả ghế ngay | Cần mô hình chặng (`OQ-028`) | Thấp |
| D81 | Sửa dữ liệu mẫu: xe `veh_04` (`29B-882.19`), chuyến `trp_hn_th_01` ở điều hành thành `READY` với 2 ghế đã bán, tên và mã tài xế khớp app tài xế, thêm tài xế hết giấy phép để thử. Năm test cũ đổi kỳ vọng (`phase-C-findings.md` mục 3) | C07, C08, C10, C11 | Sửa ở nơi đọc để seed không cần đổi | Dữ liệu mẫu tự mâu thuẫn che mất lỗi thật | Thấp |
| D82 | Xóa 20 ảnh `screen-spec/flows/images` và dựng lại `.mmd` từ các khối Mermaid mới. Ảnh dựng lại bằng `npm run render:diagrams` | C12 | Giữ ảnh cũ; vẽ lại bằng tay | Ảnh vẽ hành vi sai; máy không có `mermaid-cli`; vẫn lấy lại được qua git | Thấp |

## Việc để lại cho Giai đoạn D

`DRI-012-cod.md` trùng `DRI-012-cod-collection.md`; liên kết tuyệt đối hỏng ở `README.md` gốc; dữ liệu mẫu của `trp_991823` (FND-C11); ma trận truy vết đầy đủ; các `OQ` còn mở (`OQ-027`, `OQ-028`, `OQ-029`, `OQ-030`).

## Giai đoạn D: quyết định (rà soát tổng thể)

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D83 | Bổ sung hàng cho 31 màn hình vào ma trận truy vết và 22 vào bản đồ điều hướng, sinh từ danh mục và file màn hình; cột bằng chứng ghi "none: spec only" khi không test nào nêu tên màn hình | D01 | Chỉ nêu "đã phủ"; viết tay | Số liệu sinh bằng script không bịa; thiếu bằng chứng phải thấy được | Thấp |
| D84 | Không điền nội dung cho `cross-screen-state-map`, `analytics-screen-map`, `component-catalog`, `accessibility` | D01 | Viết cho đủ 79 màn hình | Các file này là tài liệu chọn lọc; viết cho đủ là bịa | Thấp |
| D85 | Năm mã `BR-*` chỉ xuất hiện trong phần nguồn yêu cầu được coi là nhãn nguồn, không phải quy tắc phải làm | D02 | Viết nội dung quy tắc cho từng mã | Nội dung đã nằm ở quy tắc khác (`ALREADY BOARDED`, `BR-REFUND-002`, `BR-TICKET-006`) | Thấp |
| D86 | Dữ liệu mẫu `trp_991823`: chuyến `DISPATCHED`, xe `veh_01` `ASSIGNED`; số ghế mẫu không đổi | D03 | Đổi cả số ghế | Cần để luồng bắt đầu chuyến có nghĩa; số ghế do sơ đồ ghế quyết định | Thấp |

## Giai đoạn E: quyết định (việc còn lại không cần Flutter)

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D87 | TOTP: RFC 6238 chuẩn, lệch một bước mỗi phía (không phải hai như mã vé), áp cho `FLEET_DIRECTOR` và `FINANCIAL_CONTROLLER`; hỏi mã sau khi mật khẩu đúng; mã sai tính vào khóa 5 lần; mã đã dùng không dùng lại. Khóa lấy từ biến môi trường `FLEETBUS_TOTP_SECRET_<USER_ID>`, production không có thì từ chối; ngoài production dùng khóa dev để chạy demo. Không làm màn hình đăng ký khóa | OQ-027 | Hai bước lệch như vé; lưu khóa trong cơ sở dữ liệu có màn hình đăng ký | Vé có dung sai 90 giây vì đồng hồ điện thoại khách; đăng nhập nhân viên nên chặt hơn. Màn hình đăng ký thuộc app (`OQ-029`) | **Cao** (bảo mật) |
| D88 | Trạm dừng: bảng trạm có vùng 300 m trong `core/restStops.js`, dữ liệu mẫu trên tuyến Hà Nội đến Thanh Hóa; ngưỡng 5 phút, tốc độ dưới 1 km/h; hết khi chạy lại. Bỏ hẳn nút nghỉ thủ công | OQ-030 | Thêm nút nghỉ thủ công | Spec màn hình khách đã định nghĩa trạng thái tự động | Thấp |
| D89 | Kho ghế theo chặng: chặng là khoảng giữa hai điểm dừng liên tiếp; không đưa điểm nào thì cả tuyến; chuyến không rõ điểm dừng thì không chia được | OQ-028 | Chia theo giờ; bitmask | Khớp `BR-SEAT-001` ("không tính còn chỗ bằng tổng ghế") | **Cao** (kho ghế) |
| D90 | Điểm dừng của chuyến lấy từ chuyến phía hành khách (PAX-008), chuyến chỉ có ở app tài xế dùng điểm dừng của tài xế; thêm Ninh Bình (đón và trả) vào chuyến mẫu `trp_hn_th_01`, app tài xế cùng năm điểm | OQ-028 | Giữ dữ liệu cũ | Hà Nội chỉ đón, Thanh Hóa chỉ trả thì không thể bán hai chặng liền nhau | Thấp |
| D91 | Một người giữ một phiên trên một chuyến, đổi đoạn là thay phiên cũ; ghế đã bán cho đoạn khác vẫn giữ được cho đoạn trống | OQ-028 | Nhiều phiên cùng lúc | Giữ quy tắc `BR-SEAT-003` hiện có | Thấp |
| D92 | Vắng mặt nhả ghế từ điểm xe đã tới (`current_stop_index`) đến hết đoạn của khách, phần đã đi vẫn đã bán; không hoàn tiền. Khách vẫy đi từ điểm xe đã tới đến điểm trả, ghế phải trống đúng đoạn đó trong kho ghế và trên manifest | OQ-028 | Nhả cả vé; nhả ngay khi đánh dấu | Phần đã đi không còn ai ngồi được; vé của khách đã mua vẫn là tiền thật nên không hoàn | **Cao** (kho ghế, tiền) |
| D93 | Giá vẫn phẳng theo chuyến; ghi `OQ-032`, không tự quyết giá theo chặng | OQ-028 | Giá theo tỷ lệ số chặng | Đổi giá là quyết định kinh doanh và cần bảng giá từ trình tạo tuyến | **Cao** (tiền) |
| D94 | Sửa đánh số quy tắc của `PAX-009` cho khớp trace của chính nó (`001` chặng, `003` tối đa 5 ghế, `004` mất mạng) | OQ-028 | Giữ số cũ | Số cũ mâu thuẫn với phần trace trong cùng file | Thấp |

Test đổi kỳ vọng ở Giai đoạn E: `getSeatMap(trip, 'a', 'b')` thành `getSeatMap(trip, null, null)` (điểm giả trước đây bị bỏ qua, nay được kiểm); `TC-FLOW-C08` cho khách vẫy đi hết tuyến; các test đăng nhập giám đốc gửi mã TOTP.


## Review design: quyết định (trải nghiệm 3 app, 2026-10-07)

Phát hiện: `docs/review/design-review-findings.md`.

| # | Quyết định | Phát hiện | Đã cân nhắc | Lý do | Duyệt |
|---|---|---|---|---|---|
| D95 | Một màu chính `#2563EB` cho cả ba app; một màu amber `#D97706` cho giữ chỗ và chậm; chữ PNR `#C2410C` trên nền `#FFF7ED` | DSG-10, DSG-24 | Giữ `#0F52BA` của design-system | Code Flutter và hai file DESIGN đã dùng `#2563EB`; chỉ một file lệch | Thấp |
| D96 | Thanh tab chỉ hiện ở 4 màn gốc; ẩn trong luồng đặt vé. Thứ tự: kết quả, chi tiết chuyến, điểm đón/trả, sơ đồ ghế, thông tin khách và checkout. Banner đếm ngược hiện từ lúc giữ ghế đến hết thanh toán | DSG-04, 05, 06 | Giữ thanh tab mọi nơi | Chặng quyết định ghế trống; thanh tab dưới màn thanh toán làm khách bỏ dở phiên giữ | Trung bình |
| D97 | Checkout chỉ có VietQR ở phiên bản này; mở `OQ-033` cho cổng khác và COD trong app | DSG-25 | Vẽ đủ 4 phương thức | Nút không chạy được là lỗi; server chỉ khớp VietQR | **Cao** (tiền) |
| D98 | DRI-004: nút xuất bến khóa đến khi tích đủ 6 mục; DRI-005 là sheet xác nhận | DSG-14 | Cho tích sẵn | Server đã đòi checklist (`INVALID_TRIP_STATE`), UI phải khớp | Thấp |
| D99 | Không dùng hộp thoại trình duyệt; phản hồi theo mức: đổi trạng thái tại chỗ, toast, sheet hoặc panel kết quả, sheet xác nhận trước thao tác không đảo ngược (nêu số tiền hoặc số người bị ảnh hưởng) | DSG-03, 13, 15, 19, 20 | Giữ `alert()` | `alert()` chặn thao tác, không cập nhật trạng thái, không cho xem lại | Trung bình |
| D100 | Vé COD chưa thu tiền chỉ lên xe qua bước thu COD; tay, PIN, QR trả `409 COD_PAYMENT_REQUIRED` kèm giá; QR đoàn cho lên người đã trả và liệt kê người còn nợ. UI chỉ có một nút "Thu {giá} & cho lên xe". Bỏ cờ `requires_cod` (không ai đọc) | DSG-12 | Cho lên xe rồi nhắc thu; giữ hai nút | Hai nút tách rời là đường thất thoát doanh thu; `collectCod` vốn đã đánh dấu lên xe | **Cao** (tiền) |
| D101 | Không emoji, không chữ cho dev (giả lập, mã test, Hz, FPS, MQTT, HMAC, dp) trên màn hình; thang bo góc 4, 8, 12, pill | DSG-08, 18, 22 | | Spec đã cấm emoji nhưng prototype vẫn dùng | Thấp |
| D102 | Design chuẩn mới nằm trên Claude Design; prototype HTML ở `web_dist` không sửa trong đợt này | DSG-01, 07 | Viết lại 3 file HTML | Prototype sẽ được thay bằng app Flutter (`OQ-029`); sửa hai lần là lãng phí | Trung bình |

| D103 | Đổi D102: viết lại cả ba prototype HTML theo design mới. Nút mô phỏng (ngân hàng, camera, GPS, đồng hồ, mất mạng) nằm trong bảng demo ngoài khung máy | DSG-01, 07 | Giữ prototype cũ đến khi có Flutter | Chủ dự án yêu cầu cập nhật code theo design; prototype là thứ duy nhất chạy được để thử luồng | Trung bình |

Test đổi kỳ vọng: `TC-E2E-01` và `TC-SRV-05` tìm dấu hiệu của giao diện mới thay vì chữ của giao diện cũ, và `TC-SRV-05` kiểm thêm không hộp thoại, không emoji, không nút giả lập.
Test đổi kỳ vọng: `TC-SPEC-A43` cho vé COD lên xe bằng `collectCod` thay vì `boardPassengerManually` (đường cũ nay bị chặn bởi D100).
