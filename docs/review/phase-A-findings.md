# Giai đoạn A: Phát hiện (Server/API)

Ngày: 2026-10-06
Trạng thái: A1 hoàn thành (kiểm kê endpoint). A2 đến A4 chưa làm.
Cách làm A1: đọc `apiServer.js` và 4 file route, grep `source/server` để kiểm chứng auth, Idempotency-Key và masking. Không sửa file nào.

Ký hiệu trạng thái:
- **KHỚP**: đúng đường dẫn và method theo spec.
- **LỆCH-ĐƯỜNG**: có chức năng nhưng khác đường dẫn hoặc khác phạm vi so với spec.
- **THIẾU**: spec có, code không có.
- **MỘT PHẦN**: có nhưng thiếu hành vi spec yêu cầu (sẽ kiểm tra sâu ở A2).

## 1. Bảng kiểm kê: Passenger (29 dòng spec)

| Màn | Spec | Trạng thái | Ghi chú |
|---|---|---|---|
| PAX-001 | `GET /app/config` | KHỚP | Bị trùng với alias ở `apiServer.js:96` (xem FND-A03) |
| PAX-002 | `POST /auth/passenger/otp/request` | KHỚP | |
| PAX-003 | `POST /auth/passenger/otp/verify` | KHỚP | |
| PAX-004 | `GET /passenger/home-feed` | MỘT PHẦN | Dữ liệu cố định, `active_ticket` luôn `null` |
| PAX-005 | `GET /routes/stops/search` | KHỚP | Bị trùng alias `/stations` |
| PAX-006 | `GET /trips/search` | KHỚP | `GET /trips` bị alias ở `apiServer.js:108` chặn trước (FND-A03) |
| PAX-007 | `GET /trips/{id}` | MỘT PHẦN | Handler bắt cả các đường dẫn con chưa có (FND-A04) |
| PAX-008 | `GET /trips/{id}/stops` | THIẾU | Rơi vào handler PAX-007, trả về chi tiết chuyến |
| PAX-009 | `GET /trips/{id}/seat-map` | KHỚP | `pickup`/`dropoff` có giá trị mặc định cứng |
| PAX-010 | `POST /trips/{id}/seats/hold` | MỘT PHẦN | `userId` lấy từ body, không từ token. Không có Idempotency-Key |
| PAX-010 | `DELETE /trips/{id}/seats/hold` | THIẾU | CORS cho phép DELETE nhưng không có handler |
| PAX-011 | `GET /passenger/saved-travelers` | THIẾU | |
| PAX-012 | `POST /bookings/create` | LỆCH-ĐƯỜNG | Code tạo luôn cả đơn và payment trong một lệnh. Spec tách `bookings/create` và `payments/initiate` |
| PAX-013 | `POST /payments/initiate` | THIẾU | Gộp vào `bookings/create` |
| PAX-013 | `POST /passenger/payments/{id}/verify-status` | KHỚP | |
| PAX-014 | `GET /payments/{id}/status` | THIẾU | |
| PAX-015 | `GET /bookings/{id}` | THIẾU | |
| PAX-016 | `GET /passenger/tickets` | MỘT PHẦN | Lấy theo `phone` trong query, mặc định `0912345678`. Không xác thực (FND-A01) |
| PAX-017 | `GET /tickets/{id}` | KHỚP | Handler `/api/v1/tickets/` bắt mọi đường dẫn con |
| PAX-017 | `GET /passenger/orders/{id}/group-qr` | KHỚP | |
| PAX-017 | `POST /passenger/tickets/{id}/delegate` | KHỚP | |
| PAX-018 | `GET /trips/{id}/tracking` | KHỚP | |
| PAX-019 | `GET /trips/{id}/eta` | THIẾU | Rơi vào handler PAX-007 |
| PAX-020 | `GET /passenger/notifications` | MỘT PHẦN | Lấy `userId` từ header `x-user-id`, mặc định `usr_default` |
| PAX-021 | `POST /bookings/{id}/cancel` | LỆCH-ĐƯỜNG | Code hủy theo vé: `POST /passenger/tickets/{ticketId}/cancel` |
| PAX-022 | `GET /passenger/profile` | THIẾU | |
| PAX-023 | `POST /passenger/saved-travelers` | THIẾU | |
| PAX-024 | `GET /trips/{id}/replacement-info` | THIẾU | Rơi vào handler PAX-007 |
| PAX-025 | `GET /trips/{id}/disruptions` | THIẾU | Rơi vào handler PAX-007 |

Tổng: KHỚP 11, MỘT PHẦN 5, LỆCH-ĐƯỜNG 2, THIẾU 11.

## 2. Bảng kiểm kê: Driver (20 dòng spec)

