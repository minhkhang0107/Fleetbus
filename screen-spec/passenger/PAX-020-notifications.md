# PAX-020 — Passenger Notification Center

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Tab / Sub-Screen  
**Priority:** P1 (Important Operational Flow)  
**Route:** `/notifications`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-20`, `BR-NOTIF-001`, `UC-PAS-NOTIF-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Centralize all operational transit notifications (Driver arrival proximity, trip delays, vehicle replacements, gate/pickup changes) and transactional receipts (Booking confirmed, refund completed, promotion alerts).
- **Actor:** Passenger.
- **Entry Condition:** Tapped Bell icon on App Bar (`PAX-004`) or selected bottom navigation tab.
- **Outcome:** Passenger reviews message history; tapping any item deep-links directly to the relevant ticket (`PAX-017`), tracking map (`PAX-018`), or refund status (`PAX-021`).

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Thông báo                      [✓ Đã đọc tất cả]│
├───────────────────────────────────────────────────┤
│ ┌─ CATEGORY TABS ──────────────────────────────┐  │
│ │ [ 🔘 TẤT CẢ (3) ] │ [ 🟢 CHUYẾN ĐI ] │ [ 🎁 ƯU ĐÃI ]│ │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ NOTIFICATION ITEM 1 (Unread · High Priority) ─┐│
│ │ 🟢 XE SẮP ĐẾN ĐIỂM ĐÓN!           · 2 phút trước││
│ │ Chuyến xe 29B-123.45 đang cách điểm đón Bến     ││
│ │ xe Giáp Bát khoảng 1.2 km (Dự kiến đến: 5 phút).││
│ │ [ 📍 Xem vị trí xe ngay ]                       ││
│ └─────────────────────────────────────────────────┘│
│                                                   │
│ ┌─ NOTIFICATION ITEM 2 (Read) ────────────────────┐│
│ │ 🎫 ĐẶT VÉ THÀNH CÔNG              · 14:02       ││
│ │ Mã đặt chỗ BG-88219 đã được xác nhận. Ghế A02.  ││
│ │ [ Xem vé điện tử ]                              ││
│ └─────────────────────────────────────────────────┘│
│                                                   │
│ ┌─ NOTIFICATION ITEM 3 (Operational Notice) ──────┐│
│ │ ⚠️ THAY ĐỔI BIỂN SỐ XE            · Hôm qua     ││
│ │ Chuyến đi 14:00 ngày 27/08 đã được đổi sang xe  ││
│ │ VIP mới mang BKS 29B-123.45. Chỗ ngồi giữ nguyên││
│ └─────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MarkAllReadCTA` | Text Button | Yes | Notification API | Enabled | Marks all items as read |
| `NotificationTabs` | Segmented Tab | Yes | Local Filter | All / Trips / Promos | Filters list by category |
| `NotificationCard` | Interactive Card | Yes | API Stream | Unread / Read | Tap opens deep-linked target screen |
| `PriorityPill` | Semantic Tag | Yes | Event Priority | High (Green/Amber) / Normal | Highlights urgent trip events |

---

## 4. API Contract

### 4.1. Fetch Notifications
- **Endpoint:** `GET /api/v1/passenger/notifications`
- **Auth:** Bearer
- **Query Params:** `category=ALL|TRIP|PROMO&page=1&limit=20`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "unread_count": 1,
    "items": [
      {
        "id": "notif_99182",
        "category": "TRIP",
        "title": "Xe sắp đến điểm đón!",
        "body": "Chuyến xe 29B-123.45 đang cách điểm đón Bến xe Giáp Bát khoảng 1.2 km.",
        "deep_link": "busgo://tracking/trp_991823",
        "is_read": false,
        "created_at": "2026-08-27T14:10:00Z"
      }
    ]
  }
}
```

---

## 5. UI Copy & Localization
- **Title:** *"Thông báo"*
- **Mark Read Label:** *"Đánh dấu đã đọc tất cả"*
- **Empty Title:** *"Không có thông báo mới"*

---

## 6. Acceptance Criteria & Test Matrix
- **AC-001:** Tapping a notification with `deep_link: "busgo://tracking/trp_991823"` marks the item as read and opens `PAX-018-live-tracking.md`.
- **TC-PAX-020-01:** Tap "Đã đọc tất cả" clears unread red badge across the app.
