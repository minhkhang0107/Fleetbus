# BusGo Responsive Design & Layout Rules

**Document Version:** 1.0  
**Scope:** Responsive layout grids, adaptive viewport breakpoints, and multi-device behaviors across Passenger, Driver, and Manager interfaces.

---

## 1. Breakpoint Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Manager Operations Portal                                 │
│  < 1024px            1024px – 1279px         1280px – 1439px          >= 1440px        │
│  (Tablet Fallback)   (Compact Desktop)       (Standard Desktop)       (Control Center) │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Passenger & Driver Mobile Apps                            │
│  < 360px             360px – 390px           391px – 430px            >= 768px         │
│  (Small Phone)       (Standard Phone)        (Large / Max Phone)      (Tablet / POS)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Manager Portal Desktop Responsive Rules

### 2.1. Breakpoint $\ge 1440\text{px}$ (Operations Control Center Baseline)
- **Navigation:** Expanded Left Sidebar ($260\text{px}$ fixed width with full labels and section headers).
- **Live Radar (`MGR-003`):** Dual-pane layout:
  - **Left / Center (60% width):** High-resolution interactive fleet map with live vehicle markers, route corridors, and geofence polygons.
  - **Right Panel (40% width):** Realtime active trip list, delay alarms, and vehicle telemetry cards.
- **Data Tables (`MGR-005`, `MGR-010`, `MGR-017`):** Full 10-12 column display with inline quick action buttons without horizontal scrolling.

### 2.2. Breakpoint $1280\text{px} - 1439\text{px}$ (Standard Desktop)
- **Navigation:** Standard Left Sidebar ($220\text{px}$ width).
- **Live Radar (`MGR-003`):** 50% Map / 50% Operational List split.
- **Data Tables:** Secondary columns (e.g., Created By, Vehicle Model Year) collapse into expandable row details.

### 2.3. Breakpoint $1024\text{px} - 1279\text{px}$ (Compact Desktop / Laptop)
- **Navigation:** Collapsed Icon Rail ($72\text{px}$ width with tooltips on hover).
- **Live Radar:** Tabbed or vertical stack layout (Toggle between Map View and List View).
- **Data Tables:** Column priority masking enabled (P0 and P1 columns visible; P2 in dropdown drawer).

### 2.4. Breakpoint $< 1024\text{px}$ (Tablet / Fallback)
- **Navigation:** Drawer Menu triggered by Hamburger Icon.
- **Live Radar:** Full-screen interactive map with floating bottom sheet drawer for operational list.

---

## 3. Mobile Viewport Layout Rules (Passenger & Driver)

### 3.1. Small Phone ($< 360\text{px}$, e.g. iPhone SE 1st Gen, low-end Android)
- Seat Map (`PAX-009`): Double-deck view defaults to tabbed deck switcher instead of side-by-side.
- Sticky Action Bar: Primary CTA spans $100\%$ width; price summary is stacked directly above button.
- Driver Cockpit (`DRI-006`): Telemetry tiles stack vertically into 2 primary cards (Speed/GPS + Next Stop).

### 3.2. Standard Phone ($360\text{px} - 390\text{px}$, e.g. iPhone 13/14/15, Galaxy S23)
- Base design canvas ($375 \times 812\text{pt}$ reference).
- Margins: $16\text{dp}$ horizontal gutter.
- Card padding: $16\text{dp}$ inner spacing.

### 3.3. Large Phone ($391\text{px} - 430\text{px}$, e.g. iPhone Pro Max, Pixel 8 Pro)
- Margins: $20\text{dp}$ horizontal gutter.
- Seat Map: Enhanced deck spacing with comfortable 4-seat aisle alignment.

### 3.4. Tablet / Foldable ($ \ge 768\text{px}$, e.g. iPad, Galaxy Fold unfolded, POS Tablet)
- Passenger App: Maximum readable container width locked to $600\text{dp}$ centered with neutral backdrop.
- Driver / POS App: Adaptive split screen (Left: Manifest Stop List; Right: Realtime QR Scanner & Boarding Camera Feed).