| Màn | Spec | Trạng thái | Ghi chú |
|---|---|---|---|
| DRI-001 | `POST /auth/driver/login` | KHỚP | |
| DRI-002 | `GET /driver/trips/today` | MỘT PHẦN | Lấy `driverId` từ header `x-driver-id`, mặc định `drv_8821a` (FND-A01) |
| DRI-003 | `GET /driver/trips/{id}` | THIẾU | |
| DRI-004 | `POST .../readiness` | KHỚP | |
| DRI-005 | `POST .../start` | MỘT PHẦN | Không có Idempotency-Key |
| DRI-006 | MQTT `busgo/telemetry/{vehicleId}` | LỆCH-ĐƯỜNG | Code chỉ có REST `POST .../telemetry`. Không có MQTT (xem OQ-002) |
| DRI-007 | `GET .../manifest` | MỘT PHẦN | Route đọc trực tiếp `driverService.activeTrips`, không qua hàm của service |
| DRI-007 | `POST .../onboard-hail` | KHỚP | |
| DRI-008 | `POST .../stops/{stopId}/arrive` | THIẾU | |
| DRI-009 | `POST .../boarding` | KHỚP | Alias `/board-qr` thừa |
| DRI-010 | `POST .../boarding/manual` | MỘT PHẦN | Nhánh dùng `ticket_id` hoặc `seat_code` sửa trực tiếp manifest ngay trong route, không qua service và không phát sự kiện bridge (FND-A06) |
| DRI-011 | `POST .../tickets/{id}/no-show` | KHỚP | |
| DRI-012 | `POST .../payments/cod-collect` | KHỚP | Alias `/collect-cod` thừa |
| DRI-013 | `GET /routes/{id}/geometry` | THIẾU | |
| DRI-014 | Cục bộ | MỘT PHẦN | Code có `GET /driver/system/gps-health` trả dữ liệu cố định |
| DRI-015 | `POST /driver/telemetry/batch-replay` | KHỚP | |
| DRI-016 | `GET /driver/system/diagnostics-ping` | MỘT PHẦN | Trả dữ liệu cố định (độ trễ 18ms) |
| DRI-017 | `POST .../end` | KHỚP | |
| DRI-018 | `GET /driver/profile` | MỘT PHẦN | Trả hồ sơ cố định, không theo tài xế đăng nhập |
| DRI-019 | `POST .../incidents` | KHỚP | Alias `/incident` thừa |

## 3. Bảng kiểm kê: Manager (31 dòng spec)

| Màn | Spec | Trạng thái | Ghi chú |
|---|---|---|---|
| MGR-001 | `POST /auth/staff/login` | KHỚP | Không có 2FA như spec mô tả |
| MGR-002 | `GET /ops/dashboard/kpis` | KHỚP | |
| MGR-003 | `GET /ops/fleet/live-positions` | KHỚP | Alias `/ops/radar` thừa |
| MGR-004 | `GET /ops/vehicles/{id}/telemetry-trail` | THIẾU | Rơi vào handler `/ops/vehicles*`, trả cả danh sách xe (FND-A04) |
| MGR-005 | `GET /ops/vehicles` | MỘT PHẦN | Không phân trang hay lọc |
| MGR-006 | `POST/PUT /ops/vehicles` | THIẾU | |
| MGR-007 | `POST/PUT /ops/seat-layouts` | THIẾU | |
| MGR-008 | `GET /ops/routes` | KHỚP | |
| MGR-009 | `POST/PUT /ops/routes` | THIẾU | |
| MGR-010 | `GET /ops/trips` | LỆCH-ĐƯỜNG | Code trả bảng điều phối, không phải danh sách chuyến phân trang với bộ lọc |
| MGR-011 | `POST /ops/trips` | THIẾU | |
| MGR-012 | `GET /ops/trips/{id}/master` | LỆCH-ĐƯỜNG | Code dùng `/ops/trips/{id}` |
| MGR-013 | `GET /ops/trips/{id}/seat-matrix` | LỆCH-ĐƯỜNG | Code dùng `/seat-inventory`, không có khóa hay chặn ghế thủ công |
| MGR-014 | `GET /ops/dispatch/matrix` | KHỚP | Alias `/dispatch/board` thừa |
| MGR-015 | `GET /ops/drivers` | KHỚP | Alias `/ops/crew` thừa |
| MGR-016 | `GET /ops/drivers/{id}/performance` | THIẾU | Rơi vào handler `/ops/drivers*`, trả cả danh sách (FND-A04) |
| MGR-017 | `GET /ops/bookings` | MỘT PHẦN | Trả toàn bộ mảng trong bộ nhớ, không tìm kiếm theo PNR, SĐT, ngày. Có thể lộ SĐT |
| MGR-018 | `GET /ops/bookings/{id}` | MỘT PHẦN | Tìm theo `pnr` hoặc `trip_id`, nên một `trip_id` bất kỳ cũng trả về một đơn |
| MGR-019 | `GET /ops/pos/trips` | THIẾU | |
| MGR-020 | `POST /ops/pos/orders` | KHỚP | Alias `/pos/bookings` thừa. Không có Idempotency-Key |
| MGR-020 | `POST /ops/pos/hotline-hold` | KHỚP | |
| MGR-021 | `GET /ops/payments` | THIẾU | |
| MGR-022 | `POST /ops/refunds/{id}/process` | KHỚP | |
| MGR-023 | `POST .../replace-vehicle` | KHỚP | Alias `/swap-vehicle` thừa. Match bằng `includes`, không kiểm tra tiền tố |
| MGR-024 | `POST .../delay` | KHỚP | |
| MGR-025 | `GET /ops/alerts` | THIẾU | Dữ liệu alert đang được trả ở `/audit-logs` (FND-A05) |
| MGR-026 | `POST /ops/notifications/broadcast` | THIẾU | |
| MGR-027 | `GET /ops/reports/yield` | MỘT PHẦN | Cùng handler với `/reports/executive`, nội dung không phân biệt |
| MGR-028 | `GET /ops/audit-logs` | MỘT PHẦN | Trả `managerService.alerts`, không có actor, IP, before/after |
| MGR-029 | `POST/PUT /ops/rbac/roles` | THIẾU | |
| MGR-030 | `POST/PUT /ops/settings` | THIẾU | |

## 4. Endpoint có trong code nhưng không có trong spec

Các alias, tất cả đều là bản thừa của một đường dẫn đã có trong spec:
- Passenger: `/passenger/config`, `/passenger/auth/request-otp`, `/passenger/auth/verify-otp`, `/passenger/stations`, `/passenger/trips`, `/passenger/trips/{id}/seat-map`, `/passenger/trips/{id}/hold-seats`, `/passenger/trips/{id}/radar`, `/stations`, `/trips`, `/passenger/bookings/create`, `/passenger/checkout/create-order`, `/passenger/tickets/{id}/qr`.
- Driver: `/driver/auth/login`, `/board-qr`, `/collect-cod`, `/incident`.
- Manager: `/ops/auth/login`, `/ops/radar`, `/ops/fleet`, `/ops/crew`, `/ops/dispatch/board`, `/ops/pos/bookings`, `/ops/trips/{id}/swap-vehicle`.

