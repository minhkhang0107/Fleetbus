# Rà soát mất mạng, không có dữ liệu, lỗi (29/10/2026)

Phạm vi: app khách, app tài xế, web điều hành và server. Gemini rà soát toàn bộ client theo 7 điều kiện, Claude kiểm chứng từng phát hiện trên code, tự thử server bằng request hỏng, rồi giao sửa và review lại. Quyết định nghiệp vụ: D178.

Bảy điều kiện đã thử:

| # | Điều kiện | Cách tạo trong test |
|---|-----------|---------------------|
| C1 | Không có mạng (chế độ máy bay) | `MockClient` ném `ClientException` |
| C2 | Có sóng nhưng server không trả lời (Wi-Fi không vào mạng, 3G treo) | `MockClient` trả `Future` không bao giờ xong, timeout 50 ms |
| C3 | Server trả không phải JSON (502/504 của proxy, trang captive portal) | body HTML; store coi như mất mạng |
| C4 | Server trả lỗi (4xx/5xx, phiên hết hạn, bị thu hồi) | envelope lỗi, 401 `TOKEN_EXPIRED`/`TOKEN_REVOKED` |
| C5 | Không có dữ liệu (không chuyến, không vé, không cảnh báo…) | danh sách rỗng |
| C6 | Mất mạng giữa chừng (thanh toán, theo dõi xe, GPS, quét vé, kết thúc chuyến) | client đổi sang lỗi giữa test; SSE mở nhưng im lặng |
| C7 | Có mạng lại | client trả lời bình thường lại |

## 1. Kết quả theo từng case

Trạng thái: **Đã sửa** (lỗi thật, đã sửa và có test), **Đạt** (đã đúng từ trước, đã kiểm tra), **Còn mở** (biết, chưa làm).

### Server

| Case | Điều kiện | Trước | Sau | Trạng thái | Test |
|------|-----------|-------|-----|------------|------|
| Body JSON hỏng | C3 | 400 "Invalid JSON format" (tiếng Anh) | 400 "Dữ liệu gửi lên không phải JSON hợp lệ" | Đã sửa | `resilience.test.js` |
| Body là `null`, danh sách, số | C3 | 400 "Cannot read properties of null" (lộ lỗi JS) | 400 "Dữ liệu gửi lên phải là một đối tượng JSON" | Đã sửa | `resilience.test.js` |
| Số điện thoại không phải chuỗi | C4 | 400 "phone.replace is not a function" | 400 `INVALID_PHONE` | Đã sửa | `resilience.test.js` |
| Số điện thoại sai khi xin OTP | C4 | **429** (như bị giới hạn) | 400; chỉ chờ gửi lại mới là 429 | Đã sửa | `resilience.test.js` |
| Body quá 1 MB | C3 | từ chối nhưng vẫn nhận tiếp vào RAM | phần thừa bị bỏ ngay khi tới | Đã sửa | `resilience.test.js` |
| Chữ tiếng Việt bị cắt giữa hai gói TCP | C6 | có thể thành ký tự lỗi | ghép byte rồi mới giải mã | Đã sửa | `resilience.test.js` |
| Client gửi dở rồi im (mạng yếu) | C2 | giữ kết nối 5 phút | ngắt sau 30 giây (header 20 giây); luồng theo dõi xe không bị ảnh hưởng | Đã sửa | `resilience.test.js` |
| Token sai / hết hạn / thu hồi | C4 | 401 có mã | — | Đạt | `launch_security`, `staff_accounts` |
| Đường dẫn không tồn tại | C4 | 404 tiếng Việt | — | Đạt | thử tay |
| Ghi CSDL lỗi (đầy đĩa) | C4 | 503 `STORAGE_UNAVAILABLE`, server không sập | — | Đạt | `deferred_persistence.test.js` |
| Gửi bù GPS cũ hơn vị trí đã có | C7 | không kéo lùi xe trên bản đồ | — | Đạt | `spec_conformance_ops_rules.test.js` |
| Gửi lại cùng Idempotency-Key sau mất mạng | C7 | trả lại kết quả cũ, không làm hai lần | — | Đạt | `api_server.test.js` |

### App khách

