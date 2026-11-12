# Rà soát sẵn sàng ra thị trường — 2026-10-28

Rà soát theo 4 vai: hành khách, tài xế, nhà xe (giám đốc, điều phối, thu ngân, kế toán), quản trị nền tảng. Gemini rà soát lần đầu (28 phát hiện). Claude mở code kiểm chứng từng mục: giữ các mục đúng, bỏ mục sai, sửa lại mức độ khi bị đánh giá quá nặng, và thêm những gì Gemini bỏ sót. Mã `G:` là ID trong bản của Gemini.

**Kết luận: CHƯA SẴN SÀNG, kể cả cho pilot với một nhà xe thật.** Nghiệp vụ lõi (giữ ghế, đối soát chuyển khoản, đón tận nhà, cổng điều hành, cách ly dữ liệu giữa nhà xe) đã sâu và có 621 test. Nhưng còn những lỗi chặn ngay ngày đầu:
- Khách không đăng nhập được.
- Có cửa hậu vào tài khoản.
- Khách tự sửa giờ để được hoàn tiền.
- Bản build production trỏ sai server và chạy GPS giả.
- Nhà xe mới không tự tạo được tuyến.

## 1. Lỗi chặn (BLOCKER) — phải sửa trước pilot

| ID | Vai | Vấn đề | Bằng chứng |
|---|---|---|---|
| B-01 | Khách | **OTP không được gửi.** `requestOTP` sinh mã nhưng không gọi SMS/Zalo; production ẩn `mock_otp`, nên không ai đăng nhập được. (G: P-01) | `source/server/services/passenger/modules/auth.js:79-103`; `core/messaging.js` có sẵn kênh SMS nhưng OTP không dùng |
| B-02 | Khách | **Cửa hậu OTP trong production:** số `0912345678` luôn nhận mã `882199`, không kiểm tra `isProduction()` (chỉ tài khoản VIP được kiểm tra). (G: P-02) | `auth.js:82-83`, `auth.js:134-137` |
| B-03 | Khách, tài xế | **Client tự đặt giờ (`body.now`) trong production.** Hủy vé sát giờ vẫn được hoàn 100%; OTP hết hạn vẫn dùng được; QR lên xe hết hạn vẫn quét được. (G: P-04, D-05) | `routes/passengerRoutes.js:247,260,765`; `routes/driverRoutes.js:222,253,263,355`; `routes/managerRoutes.js:490` |
| B-04 | Tất cả | **Dữ liệu và tài khoản demo nạp vào production:** nhà xe mẫu Sao Mai/Xuyên Việt (STK giả `1088219999`), chuyến mẫu, `dispatcher@busgo.vn`/`disp123`, `cashier@busgo.vn`/`cash123` (không cần 2FA), `root@busgo.vn`/`root123`. Trang đăng nhập còn điền sẵn email điều phối. (G: O-04, A-02) | `services/manager/modules/managerService.js:57-120`; `core/operators.js:15-30`; `core/stateStore.js:58-78` (không kiểm tra production); `source/manager/web_dist/index.html:152` |
| B-05 | Khách, tài xế | **Bản build production trỏ về `10.0.2.2:3000`:** `env/production.env` đặt `API_BASE_URL`, nhưng app đọc `FLEETBUS_API_URL`. *(Gemini bỏ sót.)* | `source/passenger/data/lib/src/service/passenger_api_service.dart:21-29`; `source/driver/app/lib/src/service/driver_api_service.dart:21`; `source/*/env/production.env` |
| B-06 | Tài xế | **Bản production chạy GPS giả lập** (xe tự chạy 30 giây/trạm): `production.env` không có `FLEETBUS_DEVICE_GPS=true`. (G: D-02) | `source/driver/app/lib/src/presentation/driver_store.dart:612`; `source/driver/env/production.env` |
| B-07 | Tài xế | **Hàng đợi offline làm mất thao tác:** chỉ lưu nhãn chữ; khi có mạng lại, "Gửi ngay" xóa hàng đợi mà không gửi lại thao tác nào (quét vé, thu tiền, khách vẫy). (G: D-01) | `driver_store.dart:189-193`, `driver_store.dart:1315-1324` |
| B-08 | Tài xế | **Nút "Gọi 112" chỉ hiện thông báo**, không gọi; ghi chú sự cố không gửi lên điều hành. (G: D-03) | `source/driver/app/lib/src/presentation/driver_incident_dialog.dart:61,74-78` |
| B-09 | Nhà xe | **Nhà xe mới không tạo được tuyến:** lịch chạy chỉ tạo được trên tuyến có sẵn trong dữ liệu mẫu (`SCHEDULE_TEMPLATES`); không có API/màn hình tạo bến, tuyến. Nhà xe mới không bán được vé nào. (G: O-02) | `services/passenger/modules/search.js:197,546-548,656-658`; `routes/scheduleRoutes.js:74-90` |
| B-10 | Nhà xe | **Không tạo được tài khoản điều phối, thu ngân, kế toán:** nhà xe mới chỉ có một tài khoản giám đốc. (G: O-03) | `core/apiCatalog.js` (không có `/ops/staff`); `core/operators.js:218-237` |
| B-11 | Khách | **"Lưu ảnh mã QR" và "Gửi lại mã" OTP là nút giả** (chỉ hiện thông báo). Khách chỉ có một điện thoại thì không thanh toán VietQR được. (G: P-03) | `passenger_payment_processing_screen.dart:118`; `passenger_login_screen.dart:163` |
| B-12 | Kho ứng dụng | **Không phát hành lên kho được:** bản release ký bằng khóa debug; không có xóa tài khoản trong app (bắt buộc với App Store và Google Play); app khách xin quyền vị trí nền dù không dùng; bật HTTP không mã hóa. *(Gemini chỉ nêu một phần.)* (G: P-06) | `source/*/app/android/app/build.gradle:60`; `source/passenger/app/android/app/src/main/AndroidManifest.xml:12,28`; `Info.plist` có `NSAllowsArbitraryLoads` |

