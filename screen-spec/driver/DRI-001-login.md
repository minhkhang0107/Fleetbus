# DRI-001 — Driver Internal Staff Login & Authentication

**App:** Driver  
**Platform:** Android (Flutter + Native Foreground GPS Service) / iOS  
**Screen Type:** Full Screen  
**Priority:** P0 (Operational Blocking)  
**Route:** `/driver/login`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-01`, `BR-DRI-001`, `UC-DRI-AUTH-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Authenticate company drivers and assistant drivers using staff credentials (Staff ID / Phone and secure PIN), verify driver license validity against backend registry, bind the physical mobile device for MQTT telemetry ingestion, and check vehicle assignment.
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** App launch without active session or after explicit shift logout.
- **Outcome:** Authenticated driver session established; JWT with `ROLE_DRIVER` stored; driver routed to `DRI-002-today-trips.md`.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-DRI-001` (Driver Role Verification), `BR-DRI-002` (Device ID Telemetry Binding), `UC-DRI-AUTH-001`.
- **Business Invariant:** Driver accounts CANNOT self-register through the mobile app. All credentials are provisioned by Operations Admins via `MGR-015` / `MGR-029`.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: None (Auth Root)
Previous Screen: None
Next Screen: [DRI-002 Today's Assigned Trips]
Exit Points:
  └── Submit Login -> Navigates to `/driver/today-trips`
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ BusGo Driver                  [📶 Online] [🔋 92%] │
├───────────────────────────────────────────────────┤
│                                                   │
│  🚌 BUSGO FLEET DRIVER                            │
│  Ứng dụng Điều hành Dành cho Tài xế               │
│                                                   │
│  Mã số nhân viên / Số điện thoại                  │
│  ┌─────────────────────────────────────────────┐  │
│  │ [ 👤 TX-8821 (hoặc 0912345678)            ] │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  Mã PIN bảo mật (6 chữ số)                        │
│  ┌─────────────────────────────────────────────┐  │
│  │ [ • • • • • •                             ] │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │             ĐĂNG NHẬP CA CHẠY (CTA)         │  │
│  │              (Chiều cao: 64dp)              │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ Quên mã PIN? Liên hệ Điều độ: 1900 6868 ]      │
│                                                   │
├───────────────────────────────────────────────────┤
│ Thiết bị: Samsung Galaxy Tab A9 · GPS: Sẵn sàng   │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **High-Contrast Input Fields:** Large touch-friendly fields with prominent text size ($18\text{px}$).
2. **Primary Action Pill:** Extra-large button ($64\text{dp}$ height, Brand Blue) *"ĐĂNG NHẬP CA CHẠY"*.
3. **Hardware Status Header:** Subtle indicator for cellular connectivity and battery level.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `StaffIdInput` | InputField | Yes | Driver Input | Normal / Error | Text input with uppercase auto-format |
| `PinInput` | PasswordField | Yes | Driver Input | Obscured | 6-digit numeric pin |
| `LoginCTA` | DriverActionPill| Yes | Form State | Enabled / Loading | Tap triggers auth API ($64\text{dp}$) |
| `DispatchHotline` | Text Button | Yes | Static Contact | Enabled | Triggers emergency dispatcher dialer |

---

## 6. API Contract

### 6.1. Driver Authentication
- **Endpoint:** `POST /api/v1/auth/driver/login`
- **Auth:** Public
- **Headers:** `Content-Type: application/json`, `X-Device-Id: dev_tablet_9921`
- **Request Body:**
```json
{
  "staff_id": "TX8821",
  "pin": "123456",
  "device_info": {
    "model": "SM-X115",
    "os_version": "Android 14",
    "app_version": "3.0.0"
  }
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "driver": {
      "driver_id": "drv_8821a",
      "staff_id": "TX8821",
      "full_name": "Trần Văn Bình",
      "phone": "+84912345678",
      "license_class": "FC",
      "license_valid_until": "2028-12-31"
    },
    "tokens": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "eyJhbGciOi..."
    },
    "mqtt_credentials": {
      "broker_url": "ssl://mqtt.busgo.vn:8883",
      "client_id": "drv_8821a_tab",
      "username": "mqtt_user_8821",
      "token": "mqtt_jwt_token_xyz"
    }
  }
}
```

---

## 7. Business Rules
- `BR-DRI-001`: If driver's commercial driver license (`license_valid_until`) is expired, login is rejected with HTTP 403: *"Bằng lái của bạn đã hết hạn. Vui lòng liên hệ phòng Nhân sự."*.
- `BR-DRI-002`: Device ID is registered with the session to ensure all telemetry published via MQTT is cryptographically tied to this active shift.

---

## 8. Analytics & UI Copy
- `DRIVER_LOGIN_ATTEMPTED`: `{ staff_id: "TX8821" }`
- `DRIVER_LOGIN_SUCCESS`: `{ driver_id: "drv_8821a", license_class: "FC" }`
- **Title:** *"Đăng nhập ca chạy"*
- **CTA:** *"ĐĂNG NHẬP CA CHẠY"*
- **Hotline Help:** *"Quên mã PIN? Liên hệ tổng đài điều độ: 1900 6868"*

---

## 9. Acceptance Criteria & Test Matrix
- **AC-001:** Valid staff ID and 6-digit PIN authenticates within $<800\text{ms}$ and navigates to `DRI-002`.
- **TC-DRI-001-01:** Expired license returns 403 with blocking contact alert.
