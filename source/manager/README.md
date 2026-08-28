# BusGo Operations Control Center Web App (`source/manager/`)

Cổng thông tin điều hành thời gian thực **BusGo Manager Web Portal** (Flutter Web & Responsive Desktop Dashboard) dành cho Giám đốc điều hành hạm đội, Điều độ viên và Nhân viên phòng vé: Giám sát radar xe 60Hz, điều phối tài xế & phương tiện, bán vé qua tổng đài POS Hotline, đổi xe khẩn cấp và báo cáo doanh thu & đúng giờ (MGR-001 đến MGR-030).

---

## 1. Nơi Build Ứng Dụng Manager Web (Build Output Directory)

Khi thực thi lệnh build, bản phân phối web tối ưu hóa (Canvaskit WASM + HTML5) sẽ được sinh ra tại:
- **Thư mục phân phối**: `source/manager/web_dist/` (hoặc `source/manager/app/build/web/`).
- **Máy chủ tích hợp**: Node.js API Gateway tự động phục vụ bản build web tại đường dẫn `http://localhost:3000/manager`.

---

## 2. Cấu Trúc Monorepo Web Tương Ứng Với App Driver/Passenger

```text
source/manager/
├── app/                  # Presentation Web Application
│   ├── web/              # Web Entry (index.html, manifest.json, favicon.png)
│   ├── lib/main.dart     # Flutter Web App Shell
│   ├── lib/src/service/  # ManagerApiService (REST API Client)
│   └── lib/src/presentation/manager/ # 7 Module Màn Hình Quản Trị
├── resources/            # Design System (ManagerColors Slate & Cyan #06B6D4)
├── tools/
│   ├── build_and_run_app.sh # Script build/run Flutter Web
│   └── gen_env/             # Script sinh biến môi trường
├── env/                  # Các file môi trường (develop, qa, staging, production)
├── web_dist/             # Thư mục đích phân phối Production Web
├── melos.yaml            # Monorepo build orchestrator
└── makefile              # Các target lệnh make tự động hóa
```

---

## 3. Hướng Dẫn Chạy & Build Qua Makefile

### 🚀 3.1. Chạy Web Cục Bộ (Local Web Server)

```bash
cd source/manager

# Chạy trên trình duyệt Chrome kết nối API Server http://localhost:3000
make run_web

# Hoặc từ thư mục gốc dự án:
make manager_run_web
```

### 📦 3.2. Đóng Gói Phân Phối (Production Build Web)

```bash
cd source/manager

# 1. Build Web cho môi trường Develop
make build_dev_web

# 2. Build Web cho môi trường Production
make build_prod_web
```

---

## 4. Các Màn Hình Chức Năng (MGR-001 đến MGR-030)

1. **Đăng nhập RBAC (`MGR-001`, `MGR-029`)**: Phân quyền Giám đốc điều hành, Điều độ viên, Bán vé.
2. **Dashboard KPIs (`MGR-002`)**: Doanh thu, hệ số lấp đầy, số xe hoạt động, tỷ lệ đúng giờ.
3. **Radar Hạm Đội 60Hz (`MGR-003`, `MGR-004`)**: Tọa độ GPS, vận tốc tức thời, trạng thái beacon.
4. **Điều Độ Chuyến Gantt (`MGR-014` — `MGR-016`)**: Giám sát chuyến chạy, tiến độ chuẩn bị xe.
5. **Bán Vé POS / Hotline (`MGR-019`, `MGR-020`)**: Xuất vé trực tiếp tại quầy hoặc gọi điện.
6. **Đổi Xe Khẩn Cấp (`MGR-023`)**: Điều xe dự phòng và tự động gửi thông báo đổi xe cho khách.
7. **Hồ Sơ Hạm Đội & Tài Xế (`MGR-005` — `MGR-010`)**: Quản lý phương tiện, đăng kiểm, bằng lái FC.
8. **Báo Cáo Tài Chính & OTP (`MGR-025`, `MGR-026`)**: Doanh thu theo kênh và tỷ lệ đúng giờ theo tuyến.
