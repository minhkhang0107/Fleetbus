# BusGo Design System Specification

**Document Version:** 1.0  
**Taste-Skill Alignment:** `design-taste-frontend` + Mobile Ergonomics + Control Center Architecture

---

## 1. Executive Taste & Design Philosophy

BusGo is a mission-critical transportation operating platform with three distinct user personas. Rather than applying a single generic aesthetic, the design system implements **calibrated dials** per target platform while preserving unified brand recognition:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BusGo Unified Brand                              │
│         (Color Token Harmony, Semantic Status Language, Safe Area Grid)     │
└──────────────┬──────────────────────────────┬───────────────────────────────┘
               │                              │                               │
        ▼                              ▼                               ▼
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│      Passenger App      │    │       Driver App        │    │     Manager Portal      │
│  (Flutter Mobile / iOS) │    │ (Flutter + Native GPS)  │    │   (Next.js / Desktop)   │
│                         │    │                         │    │                         │
│  DESIGN_VARIANCE: 7     │    │  DESIGN_VARIANCE: 4     │    │  DESIGN_VARIANCE: 4     │
│  MOTION_INTENSITY: 5    │    │  MOTION_INTENSITY: 3    │    │  MOTION_INTENSITY: 3    │
│  VISUAL_DENSITY: 3      │    │  VISUAL_DENSITY: 6      │    │  VISUAL_DENSITY: 8      │
│  • Premium Consumer     │    │  • Safety First         │    │  • Operations Cockpit   │
│  • Trust & Reassurance  │    │  • Glanceable (≥64dp)   │    │  • Dense Data Grids     │
│  • Smooth Micro-motion  │    │  • High Contrast (Dark) │    │  • Realtime Live Radar  │
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
```

---

## 2. Color Palette & Semantic Tokens

### 2.1. Brand Colors
- **Brand Primary (`brand.primary`):** `#2563EB` (Sapphire Blue). Design review 2026-10-07 (D95): one primary for the three apps, the value the Flutter themes already use; the old `#0F52BA` existed only in this file.
- **Brand Primary Hover / Active (`brand.primaryDark`):** `#1D4ED8`
- **Brand Container / Subtle Surface (`brand.primaryContainer`):** `#EFF6FF`
- **Brand Secondary Accent (`brand.accent`):** `#D97706` (Amber: hold countdowns, delays). The old `#FF6B00` is dropped: one amber for every warning. PNR codes keep `#C2410C` text on `#FFF7ED` (the old `#FB9821` text fails 4.5:1 on white).

### 2.2. Neutral Surfaces & Backgrounds
- **Background Base (`surface.base`):**
  - Light Mode (Passenger / Manager Default): `#F8FAFC` (Slate 50)
  - Dark Mode (Driver Default / Manager Ops Night): `#0F172A` (Slate 900)
- **Surface Elevated (`surface.elevated`):**
  - Light: `#FFFFFF` (Pure White)
  - Dark: `#1E293B` (Slate 800)
- **Surface Subtle / Card Fill (`surface.subtle`):**
  - Light: `#F1F5F9` (Slate 100)
  - Dark: `#334155` (Slate 700)
- **Border Subtle (`border.subtle`):**
  - Light: `#E2E8F0` (Slate 200)
  - Dark: `#475569` (Slate 600)
- **Border Focus / Interactive (`border.focus`):** `#2563EB`

### 2.3. Semantic Status Tokens (Strict Invariant: Never use color alone)
| Token | Hex (Light) | Hex (Dark) | Semantic Usage |
| :--- | :--- | :--- | :--- |
| `status.success` | `#16A34A` (Green 600) | `#22C55E` (Green 500) | Trip on time, Paid, Boarded, GPS Live |
| `status.warning` | `#D97706` (Amber 600) | `#F59E0B` (Amber 500) | Trip delayed, Hold expiring, Reconnecting |
| `status.error` | `#DC2626` (Red 600) | `#EF4444` (Red 500) | Cancelled, Payment Failed, No-show, GPS Lost |
| `status.info` | `#2563EB` (Blue 600) | `#3B82F6` (Blue 500) | Scheduled, Dispatch Pending, Info notice |
| `status.neutral` | `#64748B` (Slate 500) | `#94A3B8` (Slate 400) | Completed, Draft, Expired |

### 2.4. Transit & Seat Specific Tokens
| Seat State Token | Fill Color | Border Color | Text Color | Accessibility Text Label |
| :--- | :--- | :--- | :--- | :--- |
| `seat.available` | `#FFFFFF` | `#94A3B8` | `#0F172A` | "Ghế trống cho chặng của bạn" |
| `seat.selected` | `#2563EB` | `#1D4ED8` | `#FFFFFF` | "Ghế đang được bạn chọn" |
| `seat.held` | `#FEF3C7` | `#F59E0B` | `#92400E` | "Ghế đang tạm giữ bởi khách khác" |
| `seat.booked` | `#E2E8F0` | `#CBD5E1` | `#94A3B8` | "Ghế đã có khách đặt chặng này" |
| `seat.blocked` | `#FEE2E2` | `#FCA5A5` | `#991B1B` | "Ghế khóa kỹ thuật / Không mở bán" |

---

## 3. Typography Hierarchy

