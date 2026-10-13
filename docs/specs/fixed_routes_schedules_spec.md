# Tuyến cố định, lịch chạy hằng ngày và đón/trả linh hoạt — bản áp dụng cho BusGo

| | |
|---|---|
| Nguồn | `docs/specs/fixed_routes_schedules_spec_v1_source.md` (bản gốc tiếng Anh, giữ nguyên văn) |
| Phạm vi | App hành khách, app tài xế, web điều hành, API server |
| Trạng thái | Đã áp dụng 2026-10-12, quyết định `D130`–`D134` |
| Liên quan | `docs/specs/pickup_dropoff_spec.md` (đón/trả, theo dõi xe), `D121` (ngày đi), `D128`–`D129` (lịch chạy, cửa sổ 2 tuần) |

Spec gốc chỉ nói quy tắc nghiệp vụ, không quy định kỹ thuật (§11). Phần lớn đã có trong sản phẩm qua các đợt trước; tài liệu này ghi **chỗ nào đã có, chỗ nào mới làm, chỗ nào điều chỉnh**, và những gì còn để sau. Khi hai bản khác nhau, **bản này là bản được thực hiện**.

## 1. Kết quả rà soát

| Mục spec gốc | Trước đợt này | Đợt này |
|---|---|---|
| §2.1–2.2 Tuyến, điểm dừng có thứ tự, chặng hợp lệ, không đi ngược chiều | Có (`INVALID_SEGMENT`, `STOP_NOT_ALLOWED`, D122–D123) | Giữ nguyên |
| §2.3 Tuyến tạm ngừng không nhận đặt mới | **Thiếu** | Thêm `sales_suspended` theo tuyến (D132) |
| §2.3 Tắt điểm dừng không làm mất vé đã bán | Có một phần: vé giữ bản chụp điểm, chặng ghế tính theo vị trí (D123) | Chưa báo khách có vé ở điểm vừa tắt (mục 5) |
| §3.1 Nhiều giờ chạy cố định mỗi ngày | Có (D128) | Giữ nguyên |
| §3.2 Chuyến của một ngày chỉ bán khi đang mở bán, chưa hủy | Thiếu trạng thái hủy và ngừng bán theo ngày | Thêm (D131) |
| §3.4 Hủy chuyến, ngừng bán, chuyến tăng cường | Chỉ có báo trễ, đổi xe/tài xế, ngừng lịch từ ngày +15 | Thêm hủy chuyến, ngừng/mở bán (D131), chuyến tăng cường (D134) |
| §4.1 Đón tận nhà trong vùng phục vụ, phụ phí, khung giờ | Có (D118, `pickup_dropoff_spec.md`) | Giữ nguyên |
| §4.2–4.3 Xác nhận tự động hoặc nhà xe duyệt; chờ duyệt không được hiện như đã xác nhận | **Thiếu**: mọi địa chỉ trong vùng được nhận ngay | Thêm duyệt (D130) |
| §4.4 Phụ phí báo trước khi thanh toán | Có | Thêm báo "cần nhà xe duyệt" trước khi chuyển khoản |
| §4.6 Khách đổi điểm đón/trả | **Thiếu** | Thêm API đổi trong chặng đã mua (D133); app chưa có màn |
| §5 Ghế theo chặng, giữ ghế, chống đặt trùng, trạng thái đơn/thanh toán/hoàn tiền tách nhau | Có (Phase A–E, D116 A1–A2, `Idempotency-Key`) | Giữ nguyên |
| §5.5 Nhà xe hủy chuyến: khách được hoàn hoặc đặt lại | **Thiếu** | Hoàn 100% từng vé, báo khách (D131) |
| §6.3 Gợi ý ngày khác khi ngày chọn không có chuyến | Có: lịch làm mờ ngày không chạy, tự chuyển sang ngày có chuyến (D128) | Ngày của tuyến tạm ngừng cũng bị làm mờ |
| §6.4 Không hiện chuyến đã hủy/ngừng bán như còn bán | Thiếu | Ẩn khỏi kết quả tìm, giữ ghế trả lỗi rõ (D131, D132) |
| §7.3 Tài xế chỉ coi đón tận nhà **đã xác nhận** là điểm đón | Mọi đón tận nhà vào danh sách tài xế | Chỉ bản đã xác nhận (D130) |
| §7.4–7.5 Lên xe, vắng mặt, kết thúc chuyến | Có (D104–D108) | Giữ nguyên; chuyến đã hủy không kiểm tra xe/xuất bến được |
| §8.2 Phân biệt lịch lặp lại với chuyến của một ngày | Có (MGR-032 và bảng điều độ MGR-014) | Hủy/ngừng bán làm trên chuyến của ngày; chuyến tăng cường hiện riêng |
| §8.3 Cấu hình xác nhận tự động/nhà xe duyệt | Thiếu | Trường `confirmation` của vùng phục vụ (D130) |
| §8.4 Duyệt yêu cầu, lý do từ chối, khách nhận kết quả | Thiếu | Màn MGR-033 (D130) |
| §9 Thanh toán xong mà xác nhận chậm, mất mạng | Có (`verify-status`, `PAYMENT_OVERDUE` hoàn tiền, khóa idempotency) | Giữ nguyên |