Endpoint thực sự mới (không có trong spec):
- `POST /passenger/tickets/{ticketId}/cancel` (spec dùng cấp booking).
- `GET /ops/trips/{id}/seat-inventory`, `GET /ops/trips/{id}` (spec dùng `seat-matrix` và `master`).
- `POST /api/v1/webhooks/vietqr/ipn`, `GET /health`, `GET /api/v1/openapi.json` (hạ tầng; webhook VietQR có tên trong code nhưng không có dòng riêng trong `api-screen-map`).

## 5. Phát hiện sơ bộ từ A1 (cần xác minh sâu ở A2 trước khi sửa)

| ID | Phát hiện | Phân loại sơ bộ | Mức |
|---|---|---|---|
| FND-A01 | **Không có xác thực hay phân quyền.** Server cấp token (`pax_jwt_*`, `drv_jwt_*`) nhưng không có chỗ nào kiểm tra `Authorization`. Danh tính lấy từ body, query hoặc header tự khai (`phone`, `x-driver-id`, `x-user-id`, `userId`). Spec yêu cầu Bearer và RBAC ở hầu hết endpoint. Bất kỳ ai gọi API cũng đọc được vé theo số điện thoại bất kỳ, hoặc gọi endpoint quản lý | Code sai | Cao |
| FND-A02 | **Không có Idempotency-Key.** Spec yêu cầu ở khoảng 20 endpoint POST (giữ ghế, tạo booking, thanh toán, bắt đầu và kết thúc chuyến, COD, POS, refund...). Code không xử lý. Gọi lại có thể tạo đơn hoặc thu COD hai lần | Code sai | Cao |
| FND-A03 | **Alias ở `apiServer.js:96-114` chặn trước route handler** cho `/app/config`, `/stations`, `/trips`. Hành vi lệch nhau: `GET /api/v1/trips` bỏ qua `vehicle_type`, `time_slot` và trả JSON không bọc `status/data`, trong khi `/trips/search` thì có lọc và có bọc | Code sai | Trung bình |
| FND-A04 | **Handler dùng `startsWith` quá rộng.** Đường dẫn con chưa triển khai (PAX-008, 019, 024, 025; MGR-004, 016) trả về dữ liệu của endpoint cha thay vì 404, nên client nhận dữ liệu sai mà không biết | Code sai | Trung bình |
| FND-A05 | **Alert và audit log bị nhập một.** `/ops/audit-logs` trả `managerService.alerts`. Spec tách MGR-025 (alerts feed) và MGR-028 (audit log bất biến, có actor, IP, diff) | Cả hai (cần xem spec MGR-025 và MGR-028) | Trung bình |
| FND-A06 | **Logic nghiệp vụ nằm trong tầng route.** Check-in thủ công (DRI-010) và manifest (DRI-007) thao tác thẳng `driverService.activeTrips`. Nhánh check-in thủ công không phát sự kiện `PASSENGER_BOARDED`, nên ví hành khách và dashboard quản lý không được cập nhật | Code sai | Cao |
| FND-A07 | **Nhiều endpoint spec chưa có** (26 dòng THIẾU trên 3 bảng, kể cả các endpoint ghi của Manager như POST vehicles, routes, trips, seat-layouts, rbac, settings). Cần quyết định từng mục: triển khai tối thiểu hoặc rút khỏi spec (YAGNI) | Cả hai | Cao |
| FND-A08 | **Đường dẫn và khái niệm lệch spec** ở các điểm: booking và payment gộp (PAX-012, 013), hủy theo vé thay vì theo booking (PAX-021), MGR-012 và 013 tên khác, MQTT chỉ có trên giấy (DRI-006) | Cả hai | Trung bình |
| FND-A09 | **Dữ liệu cố định trả lời như thật**: `home-feed`, `driver/profile`, `gps-health`, `diagnostics-ping`. Mặc định cứng trong route (`stp_hn_gb`, `trp_hn_th_01`, `usr_guest`, `usr_default`) che lỗi thiếu tham số | Cả hai | Trung bình |
| FND-A10 | **`openapi.json` chỉ mô tả 8 trong khoảng 70 endpoint** | Code sai | Thấp |
| FND-A11 | **`MGR-018` tìm theo `trip_id`** ngoài `pnr`, có thể trả nhầm đơn | Code sai | Thấp |
| FND-A12 | **`MGR-001` thiếu 2FA** theo mô tả spec | Cần xem spec MGR-001 | Thấp |

## 6. Số liệu tổng hợp A1

| Nhóm | Dòng spec | KHỚP | MỘT PHẦN | LỆCH-ĐƯỜNG | THIẾU |
|---|---|---|---|---|---|
| Passenger | 29 | 11 | 5 | 2 | 11 |
| Driver | 20 | 9 | 7 | 1 | 3 |
| Manager | 31 | 11 | 5 | 3 | 12 |
| **Tổng** | **80** | **31** | **17** | **6** | **26** |

Một "dòng spec" là một cặp màn hình và endpoint trong `api-screen-map.md`. Dòng ghi `POST/PUT` được đếm là một dòng.

## 7. Việc tiếp theo

- **A2**: đọc từng file `PAX-*`, `DRI-*`, `MGR-*` và đối chiếu với service để xác minh FND-A01 đến A12 và tìm thêm lỗi nghiệp vụ.
- Chưa sửa gì. Các quyết định về spec (đường dẫn chuẩn, endpoint nào giữ, endpoint nào rút) sẽ ở A5.

---