## 2. Mức CAO — nên sửa trước pilot hoặc trong tuần đầu

| ID | Vai | Vấn đề | Bằng chứng |
|---|---|---|---|
| H-01 | Kế toán | Hoàn tiền chuyển khoản không biết trả về tài khoản nào: khách không nhập được STK nhận hoàn, SePay không cho biết STK người gửi. (G: P-05) | `routes/passengerRoutes.js:760-773`; `core/payments/sepay.js` |
| H-02 | Thu ngân | Không có bước xác nhận tiền mặt tài xế nộp cuối chuyến; trạng thái `PENDING_DEPOT_SETTLEMENT` không bao giờ được chốt. (G: O-06) | `services/driver/modules/driverService.js:2138` |
| H-03 | Khách | Thu bảo hiểm 10.000 đ/ghế nhưng không có đối tác, giấy chứng nhận hay ghi nhận trên vé. Nên ẩn đến khi có hợp đồng. (G: P-08) | `services/passenger/modules/checkout.js:102-103` |
| H-04 | Pháp lý | Chưa có hóa đơn điện tử cho vé và chưa xuất danh sách hành khách / lệnh vận chuyển theo mẫu. Cần xác nhận với kế toán và tư vấn pháp lý về nghĩa vụ cụ thể của nhà xe pilot. (G: O-05, hạ từ BLOCKER vì chưa xác nhận nghĩa vụ) | Không có code liên quan |
| H-05 | Nền tảng | Không giới hạn số request theo IP cho OTP và đăng nhập: có thể spam SMS tốn tiền khi đã nối SMS thật. Nhật ký ghi IP của proxy, không phải IP thật. (G: A-04) | `routes/passengerRoutes.js:245-255` (chỉ có cooldown theo từng SĐT); `apiServer.js` dùng `socket.remoteAddress` |
| H-06 | Nền tảng | Token không thu hồi được khi đổi mật khẩu/PIN hoặc khóa nhân viên (token sống 8-12 giờ). (G: A-05) | `core/gateway.js:98-155`; `core/tokens.js:21` |
| H-07 | Nền tảng | Mỗi request (kể cả GET) đều duyệt và băm lại toàn bộ dữ liệu để tìm bản ghi đổi; mọi dữ liệu nằm trong RAM. Ổn với 1 nhà xe nhỏ, sẽ chậm dần khi dữ liệu lớn. Cần đo tải trước khi nhận nhà xe thứ hai. (G: A-01, hạ từ BLOCKER) | `apiServer.js:240-251`; `core/stateStore.js:91-175` |
| H-08 | Nền tảng | Chưa có sao lưu tự động và kiểm thử khôi phục; chỉ chạy được 1 tiến trình (khóa thư mục dữ liệu). (G: A-06) | `core/tenantDb.js:242-255`; README chỉ nhắc cất khóa |
| H-09 | Tài xế | App tài xế không có thông báo đẩy (đổi xe, thêm khách đón tận nhà). Bản khai báo service chạy nền cho Android 14 cần kiểm tra trên máy thật. (G: D-04) | `source/driver/app/pubspec.yaml`; `AndroidManifest.xml` |
| H-10 | Bản đồ | Dùng tile miễn phí `tile.openstreetmap.fr`, không dành cho ứng dụng thương mại; chưa có tìm địa chỉ (geocoding) khi chọn điểm đón. (G: P-10) | `passenger_route_map.dart:16`; `driver_route_map.dart:12` |