## 2. Điều chỉnh so với spec gốc

| # | Spec gốc | Áp dụng | Lý do |
|---|---|---|---|
| B1 | §4.3: yêu cầu chờ duyệt "pending" cho tới khi nhà xe trả lời | Khách **trả cả phụ phí khi thanh toán**; vé có hiệu lực ngay ở điểm dừng gắn với địa chỉ (bến đầu khi đón, bến cuối khi trả). Duyệt chỉ quyết địa chỉ nhà có được phục vụ không | VietQR là một lần chuyển; tách phụ phí ra lần trả sau làm khách phải chuyển hai lần. Ghế không bao giờ treo vì chờ duyệt |
| B2 | §4.3: không xác nhận được thì khách chọn thay thế hoặc hủy "theo chính sách" | Bị từ chối: **hoàn phụ phí tự động** (yêu cầu hoàn tiền chờ thu ngân duyệt), khách lên xe ở bến; muốn hủy vé thì **hoàn 100% phần còn lại, không phí** | Lỗi không do khách; không để khách mất tiền vì dịch vụ nhà xe không làm được |
| B3 | §4.3 không nói khi nhà xe không kịp duyệt | Xe xuất bến mà chưa duyệt thì **tự từ chối** ("Nhà xe chưa xác nhận kịp trước giờ xuất bến"), hoàn phụ phí. Hạn duyệt hiển thị là giờ mở khung đón (đón) hoặc giờ xuất bến (trả) | Khách đã được dặn ra bến khi chưa có xác nhận; không để trạng thái treo sau chuyến |
| B4 | §4.6: đổi điểm "trước giờ chốt", có thể kèm phụ phí và duyệt | Khách **tự đổi trong chặng đã mua** (lên muộn hơn, xuống sớm hơn), tới **30 phút** trước giờ xuất bến; đổi rộng hơn (giá khác) hoặc đổi địa chỉ nhà thì qua tổng đài | Trong chặng đã mua thì không đổi giá, không đụng kho ghế, không cần duyệt; ngoài chặng cần tính lại giá và ghế |
| B5 | §3.4 "tạm ngừng một chuyến" | Hiểu là **ngừng bán trực tuyến** chuyến đó (vé đã bán vẫn chạy; quầy vẫn bán được). Muốn không chạy thì **hủy chuyến** | Hai việc khác nhau: chuyến đầy/chốt sổ khác với chuyến không chạy |
| B6 | §3.4 "điều chỉnh giờ chạy" một chuyến | Dùng **báo trễ chính thức** đã có (MGR-014, PAX-025) cho chuyến đã bán; đổi giờ của lịch theo D129 (từ ngày +15) | Không dời giờ ghi trên vé đã bán (D129); báo trễ đã báo khách và miễn phí hủy khi trễ quá 30 phút |
| B7 | §3.4 "thêm chuyến bổ sung" | **Chuyến tăng cường**: một giờ chạy cho một ngày, được mở bán ngay trong cửa sổ 2 tuần (ngoại lệ của D129); đã mở bán thì không sửa, chỉ hủy | Thêm chỗ không làm đổi vé nào đã bán, nên không cần chờ 15 ngày |
| B8 | §2.3 "tuyến tạm ngừng" | Cờ `sales_suspended` của tuyến: không tìm thấy, không giữ ghế, lịch ngày làm mờ; **vé đã bán vẫn chạy** | Tạm ngừng bán khác với hủy; muốn hủy chuyến cụ thể thì hủy trên bảng điều độ |