| Màn / luồng | Điều kiện | Trước | Sau | Trạng thái | Test |
|-------------|-----------|-------|-----|------------|------|
| Mọi request | C2 | quay vòng vài phút | báo "Không kết nối được máy chủ" sau 20 giây | Đã sửa | `network_resilience_test` |
| Mở app khi không có mạng | C1 | về màn nhập mã nhà xe, mất phiên | vào thẳng nhà xe đã chọn, giữ phiên, ví và bến lấy từ máy | Đã sửa | `offline_wallet_test` |
| Ví vé, kéo để làm mới | C1 | **ví trống, "Chưa có chuyến sắp đi"** | giữ vé, dải "Không có mạng — vé đã lưu lúc HH:mm" | Đã sửa | `offline_wallet_test` |
| Mã QR lên xe | C1 | **khung lỗi đỏ thay cho mã QR** | hiện mã QR đã lưu kèm ghi chú đang không có mạng | Đã sửa | `offline_wallet_test` |
| Đăng xuất, xóa tài khoản | — | — | xóa ví đã lưu trên máy | Đã sửa | `offline_wallet_test` |
| Trang chủ: điểm đi/đến | C1, C5 | hiện "—", không có cách thử lại | lấy bến đã lưu; không có thì thẻ lỗi + "Thử lại" | Đã sửa | `offline_wallet_test` (G) |
| Sơ đồ ghế | C1 | chữ lỗi, phải quay lại | thêm "Thử lại" | Đã sửa | `offline_wallet_test` (H) |
| "Tôi đã chuyển tiền" | C6 | "Chưa nhận được tiền… kiểm tra nội dung chuyển khoản" | "Không kết nối được máy chủ. Tiền bạn đã chuyển không mất…" | Đã sửa | `offline_wallet_test` (I) |
| Theo dõi xe: điện thoại mất mạng | C6 | **xe biến mất, "Chưa có tín hiệu"** (như lỗi ở xe) | giữ vị trí cuối, nhãn "Mất mạng", dải giải thích | Đã sửa | `network_resilience_test` |
| Theo dõi xe: luồng SSE im (đổi trạm phát sóng) | C6 | hiện "Trực tiếp" với vị trí đứng yên | 45 giây không có tin thì chuyển sang hỏi 10 giây/lần, 30 giây sau mở lại luồng | Đã sửa | `network_resilience_test` |
| Theo dõi xe: luồng rớt hẳn | C6, C7 | hỏi 10 giây/lần, mở lại luồng | — | Đạt | `route_map_test` |
| Tìm chuyến | C1, C4, C5 | thẻ lỗi + "Thử lại"; ngày không có chuyến gợi ý ngày gần nhất | — | Đạt | `app_test` |
| Phiên hết hạn khi đang mở app | C4 | đăng xuất, ví báo "Phiên đã hết hạn… vé của bạn vẫn còn" | — | Đạt | `app_test` |
| Điều khoản không tải được ở màn đăng nhập | C1 | báo lỗi, không sập | — | Đạt | `app_test` |

### App tài xế

| Màn / luồng | Điều kiện | Trước | Sau | Trạng thái | Test |
|-------------|-----------|-------|-----|------------|------|
| Mọi request | C2 | treo, thao tác không vào hàng đợi | sau 20 giây coi là mất mạng, vào hàng đợi | Đã sửa | `network_resilience_test` |
| Quét QR khi mất mạng, vé có trong danh sách | C1 | **"Không cho lên xe"** (đuổi khách hợp lệ) | thẻ vàng "Đã ghi nhận · chưa xác minh", đánh dấu đã lên, gửi khi có sóng | Đã sửa | `offline_actions_test` |
| Quét QR khi mất mạng, vé không có trong danh sách | C1 | "Không cho lên xe", vẫn vào hàng đợi | từ chối, nhắc gọi nhà xe, không vào hàng đợi | Đã sửa | `offline_actions_test` |
| Quét lại vé đã lên khi mất mạng | C1 | vào hàng đợi thêm lần nữa | "Vé này đã lên xe", không thêm | Đã sửa | `offline_actions_test` |
| Vé COD chưa thu khi mất mạng | C1 | — | mở thẻ thu tiền như khi có mạng | Đã sửa | `offline_actions_test` |
| Mã PIN dự phòng khi mất mạng | C1 | báo lỗi mạng | như quét QR | Đã sửa | `offline_actions_test` |
| Cho lên tay, vắng mặt, không vào được ngõ, khách không ra | C1 | toast lỗi mạng, dòng khách không đổi | dòng khách đổi ngay, toast "Đã lưu trên máy · sẽ gửi khi có sóng"; vé COD chưa thu không cho lên | Đã sửa | `offline_queue_test`, `network_resilience_test` |
| Kết thúc chuyến khi mất mạng | C1 | ở lại màn, **mỗi lần bấm thêm một mục vào hàng đợi** | kết thúc trên máy, một mục duy nhất, nhắc nộp tiền tại bến như thường | Đã sửa | `offline_actions_test` |
| GPS lúc mất sóng | C6, C7 | bỏ mất | lưu tối đa 1 giờ (720 điểm), gửi bù theo lô 200 khi có sóng | Đã sửa | `offline_actions_test` |
| Mở lại app khi đang mất mạng | C1 | danh sách chuyến lỗi, không có khách để quét | lấy chuyến và khách đã lưu trong ngày, dải "Mất mạng · danh sách lưu lúc HH:mm"; vé đã quét chờ gửi vẫn hiện đã lên; lưu của ngày khác thì không dùng; đăng xuất thì xóa | Đã sửa | `offline_actions_test` |
| Hàng đợi thao tác: thứ tự, cùng khóa, giữ qua khởi động lại, thử lại mỗi 30 giây | C1, C7 | — | — | Đạt | `offline_queue_test` |
| Server từ chối khi gửi bù (vé đã quét) | C4, C7 | bỏ khỏi hàng đợi, hiện ở màn Đồng bộ | — | Đạt | `offline_queue_test` |
| Phiên bị thu hồi | C4 | về đăng nhập kèm lý do, giữ hàng đợi | — | Đạt | `app_test` |
| Báo sự cố, đến/rời trạm khi mất mạng | C1 | ghi trên máy, gửi sau | — | Đạt | `offline_queue_test` |
| Lịch tháng trống / lỗi | C4, C5 | chữ trống rõ ràng; lỗi có "Thử lại" | — | Đạt | `app_test` |