## 3. Mức TRUNG BÌNH / THẤP

- **Ví BusGo:** tiền thừa nhận vào ví nhưng app không hiển thị số dư và không dùng được. Nên tắt lựa chọn này. (G: P-07) — `payment.js:50-60`
- **Link chia sẻ vé** `https://busgo.vn/pass/...` không có route trên server. (G: P-09) — `payment.js:1000`
- **Chẩn đoán GPS/MQTT trả số cố định.** (G: D-05) — `routes/driverRoutes.js:415-439`
- **Lưu trữ dừng hẳn sau lỗi ghi** (503 cho đến khi khởi động lại). Đây là thiết kế cố ý để không lệch dữ liệu. Cần trình giám sát tự khởi động lại và cảnh báo. (G: A-03, hạ từ CAO) — `core/stateStore.js:92,159`
- **`/health` công khai mức dùng bộ nhớ; CORS `*`.** Rủi ro thấp vì xác thực bằng Bearer, không dùng cookie. (G: A-04, A-06)
- **Thiếu xuất CSV/Excel** cho kế toán. (G: O-07 phần 2)
- **Tên khách mặc định** "Hành khách BusGo", chưa sửa được tên. (G: P-06 phần 2)

## 4. Phát hiện của Gemini bị bác bỏ

- **G: O-01 "Giám đốc nhà xe mới bị khóa 2FA" — sai.** Tài khoản mới có `totp_enrolled: false`, được vào bằng mật khẩu và bị bắt đăng ký 2FA ngay (`core/operators.js:227`, `services/manager/modules/managerService.js:232-234`, `core/gateway.js:135`).
- **G: O-07 "Tỷ trọng khách vẫy luôn 0% do lệch tên kênh" — sai.** Cả hai nơi đều dùng `DRIVER_HAIL` (`core/fleetBusEventBridge.js:1067`, `services/manager/modules/managerService.js:1848`).

## 5. Điểm làm tốt

- **Hành khách:** giữ ghế có đếm ngược; đối soát chuyển khoản xử lý thiếu, thừa, trễ, trùng; đón tận nhà có vùng phục vụ và phụ phí rõ ràng; trang chia sẻ hành trình không cần app; có điều khoản và chính sách dữ liệu.
- **Tài xế:** kiểm tra bằng lái và hạng xe trước chuyến; thu tiền mặt có biên lai nợ tiền lẻ; quy trình đón tận nhà có giờ hẹn và ghi nhận khách không ra.
- **Nhà xe:** cổng điều hành đủ nghiệp vụ (sơ đồ ghế, bán tại quầy, gán xe/tài xế có kiểm tra chồng lịch); đổi lịch không ảnh hưởng vé đã bán; nhật ký thao tác có chuỗi băm chống sửa.
- **Nền tảng:** mỗi nhà xe một CSDL mã hóa riêng; gateway chặn truy cập chéo nhà xe; secret bắt buộc qua biến môi trường trong production; 621 test server.

## 6. Thứ tự đề xuất cho pilot với một nhà xe

1. **B-02, B-03, B-04:** khóa các đường tắt demo trong production. Nhỏ, sửa trong 1-2 ngày, rủi ro bảo mật cao nhất.
2. **B-05, B-06, B-12:** sửa cấu hình build release và ký app, khai báo quyền, xóa tài khoản.
3. **B-01, H-05:** nối OTP với SMS/Zalo ZNS thật, giới hạn theo IP. Cần hợp đồng nhà cung cấp.
4. **B-09, B-10:** màn hình tạo bến/tuyến và tài khoản nhân viên. Đây là việc lớn nhất.
5. **B-07, B-08, B-11:** sửa offline queue, nút 112, lưu QR, gửi lại OTP.
6. **H-01, H-02, H-03:** quy trình tiền (STK nhận hoàn, nộp tiền mặt cuối ca, ẩn bảo hiểm).
7. **H-04:** xác nhận nghĩa vụ hóa đơn điện tử và danh sách hành khách với nhà xe pilot.
8. **H-08:** sao lưu tự động trước ngày chạy thật.

## 7. Trạng thái sau đợt sửa 28/10 (D165-D172)

