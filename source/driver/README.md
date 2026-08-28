# BusGo Driver Tactical Cockpit App (`source/driver/`)

Ứng dụng di động **BusGo Driver** (Flutter Native dành cho Android & iOS) cung cấp buồng lái thông minh độ tương phản cao (Tactical Dark UI 72dp/64dp) cho tài xế xe khách đường dài: điểm danh ca chạy, kiểm tra kỹ thuật xe 6 điểm trước khi khởi hành, quét vé mã QR xoay động 30s siêu tốc, thu hộ tiền mặt COD, truyền GPS Telemetry theo thời gian thực và đồng bộ ngoại tuyến khi mất sóng (DRI-001 đến DRI-019).

---

## 1. Yêu Cầu Môi Trường (System Requirements)

- **Flutter SDK**: `>= 3.27.0` (Dart `>= 3.6.0`)
- **Melos**: `>= 6.0.0` (`dart pub global activate melos`)
- **Android Studio / Xcode**: Android SDK 34, JDK 17, Xcode 15+
- **Make Tool**: `make` (Linux / macOS / Windows)

---

## 2. Cấu Trúc Monorepo Buồng Lái Tài Xế

```text
source/driver/
├── app/                  # Buồng lái điều khiển (8 Tactical Screens & Shell)
│   ├── android/          # Android Manifest (vn.busgo.driver - Foreground Service & Camera)
│   ├── ios/              # iOS Info.plist (vn.busgo.driver - Background Location & Camera)
│   └── lib/src/presentation/ # DRI-001 -> DRI-019 Tactical Screens
├── data/                 # Data Layer (DriverApiService, Offline Sync Queue)
├── domain/               # Domain Layer (Driver Auth, Trip Manifest, Telemetry)
├── resources/            # Design System (Tactical Dark #0F172A, #1E293B, #16A34A)
├── shared/               # Shared Utilities (HMAC QR verification, formatters)
├── tools/
│   └── build_and_run_app.sh # Script đóng gói flavor
├── env/                  # Cấu hình môi trường (develop, qa, staging, production)
├── melos.yaml            # Monorepo build orchestrator
└── makefile              # Các target lệnh make tự động hóa
```

---

## 3. Thiết Lập & Đồng Bộ Lần Đầu

```bash
cd source/driver

# 1. Liên kết các package nội bộ
make pub_get         # hoặc: melos bootstrap

# 2. Sinh cấu hình môi trường IDE
make gen_env

# 3. Đồng bộ hóa mã nguồn (l10n, build_runner)
make sync            # hoặc: melos run force_build_all
```

---

## 4. Hướng Dẫn Chạy Buồng Lái Tài Xế (Flavors)

| Flavor | Lệnh Chạy Qua Make | Endpoint API Mặc Định | File Môi Trường |
| :--- | :--- | :--- | :--- |
| **Develop** | `make run_dev` | `http://localhost:3000/api/v1` | `env/develop.env` |
| **QA** | `make run_qa` | `https://qa-api.busgo.vn/api/v1` | `env/qa.env` |
| **Staging** | `make run_stg` | `https://staging-api.busgo.vn/api/v1` | `env/staging.env` |
| **Production** | `make run_prod` | `https://api.busgo.vn/api/v1` | `env/production.env` |

---

## 5. Hướng Dẫn Build & Đóng Gói (Production Builds)

### 🤖 5.1. Build Cho Android (.apk / .aab)

```bash
# Build file APK cài đặt lên điện thoại tài xế
make build_dev_apk    # Output: app/build/app/outputs/flutter-apk/app-develop-release.apk
make build_prod_apk   # Output: app/build/app/outputs/flutter-apk/app-production-release.apk

# Build AppBundle (.aab) tải lên Google Play
make build_dev_bundle
make build_prod_bundle
```

### 🍎 5.2. Build Cho iOS (Runner / .ipa)

```bash
# Build iOS Runner
make build_dev_ios
make build_prod_ios

# Đóng gói file .ipa phát hành nội bộ Enterprise / App Store
make build_dev_ipa
make build_prod_ipa
```

---

## 6. Lưu Ý Cấu Hình Quyền Hạn Nền Tảng (Platform Permissions)

- **Android**:
  - `FOREGROUND_SERVICE_LOCATION`: Đảm bảo thiết bị liên tục phát beacon GPS 3 giây/lần ngay cả khi tắt màn hình.
  - `WAKE_LOCK`: Giữ buồng lái luôn sáng khi xe đang chạy ở tốc độ $>0\text{ km/h}$.
  - `CAMERA`: Tối ưu hóa quét QR tốc độ cao dưới 200ms.
- **iOS**:
  - `UIBackgroundModes`: `location`, `fetch`, `remote-notification`.
  - Quyền truy cập vị trí `NSLocationAlwaysAndWhenInUseUsageDescription`.
