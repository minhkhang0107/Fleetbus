# PAX-022 — Passenger Profile & Settings

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Tab Root  
**Priority:** P2 (Supporting)  
**Route:** `/profile`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-22`, `BR-AUTH-001`, `UC-PAS-PROF-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Manage passenger identity (Name, Phone, Email), view loyalty membership tier & point balance, access saved frequent stops and traveler directory (`PAX-023`), configure push notification preferences, switch language (Tiếng Việt / English), view privacy policies, and logout.
- **Actor:** Passenger.
- **Entry Condition:** Tapped "Tài khoản" in the bottom navigation bar.
- **Outcome:** Passenger manages account preferences or logs out.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ Tài khoản                                         │
├───────────────────────────────────────────────────┤
│ ┌─ USER PROFILE CARD ──────────────────────────┐  │
│ │ [ 👤 Avatar ]  Nguyễn Văn Nam                │  │
│ │                0987 654 321 · Thành viên Bạc │  │
│ │                ⭐ 450 điểm BusGo             │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 👤 QUẢN LÝ THÔNG TIN                              │
│ ┌─────────────────────────────────────────────┐   │
│ │ [ 📍 ] Địa điểm đã lưu (Nhà, Công ty...)  › │   │
│ ├─────────────────────────────────────────────┤   │
│ │ [ 👥 ] Danh bạ người đi cùng              › │   │
│ ├─────────────────────────────────────────────┤   │
│ │ [ 💳 ] Phương thức thanh toán liên kết    › │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ ⚙️ CÀI ĐẶT ỨNG DỤNG                               │
│ ┌─────────────────────────────────────────────┐   │
│ │ [ 🔔 ] Cài đặt thông báo chuyến đi        › │   │
│ ├─────────────────────────────────────────────┤   │
│ │ [ 🌐 ] Ngôn ngữ                   Tiếng Việt│   │
│ ├─────────────────────────────────────────────┤   │
│ │ [ 🛡️ ] Điều khoản & Quyền riêng tư         › │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ [ 🚪 Đăng xuất ]                                  │
│ Phiên bản 3.0.0 (Build 412)                       │
└───────────────────────────────────────────────────┘
```

---

## 3. API Contract & Business Rules
- **Profile API:** `GET /api/v1/passenger/profile` (Bearer token).
- `BR-PROF-001`: Tapping "Đăng xuất" clears secure tokens from Keychain/SharedPreferences, cancels active WebSocket listeners, and routes to `/login`.
- **TC-PAX-022-01:** Verifies logout completely purges cached user tokens and resets app state.