**Font Family:**
- **Primary Text:** `Geist`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`
- **Monospaced / Telemetry / PNR / Plate:** `Geist Mono`, `JetBrains Mono`, `SFMono-Regular`, `monospace`

| Type Style | Size (Web / Mobile) | Line Height | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Large** | `32px` / `28px` | `1.15` | Bold (700) | `-0.02em` | Splash, Marketing Hero |
| **Heading 1** | `24px` / `22px` | `1.2` | Bold (700) | `-0.015em` | Page Title (Home, Live Radar, Tickets) |
| **Heading 2** | `20px` / `18px` | `1.25` | SemiBold (600) | `-0.01em` | Section Titles, Modal Headers |
| **Heading 3** | `16px` / `15px` | `1.3` | SemiBold (600) | `0` | Card Titles, Stop Names, Seat Codes |
| **Body Regular** | `14px` / `14px` | `1.45` | Regular (400) | `0` | Standard UI Body, Explanations, Tables |
| **Body Medium** | `14px` / `14px` | `1.45` | Medium (500) | `0` | Form Labels, Table Headers |
| **Body Small** | `12px` / `12px` | `1.4` | Regular (400) | `+0.01em` | Timestamps, Secondary Metadata |
| **Monospace / Metric** | `14px` / `14px` | `1.3` | Medium (500) | `0` | PNR Code, ETA Countdown, License Plate, Lat/Lng |

---

## 4. Spacing & Elevation Tokens

### 4.1. Spacing Scale (8pt Grid System with 4pt half-steps)
- `space-1`: `4px` (Tight badge padding, icon gap)
- `space-2`: `8px` (Standard inner padding, input margin)
- `space-3`: `12px` (Card inner spacing, stacked controls)
- `space-4`: `16px` (Mobile gutter margin, section spacing)
- `space-6`: `24px` (Major section transition, modal padding)
- `space-8`: `32px` (Desktop page header gap)
- `space-12`: `48px` (Hero spacing, empty state spacing)

### 4.2. Border Radius
- `radius-sm`: `4px` (Badges, tags, small seat indicators)
- `radius-md`: `8px` (Form fields, buttons, table cell selections)
- `radius-lg`: `12px` (Cards, bottom sheet top corners, dialogs)
- `radius-full`: `9999px` (Pills, round status indicators, floating action buttons)

### 4.3. Elevation & Shadows
- `elevation-none`: `none`
- `elevation-card`: `0px 1px 3px rgba(0, 0, 0, 0.08), 0px 1px 2px rgba(0, 0, 0, 0.04)`
- `elevation-modal`: `0px 10px 25px rgba(0, 0, 0, 0.15), 0px 4px 6px rgba(0, 0, 0, 0.05)`
- `elevation-sticky-bar`: `0px -2px 10px rgba(0, 0, 0, 0.06)`

---

## 5. Motion & Interaction Rules

1. **Duration Standards:**
   - Instant Feedback (Button press, Seat select): `100ms - 150ms` (`ease-out`)
   - Surface Transitions (Modal fade, Drawer slide): `200ms - 250ms` (`cubic-bezier(0.16, 1, 0.3, 1)`)
   - Page Route Navigation: `300ms` (`ease-in-out`)
2. **Driver Mode Motion Constraint:**
   - When Driver App is in `ACTIVE_TRIP` state, **all non-essential animations are hard-disabled (`MOTION_INTENSITY: 0`)** to maximize frame rate, save battery, and eliminate cognitive lag.
3. **Reduced Motion Support:**
   - Always honor `@media (prefers-reduced-motion: reduce)` by immediately jumping layout transitions.

---

## 6. Anti-Slop Visual Rules (Taste Skill Enforcement)

1. **NO Generic AI Purple Gradients:** The brand primary is `#2563EB`. Avoid random neon fuchsia / purple radial background glows.
2. **NO 3-Layer Nested Cards:** Page -> Section -> Single Card Container. Do not wrap cards inside cards inside cards with redundant borders.
3. **NO Arbitrary Asymmetry on Operations UI:** Tables, manifests, telemetry feeds, and radar lists must be strictly aligned, tabular, and scannable.
4. **NO Emoji in Place of Icons:** All operational status icons must use standardized `@phosphor-icons` (or Lucide vector paths), never raw UTF-8 emoji glyphs.

---

## 7. Feedback, Status and Emoji Rules (design review 2026-10-07, D99 to D101)

1. **No browser dialogs.** A result is never an `alert()` or `confirm()`. Use, by weight: an inline state change on the row (boarded, collected), a toast for a reversible success, a bottom sheet (mobile) or a side panel (web) for a result the user must read (scan result, issued PNR, refund), and a confirmation sheet before an irreversible action (end trip, vehicle swap, refund approval) that names the amount or the count affected.
2. **No emoji anywhere**, including status pills, buttons and toasts. Icons are stroke SVG (Lucide or Phosphor). Every status carries a text label (`ĐÃ LÊN XE`, `CHỜ THU COD`), never color alone.
3. **No developer copy in product screens.** Simulation buttons (`GIẢ LẬP ...`), test OTP codes, refresh rates (`60Hz`, `60 FPS`), protocol names (`MQTT`, `HMAC`, `Webhook`) and touch-target sizes (`72dp`) belong to a debug build, never to a screen in this spec.
4. **Radius scale (all apps):** `4px` badges, `8px` inputs and buttons, `12px` cards and sheets, `9999px` pills. The passenger `16px` card radius is aligned to `12px`.