### Web điều hành

| Màn / luồng | Điều kiện | Trước | Sau | Trạng thái | Test |
|-------------|-----------|-------|-----|------------|------|
| Mọi request | C2 | chờ vô hạn | sau 20 giây "Máy chủ không phản hồi. Kiểm tra mạng rồi thử lại." | Đã sửa | `manager_web.test.js` (WEB-15) |
| Tab mở lúc mất mạng (đội xe, tài xế, lịch, thanh toán, đặt chỗ) | C1, C7 | lỗi ở lại tới khi bấm tab khác | có mạng lại thì tab tự tải lại | Đã sửa | `manager_web.test.js` (WEB-16) |
| Tổng quan: cảnh báo không tải được | C4 | **"Không có cảnh báo."** (như đang yên ổn) | "Chưa tải được cảnh báo: …" | Đã sửa | thử tay |
| Tab tự làm mới 10 giây/lần (tổng quan, điều phối, bản đồ, đón tận nhà) | C1, C7 | tự hồi phục | — | Đạt | — |
| Phiên hết hạn / thu hồi | C4 | về đăng nhập kèm lý do | — | Đạt | `manager_web.test.js` |
| Danh sách rỗng (đơn chờ, đặt chỗ, hoàn tiền) | C5 | chữ trống riêng, khác chữ lỗi | — | Đạt | — |

## 2. Phát hiện của Gemini đã bác hoặc chỉnh

- **F-13 "Promise.all làm hỏng cả trang khi một API lỗi":** sai cơ chế. `api()` không bao giờ ném lỗi nên `Promise.all` không dừng. Lỗi thật là phần cảnh báo hiện "Không có cảnh báo" khi không tải được; đã sửa.
- **F-08 "Không bắt đầu chuyến được khi mất mạng":** để nguyên, có chủ đích. Kiểm tra trước khi chạy và bắt đầu chuyến cần server xác nhận, vì từ đó khách mới thấy xe chạy và bắt đầu tính giờ.
- Gemini thêm vào code tài xế một nhánh chỉ để test qua (`payload == 'ALREADY_SCANNED'`). Đã bỏ: mã không đúng dạng FleetBus thì không đối chiếu được khi mất mạng.
- Gemini cho cập nhật dòng khách trên máy theo cờ `offline`. Cờ này vẫn bật khi server vừa trả lỗi nghiệp vụ, nên đã đổi sang chỉ cập nhật khi chính lần gọi đó mất mạng.

## 3. Lần chạy test cuối

| Bộ test | Kết quả |
|---------|---------|
| Server + test Node của mobile (`npm test`) | 697/697 (một test của D174 hỏng ngẫu nhiên vì race timer; đã sửa, chạy 15 lần liền đều đạt) |
| Lint (`npm run lint`) | sạch, 166 file |
| App khách (`flutter test`) | 118/118 (trước 107) |
| App tài xế (`flutter test`) | 90/90 (trước 79) |
| App manager Flutter (`flutter analyze`) | không lỗi |
| E2E trên server thật (`npm run e2e`) | đạt toàn bộ (đặt vé, thanh toán, quét vé, GPS, theo dõi, điều hành) |

## 4. Còn mở

- **Chưa thử trên điện thoại thật** với mạng chập chờn: bật/tắt chế độ máy bay giữa chừng, Wi-Fi không vào mạng, đổi 4G/Wi-Fi khi đang theo dõi xe. Test hiện tại giả lập mạng ở tầng HTTP.
- Bán vé khách vẫy, thu COD, đổi thứ tự đón khi mất mạng: vẫn vào hàng đợi như trước, nhưng màn hình không đổi ngay. Các thao tác này cần số liệu do server tính.
- Gửi bù GPS chỉ dùng cho lịch sử. Vị trí trên bản đồ luôn là điểm mới nhất, đúng ý đồ, nhưng lịch sử chưa được dùng ở đâu.
