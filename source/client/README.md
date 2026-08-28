# BusGo Passenger Mobile App (`source/client/`)

Ứng dụng di động **BusGo Passenger** (Flutter Native dành cho Android & iOS) phục vụ hành khách tìm kiếm tuyến xe, chọn ghế 2D trực quan, đặt vé thanh toán Napas247 / VietQR tự động, quản lý ví vé điện tử xoay mã HMAC QR 30 giây chống chụp màn hình và theo dõi radar xe buýt thời gian thực (PAX-001 đến PAX-025).

---

## 1. Yêu Cầu Môi Trường (System Requirements)

- **Flutter SDK**: `>= 3.27.0` (Dart `>= 3.6.0`)
- **Melos**: `>= 6.0.0` (`dart pub global activate melos`)
- **Android Studio / Xcode**: Android SDK 34 (Java 17 / Gradle 8.9), Xcode 15+ (iOS 15+)
- **Make Tool**: `make` (Linux / macOS) hoặc Make for Windows

---

## 2. Cấu Trúc Monorepo Đa Gói (Clean Architecture)

```text
source/client/
├── app/                  # Presentation Layer (11 Flutter screens & Shell)
│   ├── android/          # Android Native Manifest (vn.busgo.passenger)
│   ├── ios/              # iOS Native Info.plist & Xcode Workspace
│   └── lib/src/presentation/passenger/ # PAX-001 -> PAX-025 UI Screens
├── data/                 # Data Layer (PassengerApiService, DTOs, Repositories)
├── domain/               # Domain Layer (Entities, UseCases)
├── resources/            # Design System (Tokens, AppColors, Fonts, l10n)
├── shared/               # Shared Utilities (Formatters, Crypto HMAC, Validators)
├── tools/
│   ├── build_and_run_app.sh # Script build/run với flavor và dart-define
│   └── gen_env/             # Script sinh launch.json cho IDE
├── env/                  # Cấu hình môi trường (develop, qa, staging, production)
├── melos.yaml            # Melos Monorepo orchestrator
└── makefile              # Các target lệnh make tự động hóa
```

---

## 3. Thiết Lập & Đồng Bộ Dự Án Lần Đầu

Chạy các lệnh sau từ thư mục `source/client/`:

```bash
# 1. Kích hoạt Melos (nếu chưa cài)
dart pub global activate melos

# 2. Bootstrap liên kết các gói nội bộ
make pub_get         # hoặc: melos bootstrap

# 3. Sinh cấu hình môi trường IDE (.vscode / .idea)
make gen_env

# 4. Sinh mã nguồn tự động (l10n & build_runner)
make sync            # hoặc: melos run force_build_all
```

---

## 4. Hướng Dẫn Chạy & Debug Ứng Dụng (Run Flavors)

Ứng dụng hỗ trợ 4 môi trường độc lập qua `--dart-define`:

| Flavor | Lệnh Chạy Qua Make | Endpoint API Mặc Định | File Cấu Hình |
| :--- | :--- | :--- | :--- |
| **Develop** | `make run_dev` | `http://localhost:3000/api/v1` | `env/develop.env` |
| **QA** | `make run_qa` | `https://qa-api.busgo.vn/api/v1` | `env/qa.env` |
| **Staging** | `make run_stg` | `https://staging-api.busgo.vn/api/v1` | `env/staging.env` |
| **Production** | `make run_prod` | `https://api.busgo.vn/api/v1` | `env/production.env` |

---

## 5. Hướng Dẫn Build Đóng Gói (Production & Staging Builds)

### 🤖 5.1. Build Cho Android (.apk / .aab)

```bash
# Build APK cài đặt trực tiếp
make build_dev_apk    # Output: app/build/app/outputs/flutter-apk/app-develop-release.apk
make build_prod_apk   # Output: app/build/app/outputs/flutter-apk/app-production-release.apk

# Build AppBundle (.aab) tải lên Google Play Console
make build_dev_bundle
make build_prod_bundle
```

### 🍎 5.2. Build Cho iOS (Runner / .ipa)

```bash
# Build iOS Runner
make build_dev_ios
make build_prod_ios

# Đóng gói file .ipa phát hành TestFlight / App Store
make build_dev_ipa
make build_prod_ipa
```

---

## 6. Kiểm Thử & Kiểm Tra Chất Lượng Mã Nguồn

```bash
make test             # Chạy kiểm thử tự động toàn bộ module
make analyze          # Phân tích tĩnh tĩnh (flutter analyze)
make lint             # Kiểm tra quy chuẩn linter
make format           # Tự động định dạng mã nguồn Dart
make dart_fix         # Tự động sửa chữa các cảnh báo deprecation
```