# A2: Review quy tắc nghiệp vụ (phần 1: Passenger lõi)

Đã đọc: `seatMap.js`, `payment.js`, `cryptoEngine.js`, `tracking.js`, `checkout.js`, `auth.js`, `formatters.js`, `fleetBusEventBridge.js`, và spec `PAX-012`, `PAX-021`.
Mức: **C** = cao (tiền, vé, ghế, QR, bảo mật), **T** = trung bình, **L** = thấp.

## Tiền và thanh toán

| ID | Phát hiện | Phân loại | Mức |
|---|---|---|---|
| FND-A13 | **Giá do client quyết định.** `passengerRoutes.js` lấy đơn giá từ `body.unitPriceVnd` và `selectedSeats[].price_vnd`. Gửi `unitPriceVnd: 1` thì đơn chỉ còn 1 đ cộng bảo hiểm. `holdSeats` cũng cố định `220000`/ghế, không theo giá ghế hay đoạn đường | Code sai | C |
| FND-A14 | **Webhook VietQR không kiểm số tiền, không kiểm chữ ký.** `handleVietQrCallback` bỏ qua `amountVnd`. CORS có `X-Signature` nhưng không đọc. Ai biết PNR đều gọi được webhook để xuất vé miễn phí | Code sai | C |
| FND-A15 | **Nút "Tôi đã chuyển tiền" tự xác nhận đã thanh toán.** `checkPaymentStatus` với `manualTrigger` gọi thẳng `settlePayment`, không hỏi ngân hàng. POST `verify-status` với `manualTrigger:true` là có vé | Cả hai (spec REV-02/OQ-011 viết "trigger" chưa nói rõ chỉ là yêu cầu đối soát) | C |
| FND-A16 | **Tạo đơn không kiểm tra giữ ghế.** `holdId` lấy từ body hoặc `hld_${tripId}` giả, không xác minh hold có thật, thuộc về người đặt, còn hạn và đủ ghế. Có thể đặt ghế đã BOOKED hoặc ghế người khác đang giữ, dẫn tới bán trùng ghế. Event `TICKET_SETTLED` gọi `confirmBooking` mà không kiểm tra gì | Code sai | C |
| FND-A17 | **Cửa sổ thanh toán và hold lệch nhau.** Đơn hết hạn sau 10 phút kể từ lúc tạo đơn, còn hold hết sau 10 phút kể từ lúc giữ. Người dùng có thể thanh toán sau khi hold đã hết và ghế bị người khác giữ. OQ-008 yêu cầu `UNMATCHED_OVERDUE` kèm hoàn tiền hoặc đặt lại, nhưng code chỉ trả lỗi `PAYMENT_EXPIRED` và tiền đã nhận không có dấu vết | Cả hai | C |
| FND-A18 | **Sai bậc hoàn tiền so với spec.** Spec PAX-021: từ 12h trở lên hoàn 100%, 6 đến 12h hoàn 80%, dưới 6h hoàn 0%. Code: từ 24h 100%, 12 đến 24h 50%, dưới 12h 0%. Ví dụ AC-001 của spec (14h, hoàn 100%, 176.000 đ) bị code trả 50% | Code sai | C |
| FND-A19 | **Hủy vé tin vào client.** `cancelTicketAndComputeRefund` dùng `departureTime` trong body (gửi ngày xa để được hoàn 100%), giá cố định `220000` thay vì giá vé đã trả, không kiểm vé có tồn tại, không đổi `status`, không chặn vé đã BOARDED hoặc đã hủy. Gọi nhiều lần sẽ hoàn tiền nhiều lần | Code sai | C |
| FND-A20 | **Hủy vé không qua duyệt hoàn tiền.** Spec: tạo yêu cầu `REFUND_REQUESTED`, trạng thái `PROCESSING`, quản lý duyệt ở MGR-022. Code: trả `CANCELLED_AND_REFUNDED` ngay | Cả hai (cần chốt luồng) | T |
| FND-A21 | **Bảo hiểm tự chọn sẵn.** `insuranceSelected = true` mặc định, cộng 10.000 đ/khách mà người dùng không chọn. Voucher sai bị bỏ qua im lặng, trong khi spec yêu cầu thông báo "Mã không hợp lệ hoặc đã hết lượt" | Code sai | T |
| FND-A22 | **PNR và `ticket_id` có thể trùng.** PNR sinh ngẫu nhiên 6 chữ số, không kiểm trùng; `pnrIndex` bị ghi đè nên webhook có thể xuất vé cho nhầm đơn. `handleVietQrCallback` khớp bằng `includes`, nên PNR này nằm trong chuỗi PNR khác vẫn khớp | Code sai | T |
| FND-A23 | **Tầng (deck) tính sai.** `settlePayment` coi `B06` đến `B09` là tầng 1, trong khi layout đặt chúng ở tầng 2 | Code sai | L |

## Vé, QR và lên xe

