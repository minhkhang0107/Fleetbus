# BusGo Platform: sơ đồ luồng và giao tiếp đa ứng dụng

**Phiên bản:** 2.0 (Giai đoạn C). Tài liệu tổng và kiến trúc: [cross-app-interaction-flows.md](cross-app-interaction-flows.md).

| Mã | Luồng | Các bên | File |
| :--- | :--- | :--- | :--- |
| `FLOW-01` | Đặt vé, giữ chỗ, thanh toán VietQR | Hành khách, server, ngân hàng, điều hành, tài xế | [FLOW-01](FLOW-01-booking-vietqr-settlement.md) |
| `FLOW-02` | Xuất vé QR, soát vé, vắng mặt | Hành khách, tài xế, điều hành | [FLOW-02](FLOW-02-boarding-qr-multimodal-checkin.md) |
| `FLOW-03` | Thu COD, biên lai nợ tiền thừa, chốt chuyến | Hành khách, tài xế, thu ngân, điều hành | [FLOW-03](FLOW-03-cod-cash-debt-settlement.md) |
| `FLOW-04` | Đón khách vẫy dọc đường | Tài xế, kho ghế, khách online, điều hành | [FLOW-04](FLOW-04-onboard-hail-passengers.md) |
| `FLOW-05` | Giữ chỗ hotline, khóa ghế, tự nhả ghế | Tổng đài, điều phối, khách online | [FLOW-05](FLOW-05-hotline-seat-hold-auto-release.md) |
| `FLOW-06` | GPS, mất tín hiệu, trạm dừng | Tài xế, hành khách, điều hành | [FLOW-06](FLOW-06-radar-gps-telemetry-rest-stop.md) |
| `FLOW-07` | Sự cố, đổi xe, chuyến chậm | Tài xế, điều hành, hành khách | [FLOW-07](FLOW-07-incident-emergency-vehicle-swap.md) |

Mỗi luồng nêu các bước với API thật, bên nào thấy gì, và tên test. Test chạy bằng `npm test` (file `test/flows/flow_conformance.test.js`).

Các file `diagrams/*.mmd` được sinh từ các khối Mermaid trong những file trên bằng `npm run render:diagrams`; ảnh `images/` được dựng cùng lúc và không lưu trong repo.