## 3. Quy tắc đã thực hiện

### 3.1 Duyệt đón/trả tận nhà (D130, MGR-033)

- Mỗi vùng phục vụ có `confirmation`: `AUTO` (mặc định, nhận ngay) hoặc `MANUAL` (nhà xe duyệt). Dữ liệu mẫu: Sao Mai có vùng "Long Biên - Gia Lâm (nhà xe duyệt)", phụ phí 80.000 đ.
- Trạng thái trên đơn và vé: `CONFIRMED`, `PENDING_REVIEW`, `REJECTED`, `WITHDRAWN` (khách tự hủy yêu cầu). Đơn tạo xong trả `home_needs_review`, `home_pickup_status`, `home_dropoff_status`; app báo trước khi chuyển khoản.
- Chưa xác nhận: danh sách tài xế **không có địa chỉ**, khách là khách lên ở bến; thông báo "xe sắp tới" gửi như khách ở bến.
- Xác nhận: địa chỉ vào danh sách tài xế ngay; khách nhận thông báo kèm địa chỉ và khung giờ đón, dặn chuẩn bị trước.
- Từ chối: cần lý do từ 5 ký tự; hoàn phụ phí (`source = HOME_SERVICE_REFUSED`), giá vé ghi trên vé giảm tương ứng để không hoàn hai lần; khách nhận lý do, điểm lên xe thay thế và quyền hủy không phí.
- Chỉ giám đốc và điều độ duyệt; mỗi thao tác ghi nhật ký (`HOME_REQUEST_CONFIRM`, `HOME_REQUEST_REJECT`).

### 3.2 Ngừng bán và hủy chuyến của một ngày (D131)

- `POST /api/v1/ops/trips/{id}/sales {open}`: ngừng hoặc mở lại bán trực tuyến. Chuyến ngừng bán không có trong kết quả tìm; giữ ghế và tạo đơn trả `409 SALES_CLOSED`. Quầy và tổng đài vẫn bán.
- `POST /api/v1/ops/trips/{id}/cancel {reason}`: chỉ khi xe chưa xuất bến (`TRIP_ALREADY_STARTED`), lý do từ 5 ký tự. Mỗi vé còn hiệu lực: hủy, mở yêu cầu hoàn **100%** (`OPERATOR_CANCEL`, chờ duyệt như mọi khoản hoàn), báo khách một lần kèm số tiền và gợi ý đặt chuyến khác. Đơn đang chờ chuyển khoản đóng lại (tiền tới sau theo đường hoàn tiền `PAYMENT_OVERDUE`), giữ ghế và giữ chỗ tổng đài được nhả. Chuyến đã hủy: không tìm thấy, không bán ở đâu (`TRIP_CANCELLED`), tài xế không kiểm tra xe/xuất bến được và app tài xế bỏ qua chuyến này.
- Web điều hành: khối "Bán vé và hủy chuyến" trong chi tiết chuyến; hủy phải bấm hai lần (không dùng hộp thoại trình duyệt).

### 3.3 Tạm ngừng bán cả tuyến (D132)

`PUT /api/v1/ops/service-config/routes/{routeId} {sales_suspended: true | null}`. Tìm chuyến, lịch ngày (`run-days`), giữ ghế (`ROUTE_SUSPENDED`) đều theo cờ này. Vé đã bán không đổi.

### 3.4 Khách đổi điểm đón/trả (D133)

`POST /api/v1/passenger/tickets/{id}/stops {pickup_stop_id?, dropoff_stop_id?}`. Từ chối: vé không còn hiệu lực, xe đã chạy (`TRIP_DEPARTED`), dưới 30 phút trước giờ xuất bến (`CHANGE_CUTOFF_PASSED`), điểm không nhận đón/trả (`STOP_NOT_ALLOWED`), ngược chiều (`INVALID_SEGMENT`), ngoài chặng đã mua (`OUTSIDE_PAID_SEGMENT`), vé đang có đón/trả tận nhà ở phía đó (`HOME_SERVICE_ACTIVE`). Thành công: vé và danh sách tài xế đổi ngay, khách nhận thông báo. Khách rút yêu cầu tận nhà đang chờ duyệt: `POST /api/v1/passenger/tickets/{id}/home-request/withdraw {side}`.