| ID | Phát hiện | Phân loại | Mức |
|---|---|---|---|
| FND-A24 | **Chữ ký QR không bao giờ được kiểm tra.** `verifyDynamicTicketQR` và `verifyGroupBoardingQR` đọc `scannedHmac` nhưng không so sánh, và không dùng `secretKey`. Chuỗi `BUSGO\|<pnr>\|<ticketId>\|<cửa sổ hiện tại>\|bất-kỳ` được chấp nhận. Mã QR nhóm giả có thể cho lên xe hàng loạt ticketId tùy ý | Code sai | C |
| FND-A25 | **Logic lên xe bị nhân đôi.** `paymentService.validateAndBoardTicket` không so `ticket.trip_id` với chuyến của tài xế, nhưng route thật gọi `driverService.boardPassengerByQR` (có kiểm tra theo manifest của chuyến), nên đường này hiện chỉ dùng trong test. Hai bản logic lệch nhau sẽ gây lỗi khi ai đó nối nhầm | Code sai | T |
| FND-A26 | **Nhánh QR nhóm và PIN không phát sự kiện `PASSENGER_BOARDED`** và QR nhóm không chặn vé đã lên xe. Dashboard quản lý và ví khách không cập nhật | Code sai | C |
| FND-A27 | **Xác thực offline (REV-03) chưa nối vào luồng.** `generateOfflineSignedTicket` và `verifyOfflineSignedTicket` tồn tại nhưng không được gọi, nên fallback JSON ký tĩnh mà OQ-012 đã chốt không hoạt động | Code sai | T |
| FND-A28 | **Bí mật ký mã cứng trong source** (`busgo_master_secret_key_2026`, `busgo_ticket_master_secret`). Token đăng nhập (`pax_jwt_*`) là base64 của số điện thoại và thời gian, không ký, ai cũng tự tạo được | Code sai | C |
| FND-A29 | **Ví vé khớp theo chuỗi con.** `getTicketsByPhone` dùng `includes`, nên `phone=` rỗng hoặc `0` trả về vé của tất cả mọi người. Route còn mặc định `phone=0912345678` | Code sai | C |
| FND-A30 | **`getDynamicBoardingPass` và `delegateTicket` không kiểm quyền sở hữu** và trả cả số điện thoại đầy đủ trong đối tượng vé | Code sai | C |

## Giữ ghế, GPS, OTP

| ID | Phát hiện | Phân loại | Mức |
|---|---|---|---|
| FND-A31 | **Giữ ghế:** spec BR-SEAT-003 giới hạn 5 ghế mỗi đơn, nhưng code chỉ giới hạn 5 ghế mỗi lần gọi hold, nên giữ lặp được vô hạn. Gọi lại hold cho cùng ghế ghi đè và kéo dài hạn vô thời hạn. `locked_by_user` lộ `userId` cho người khác. `confirmBooking` tự tạo layout mẫu cho bất kỳ `tripId` nào | Code sai | T |
| FND-A32 | **GPS:** chuyến chưa có telemetry vẫn trả vị trí bịa (`52.4 km/h IN_TRANSIT`) với dấu thời gian là hiện tại nên không bao giờ stale. REV-07 cần trạng thái "mất tín hiệu". Điểm đón mặc định là toạ độ cố định, không theo điểm đón của khách | Code sai | T |
| FND-A33 | **OTP:** `mock_otp` luôn trả về trong response (kể cả production), số `0912345678` luôn có OTP `882199`. Tên hàm route gọi `requestOtp`/`verifyOtp` nhưng service định nghĩa `requestOTP`/`verifyOTP`, cần xác minh luồng chạy thật | Code sai | C |
| FND-A34 | **Thông báo tra cứu theo số điện thoại**, nhưng route truyền `x-user-id` (mặc định `usr_default`), nên thông báo gần như không bao giờ đến đúng người trừ khi client gửi số điện thoại trong header đó | Code sai | T |

## Quyết định BA (D7 đến D14), áp dụng quyền D5

Bạn đã nhắn "tự động đưa ra ý kiến". Dưới đây là quyết định của tôi. Bạn có thể đảo lại khi quay lại.

| # | Quyết định | Đã cân nhắc | Lý do |
|---|---|---|---|
| D7 | Webhook VietQR phải xác minh chữ ký (HMAC trong `X-Signature`) và số tiền khớp đúng. Sai số tiền: đánh dấu `AMOUNT_MISMATCH`, không xuất vé. Đơn quá hạn hoặc hold mất: `UNMATCHED_OVERDUE` kèm yêu cầu hoàn tiền (theo OQ-008) | Chỉ kiểm số tiền | Chữ ký ngăn giả mạo, số tiền ngăn thanh toán thiếu |
| D8 | "Tôi đã chuyển tiền" chỉ kích hoạt đối soát ngay với ngân hàng. Nếu chưa thấy tiền, trả `PENDING` kèm thông báo, không tự xác nhận. Cập nhật spec PAX-013 và OQ-011 | Giữ nguyên tự xác nhận | Giữ nguyên là lỗ hổng xuất vé miễn phí. Trong môi trường mock, đối soát được mô phỏng bằng webhook |
| D9 | Giá luôn tính ở server từ giá chuyến và giá ghế. Mọi trường giá client gửi bị bỏ qua | Cho client gợi ý giá | Giá là dữ liệu tin cậy duy nhất |
| D10 | Tạo đơn bắt buộc có `hold_id` hợp lệ, thuộc người đặt, còn hạn, khớp đúng bộ ghế. Khi tạo đơn, hold được gia hạn thành khóa thanh toán 10 phút để không bị bán trùng | Chỉ kiểm hold | Gia hạn khóa giải quyết luôn FND-A17 |
| D11 | Chữ ký QR phải so sánh bằng `timingSafeEqual` trên toàn bộ HMAC. Vé phải thuộc đúng `trip_id`. Mọi nhánh lên xe (QR đơn, nhóm, PIN, offline) đi qua cùng một hàm và đều phát `PASSENGER_BOARDED` | Chỉ sửa QR đơn | Một đường duy nhất tránh bỏ sót |
| D12 | Bậc hoàn tiền theo đúng spec (≥12h: 100%, 6 đến 12h: 80%, <6h: 0%). Lấy giá và giờ khởi hành từ vé trong hệ thống. Hủy idempotent, đổi `status`, chặn vé đã lên xe. Tạo yêu cầu hoàn tiền `REFUND_REQUESTED` để quản lý duyệt (MGR-022), phù hợp với spec | Đổi spec theo code | Spec nhất quán nội bộ, ví dụ AC-001 đã khớp. Code là bên sai |
| D13 | Tra cứu vé và thông báo chỉ theo danh tính từ token (khớp chính xác), không dùng chuỗi con hay giá trị mặc định | Giữ tham số `phone` | Ngăn rò rỉ dữ liệu cá nhân |
| D14 | Thêm middleware xác thực: token ký HMAC có vai trò và hạn dùng, kiểm ở mọi endpoint không public theo cột Auth của `api-screen-map`. Thêm middleware Idempotency-Key (bộ nhớ trong, TTL 24h) cho các POST mà spec đánh dấu Yes. Bí mật lấy từ biến môi trường, có giá trị dev riêng khi chạy test | Chỉ sửa từng endpoint | Một chỗ kiểm duy nhất, dễ test |