Đã sửa: B-01 (OTP qua SMS webhook, cần hợp đồng nhà cung cấp SMS/Zalo ZNS để chạy thật), B-03, B-07, B-08, B-09, B-10, B-11, B-12 phần xóa tài khoản, H-01, H-02, H-03, H-05, H-06, H-08; mục nhỏ: ví BusGo tắt mặc định, link chia sẻ vé, chẩn đoán GPS, xuất CSV thu chi.

Để sau theo yêu cầu: B-02 và B-04 (số và dữ liệu, tài khoản demo), B-05, B-06 và phần còn lại của B-12 (cấu hình bản release: địa chỉ server, GPS thật, ký app, quyền vị trí nền, HTTP không mã hóa).

Còn mở: H-04 (hóa đơn điện tử, danh sách hành khách, cần xác nhận pháp lý), H-07 (đo tải lưu trữ), H-09 (push cho app tài xế), H-10 (tile bản đồ thương mại, tìm địa chỉ), tên khách chưa sửa được.

## 8. Rà soát lần 2 (sau D165-D172)

Gemini rà soát lại theo 4 vai (17 phát hiện). Claude kiểm chứng trong code và chạy thử server **ở chế độ production** với thư mục dữ liệu, khóa và webhook SMS giả. Bài thử đi trọn luồng: khách nhận OTP qua SMS, quản trị tạo nhà xe, giám đốc đổi mật khẩu và cài 2FA, tạo bến, tuyến và nhân viên, khách tìm thấy chuyến ngày mai, giới hạn IP, sao lưu.

**Lỗi chặn mới, đã sửa (D173):**

| ID | Vấn đề | Ai tìm ra |
|---|---|---|
| R2-01 | **Ở production không nhân viên văn phòng nào đăng nhập được**: form đăng nhập web không gửi mã nhà xe, gateway trả 400 `OPERATOR_REQUIRED`. Có từ trước, lần 1 bỏ sót. | Claude (chạy thử production), Gemini cũng nêu (O-02) |
| R2-02 | **Tuyến mới không bán được vé trong 15 ngày đầu**: lịch đầu tiên bị áp quy tắc "bắt đầu sau các ngày đang mở bán" (D129), dù tuyến chưa bán ngày nào. Test cũ qua được nhờ thêm chuyến tăng cường. | Claude (đọc test, chạy thử production), Gemini (O-01) |
| R2-03 | **Link theo dõi xe trong SMS/push của vé đặt qua app báo 404** cho tới khi khách tự bấm "Chia sẻ vé" (link chỉ hợp lệ khi có `share_expires_at`). Có từ D144. | Gemini (P-01), Claude xác nhận bằng test |
| R2-04 | Webhook SMS/push không gửi được khóa xác thực mà các cổng SMS Brandname, Zalo ZNS yêu cầu. Mức CAO. | Gemini (P-02) |

**Bác bỏ hoặc không cần sửa:**
- D-01 "`seq` GPS lùi khi đồng hồ máy lùi": sai, app đã giữ `seq` luôn tăng (`driver_store.dart:1312`).
- D-03 "tài xế mẫu dự phòng ở `/driver/profile`": production luôn bật xác thực (`getAuthMode`), nhánh này không chạy.
- O-04 "kế toán không xem được tài xế": danh sách nộp tiền đã có tên tài xế, biển số.
- P-04 "ảnh QR từ `api.vietqr.io`": app tự vẽ QR từ `qr_payload`.
- A-04 "`/health` lộ RAM": đã biết, mức thấp.

**Để sau (mới thêm):**
- A-01: tài khoản quản trị nền tảng ở production cần đặt `FLEETBUS_TOTP_SECRET_PLAT_01` trước khi đăng nhập. Sẽ làm cùng B-04 (tạo tài khoản quản trị thật thay tài khoản mẫu).
- P-03: khách chưa sửa được tên.
- D-02: ghi chú sự cố tối đa 200 ký tự, chưa gửi được ảnh.
- O-05: bảng điều độ chưa lọc theo xe/tài xế.
- A-02: chạy dưới systemd/pm2 để tự khởi động lại.
- O-03: danh sách hành khách và lệnh vận chuyển theo Nghị định 10/2020, trùng H-04.

**Kết luận lần 2: sẵn sàng cho pilot có kiểm soát với một nhà xe nhỏ**, với điều kiện xong các mục để sau theo yêu cầu (dữ liệu/tài khoản demo, cấu hình bản release), có hợp đồng SMS hoặc Zalo ZNS, và chốt nghĩa vụ hóa đơn điện tử và danh sách hành khách với nhà xe pilot.