### 3.5 Chuyến tăng cường (D134)

`POST /api/v1/ops/schedules {route_id, departure, extra_date}`: một chuyến cho đúng một ngày (từ hôm nay), bán ngay. Sửa khi đang bán: `409 EXTRA_RUN_ON_SALE`; không chạy thì hủy trên bảng điều độ.

## 4. Tiêu chí nghiệm thu (spec gốc §10)

| Nhóm | Trạng thái | Kiểm chứng |
|---|---|---|
| A. Tuyến: chỉ tìm tuyến đang bán; nhiều điểm dừng có thứ tự; chặng hợp lệ; từ chối ngược chiều | Xong | `TC-FR-08`, test kho ghế (`INVALID_SEGMENT`), `TC-FR-09` |
| A. Thay đổi tuyến không làm mất vé đã bán | Xong một phần (vé giữ bản chụp điểm; chưa báo khách khi tắt điểm) | D123 |
| B. Nhiều giờ chạy mỗi ngày; kết quả theo ngày và trạng thái thật | Xong | `TC-SCHED-01`..`03`, `TC-FR-05`, `TC-FR-11` |
| B. Chuyến hủy/không bán không đặt được; ngoại lệ hiện với khách | Xong | `TC-FR-05`, `TC-FR-06` |
| B. Đổi giờ báo khách | Xong qua báo trễ (B6) | `TC-MGR-07`, `TC-TRACK-04`, `TC-FLOW-C14` |
| C. Bật/tắt đón và trả tận nhà độc lập; chỉ địa chỉ hợp lệ đi tiếp | Xong (từ trước) | `service_areas.test.js`, `home_booking.test.js` |
| C. Bắt buộc duyệt khi cấu hình; phí và điều kiện báo trước; chờ duyệt không bao giờ hiện như đã xác nhận | Xong | `TC-FR-01`..`04`; Flutter "a home pickup the company has not answered is never shown as confirmed" |
| C. Thay đổi đã xác nhận phản ánh ở khách và tài xế | Xong | `TC-FR-01` (danh sách tài xế), `TC-FR-09` |
| D. Đơn hiện chuyến, chặng, ghế, đón/trả, tổng tiền; ghế theo chặng; chống trùng | Xong (từ trước) | Phase A–E |
| E. Khách tìm theo tuyến, ngày, chặng; so sánh giờ và giá; chọn điểm cố định hoặc địa chỉ | Xong (từ trước) | PAX-006–PAX-012 |
| F. Tài xế chỉ thấy chuyến được giao; danh sách là bản xác nhận mới nhất | Xong | `TC-FR-01`, `TC-FR-09`, phân quyền tài xế (Phase A) |
| F. Điều hành quản lý tuyến, lịch, yêu cầu tận nhà theo quyền; thay đổi chỉ ra vé bị ảnh hưởng | Xong | `TC-FR-01` (403 thu ngân), `TC-FR-05`, `kept_runs` (D129) |
| G. Bảo mật, thử lại không tạo trùng | Xong (từ trước) + endpoint mới có `Idempotency-Key` | `api_client_contract.test.js` |

## 5. Chưa làm (để sau)

- **App hành khách chưa có màn đổi điểm đón/trả** (API và hàm client `changeTicketStops` đã có); hiện khách gọi tổng đài.
- Tắt hoặc ẩn một điểm dừng đang có vé: chưa liệt kê vé bị ảnh hưởng cho điều hành và chưa báo khách (§2.3, §2.4).
- Báo trễ chưa nói rõ khung đón tận nhà dời theo (§9 "Departure time changes").
- Tài xế chưa nhận thông báo đẩy khi chuyến bị hủy hoặc khách đổi điểm; app tài xế tự cập nhật khi đọc lại danh sách.
- App quản lý Flutter mới có hàm client cho các API mới, chưa có màn; web điều hành đã có đủ.