Ngoài ra tôi cũng sẽ **bỏ `mock_otp` khỏi response** khi `NODE_ENV=production` (FND-A33) và giữ nó ở môi trường dev/test.


## Bằng chứng chạy thật (probe, không sửa code)

Đã chạy server trong tiến trình thử nghiệm và gọi API thật. Kết quả:

| Kiểm tra | Kết quả thực tế |
|---|---|
| `POST /auth/passenger/otp/request` | **400** `authService.requestOtp is not a function` (service định nghĩa `requestOTP`). Đăng nhập OTP qua HTTP đang hỏng, và test hiện có chỉ gọi thẳng service nên không phát hiện |
| `bookings/create` với `unitPriceVnd: 1`, `holdId: "fake"` | **201**, tổng tiền **10.001 đ** (ghế 220.000 đ). Không cần hold thật |
| `verify-status` với `manualTrigger: true` | **PAID** và xuất vé ngay, không có thanh toán |
| `GET /passenger/tickets?phone=` (rỗng) | **200**, trả về vé của người khác |
| Quét QR `BUSGO\|BG-88219\|tkt_88219_A01\|<cửa sổ>\|deadbeefdeadbeef` | **200**, "Trần Văn Hùng" lên xe bằng chữ ký giả |
| Hủy vé hai lần với `departureTime` xa | Hoàn **220.000 đ** cả hai lần |
| `GET /ops/bookings` không token | **200**, lộ số điện thoại đầy đủ (`0981112233`) |
| `GET /trips/{id}/eta` (endpoint chưa có) | **200**, trả chi tiết chuyến thay vì 404 |
| Manifest chuyến `trp_hn_th_01` sau khi khách thanh toán | Số điện thoại đầy đủ **`RAW:0987654321`** hiện trên màn hình tài xế, trái OQ-007 |
| POS bán ghế `A02` hai lần (đã có khách đặt online) | **201** cả hai |
| Giữ chỗ hotline ghế `B02`, rồi khách online giữ cùng ghế | Hotline **201**, online hold **200** (hotline không khóa ghế) |
| COD thu hai lần cho cùng vé, `fare_amount_vnd: 1000` do client gửi | Cả hai **200**. Tổng COD ghi nhận 221.000 đ (cộng dồn 2 lần, cộng cả mức giá do client tự đặt) |
| COD `WALLET_CREDIT` với 500.000 đ cho vé 220.000 đ | Ghi `change_due_vnd: 280000`, nhưng không có bút toán ví nào |
| `end` chuyến chưa bắt đầu, gọi hai lần | **200**, trạng thái `COMPLETED`, phát sự kiện hai lần |
| `refunds/does_not_exist/process` với `approved:false` | **200** "Đã xử lý hoàn tiền" cho một mã không tồn tại |
| `replace-vehicle` với biển số `ZZZ-NOT-REAL` | Chấp nhận, thay bằng xe bịa `29B-888.22` |

## A2 phần 2: Driver và Manager

| ID | Phát hiện | Phân loại | Mức |
|---|---|---|---|
| FND-A35 | **Đăng nhập OTP hành khách hỏng qua HTTP.** Route gọi `requestOtp`/`verifyOtp`, service định nghĩa `requestOTP`/`verifyOTP` | Code sai | C |
| FND-A36 | **QR đơn khớp theo PNR.** `boardPassengerByQR` tìm `m.ticket_id === id \|\| m.pnr === pnr`, nên PNR đúng nhưng `ticket_id` sai vẫn cho người đầu tiên của PNR lên xe, có thể sai người, sai ghế | Code sai | C |
| FND-A37 | **Nhánh QR nhóm, PIN và offline của tài xế không phát `PASSENGER_BOARDED`**, và `manualBoarding` trong route sửa dữ liệu trực tiếp (xem FND-A06). Chỉ nhánh QR đơn phát sự kiện | Code sai | C |
| FND-A38 | **Lộ số điện thoại đầy đủ cho tài xế.** Vé tạo qua event bridge (`TICKET_SETTLED`, `POS_BOOKING_CREATED`) đưa `passenger_phone` thô vào manifest, và route `manifest` trả nguyên mảng. Dữ liệu mẫu thì dùng `phone_masked` nên dễ bị che khuất | Code sai | C |
| FND-A39 | **COD:** không kiểm tra vé có phải COD, không chặn thu hai lần, chấp nhận thu thiếu tiền như thành công, `fare_amount_vnd` do client quyết định, `change_settlement_method` không kiểm giá trị. `WALLET_CREDIT` không có bút toán ví, `REST_STOP_DEBT_RECEIPT` không có sổ nợ để tất toán (FLOW-03), mã biên lai `DR-<6 ký tự cuối>-<K>` có thể trùng. Thu COD không phát sự kiện nên trạng thái thanh toán và doanh thu quản lý không cập nhật (OQ-003) | Cả hai | C |
| FND-A40 | **Đón khách vẫy (REV-05):** chỉ kiểm ghế trong manifest, không kiểm kho ghế (ghế đã bán, hotline giữ), không khóa ghế trong seat map, không cập nhật doanh thu quản lý, giá và số tiền thu do client gửi, không yêu cầu `seat_code`, không kiểm chuyến đang chạy, SĐT mặc định bịa `0901234567` | Code sai | C |
| FND-A41 | **Vòng đời chuyến không có máy trạng thái chặt.** `endTrip` chạy được ở bất kỳ trạng thái nào và nhiều lần, bỏ qua đối soát (DRI-017: manifest, COD, vé vẫy). `startTrip` cho phép `DISPATCHED` bỏ qua phiếu kiểm tra xe. `recordTelemetry` nhận cả chuyến chưa chạy, không validate `lat/lng` | Code sai | C |
| FND-A42 | **`getTodayTrips` bỏ qua `driverId`**: mọi tài xế thấy mọi chuyến. Đăng nhập tài xế không khóa theo số lần sai, PIN lưu dạng thô | Code sai | C |
| FND-A43 | **No-show (DRI-011) không kiểm thời gian ân hạn**, không chặn vé đã lên xe, không nhả ghế | Code sai | T |
| FND-A44 | **Replay telemetry:** không sắp theo thời gian (bản ghi cũ có thể ghi đè bản mới), không khử trùng lặp, `offlineQueue` không bao giờ xả nên `buffered_offline_count` tăng mãi | Code sai | T |
| FND-A45 | **POS (MGR-020) không kiểm ghế.** Không kiểm ghế tồn tại hay còn trống, không giới hạn sức chứa, không idempotent, `payment_method` không kiểm, luôn `PAID`. Vé POS gắn `departure_time` là thời điểm hiện tại và tên tuyến chung chung nên hủy vé ra 0% | Code sai | C |
| FND-A46 | **Giữ chỗ hotline (REV-06) không khóa ghế và không tự nhả.** Chỉ tăng bộ đếm `booked_seats`, không kiểm ghế, không đưa vào seat map. `releaseExpiredHotlineHolds` không có nơi nào gọi nên không có cơ chế nhả tự động. Không có đường chuyển hold thành vé khi khách đến | Code sai | C |
| FND-A47 | **Đổi xe (MGR-023):** biển số lạ bị thay bằng xe bịa, không kiểm xe còn rảnh và đủ ghế (OQ-005), `newDriverId` bị bỏ qua, thông báo "đã remap ghế và gửi SMS" nhưng không làm, trạng thái xe cũ và mới không đổi | Code sai | C |
| FND-A48 | **Duyệt hoàn tiền là hàm rỗng.** `processRefundApproval` luôn trả thành công, kể cả mã không tồn tại hay `approved:false`. Không có hàng đợi yêu cầu hoàn tiền nên MGR-021/022 không có dữ liệu để duyệt | Cả hai | C |
| FND-A49 | **Doanh thu và báo cáo:** KPI cộng cả đơn đã hoàn tiền, `on_time_departure_rate`, `fleet_average_speed`, `pos_share` và `app_share` là hằng số, báo cáo bỏ qua `start_date`/`end_date` | Code sai | T |
| FND-A50 | **Event bridge rơi về chuyến đầu tiên.** Khi `tripId` không có, 7 handler dùng `activeTrips.values()[0]` hoặc `managerService.trips[0]`, nên vé, thông báo và số liệu bị gán nhầm chuyến. `TICKET_CANCELLED` không giảm `booked_seats` của quản lý | Code sai | C |
| FND-A51 | **Đăng nhập quản lý:** so mật khẩu thô, không khóa theo số lần sai, không 2FA, token không ký. Vai trò trong code (`FLEET_DIRECTOR`, `DISPATCHER`...) chưa khớp tên vai trò trong spec (`ROLE_OPS_ADMIN`) | Cả hai | C |
| FND-A52 | **`findTrip` tự tạo chuyến** `trp_hn_th_01` khi không có, nên chuyến "tồn tại" theo yêu cầu | Code sai | T |


---

# Trạng thái xử lý (cập nhật sau Lô 1a)

Kiểm thử: `npm test` 125/125 pass, `npm run lint` sạch, `npm run e2e` thành công. Test mới: `test/server/spec_conformance_money_tickets.test.js` (14 test, đã thấy fail đúng lý do trước khi sửa).

| Trạng thái | Phát hiện |
|---|---|
| **Đã sửa (code, test, spec)** | A13, A14, A15, A16, A17 (một phần: giữ ghế gia hạn và đơn quá hạn thành `UNMATCHED_OVERDUE`), A18, A19, A20, A21, A22, A23, A24, A25 (đường dẫn thật), A26 và A37 (mọi nhánh lên xe phát sự kiện), A27 (offline nối vào luồng, kiểm chuyến), A28 (khóa từ môi trường), A29, A33, A35, A36, A48 |
| **Còn mở trong giai đoạn A** | A01, A02 (D15: triển khai theo hai giai đoạn), A03, A04, A05, A06 (phần còn lại), A07, A08, A09, A10, A11, A12, A30, A31, A32, A34, A38, A39, A40, A41, A42, A43, A44, A45, A46, A47, A49, A50, A51, A52 |


## Cập nhật sau Lô 1b

Kiểm thử: `npm test` 136/136 pass, lint sạch, `npm run e2e` thành công. Test mới: `test/server/spec_conformance_driver_manager.test.js` (11 test, 10 test đã thấy fail đúng lý do trước khi sửa; TC-SPEC-A52 đã pass từ đầu vì chuyến bịa chỉ có cho một mã, nên nó đóng vai trò đặc tả lại hành vi).

Đã xử lý thêm: A38, A39, A40 (phần giá, ghế, chuyến đang chạy, ví; kiểm kho ghế còn ở Lô 1c), A41, A42, A47, A50, A52. Còn mở: A01, A02, A03, A04, A05, A06 (manifest đọc trực tiếp đã sửa; phần còn lại xem A07), A07 đến A12, A30, A31, A32, A34, A40 (kho ghế), A43, A44, A45, A46, A49, A51.


## Cập nhật sau Lô 1c-i

Kiểm thử: `npm test` 144/144 pass, `npm run lint` kiểm 47 file (đã chứng minh bắt được file lỗi), `npm run e2e` thành công. Test mới: `test/server/spec_conformance_inventory.test.js` (8 test, cả 8 đã thấy fail đúng lý do trước khi sửa).

| ID | Phát hiện mới | Mức |
|---|---|---|
| FND-A53 | **`npm run lint` không kiểm tra gì ngoài file đầu tiên.** `node --check a.js b.js` chỉ kiểm `a.js` và thoát 0 dù `b.js` lỗi cú pháp (đã chạy thử). Mọi khẳng định "lint 100% clean" trong `STATE.md` đều không có giá trị. Đã thay bằng `tools/lint.js` kiểm từng file | T |

Đã xử lý thêm: A31, A40 (kho ghế), A45, A46, A53. Còn mở: A01, A02, A03, A04, A05, A06, A07 đến A12, A30, A32, A34, A43, A44, A49, A51.


## Cập nhật sau Lô 2 (xác thực)

Kiểm thử: `npm test` 152/152 pass, `npm run lint` kiểm 51 file, `npm run e2e` thành công. Test mới: `test/server/spec_conformance_auth.test.js` (8 test). Các test này được viết trước khi cài đặt nhưng chưa chạy ở trạng thái đỏ (module `tokens.js` chưa tồn tại lúc viết, nên chúng chỉ lỗi import). Độ nhạy được kiểm bằng cách chạy lại cùng bộ test với `authMode: 'off'`: 6 trong 7 test đỏ; test khóa tài khoản không phụ thuộc chế độ nên vẫn xanh. TC-SPEC-A51b (403 bằng lái hết hạn) đã đỏ rồi xanh đúng thứ tự.

Đã xử lý: A01 và A02 (phía server, theo D45 còn chờ app), A03, A28 (token ký), A30, A34, A42 (theo token), A51 (băm, khóa tài khoản; thiếu 2FA là A12 còn mở).

**Khoảng trống còn lại phải nêu rõ:** ở môi trường dev (`FLEETBUS_AUTH=off` mặc định) xác thực **không bật**. Các app Flutter hiện không gửi token hay Idempotency-Key. Đến khi giai đoạn B cập nhật client và đổi mặc định, API ở dev vẫn như cũ.


## Cập nhật sau Lô 1c-ii

Kiểm thử: `npm test` 156/156 pass, `npm run lint` kiểm 52 file, `npm run e2e` thành công. Test mới: `test/server/spec_conformance_ops_rules.test.js` (4 test, cả 4 đã thấy fail đúng lý do trước khi sửa).

Đã xử lý: A43, A44, A49. Còn mở: A04, A05, A06 (còn nhỏ), A07 đến A12, A32.


---

# Tổng kết Giai đoạn A

Kiểm thử cuối: `npm test` **165/165 pass** (trước giai đoạn: 112), `npm run lint` kiểm **54 file** (trước: thực chất 1 file), `npm run e2e` thành công. Sáu file test mới `test/server/spec_conformance_*.test.js` thêm 54 test (không tính các test cũ đã sửa).

## Kết quả theo phát hiện (53 mục)

| Trạng thái | Phát hiện |
|---|---|
| **Đã sửa** (code, test và spec) | A03, A04, A05, A06, A08, A10, A11, A13 đến A24, A26 đến A31, A33 đến A52 (trừ ghi chú bên dưới), A53 |
| **Đã sửa một phần** | A01, A02: phía server xong, mặc định `off` ở môi trường dev cho đến khi app Flutter gửi token (D45). A07: 10 endpoint đã làm, 16 hoãn có lý do (D55). A09: hồ sơ tài xế đã sửa, `gps-health`, `diagnostics-ping` và `home-feed` vẫn là dữ liệu mô phỏng. A51: có băm, khóa tài khoản, nhật ký, thiếu 2FA |
| **Còn mở có chủ đích** | A12 (2FA TOTP, `OQ-027`), A25 (`paymentService.validateAndBoardTicket` là bản logic lên xe thừa, chỉ test dùng; để lại vì test hiện có phụ thuộc), A32 (điểm đón mặc định vẫn là toạ độ cố định, chưa có toạ độ điểm dừng), `OQ-028` (nhả ghế khi vắng mặt cần mô hình đoạn đường) |

## Việc bắt buộc ở Giai đoạn B (Flutter) (đã xử lý: xem `phase-B-findings.md`)

1. Gửi token Bearer và `Idempotency-Key` ở các POST đánh dấu `Yes`, rồi đổi mặc định `FLEETBUS_AUTH` sang `enforce` ở mọi môi trường (D45, `OQ-022`).
2. Gửi `holdId` (và `userId` cho đến khi dùng token) khi tạo đơn; đọc `status: REFUND_REQUESTED`; gọi ví vé bằng token thay vì `?phone=`; gửi `trip_id`, `seat_codes` khi đặt vé.
3. Chuyển sang đường dẫn chuẩn và bỏ các alias liệt kê ở `api-screen-map` mục 5.
4. Màn hình theo các quy tắc đã đổi: hiển thị lỗi `HOLD_INVALID`, `AMOUNT_MISMATCH`, `ACCOUNT_LOCKED`, `NO_SIGNAL`, các mã lỗi COD và vé vẫy.

## Giới hạn của kết quả này

- Chỉ có test tự động của server. Không có gì chạy trên Flutter hay thiết bị.
- Dữ liệu vẫn là mock trong bộ nhớ, một tiến trình.
- Không có kiểm tra bảo mật độc lập: các lỗi bảo mật được sửa là những lỗi tìm thấy khi đọc code.
