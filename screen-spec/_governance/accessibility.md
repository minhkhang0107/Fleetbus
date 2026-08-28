# BusGo Accessibility & Ergonomics Standards

**Document Version:** 1.0  
**Standard Compliance:** WCAG 2.1 Level AA + ISO 9241 Ergonomics + Transportation In-Vehicle Safety Standards

---

## 1. Ergonomic Principles by Persona

### 1.1. Passenger App Ergonomics (Mobile)
- **Minimum Touch Target:** $48 \times 48\text{dp}$ for all interactive elements (buttons, stop pickers, tab bars).
- **Seat Cell Hit Area:** While visual seat cells may measure $36 \times 36\text{dp}$, the interactive touch bounding box MUST be extended to $\ge 48 \times 48\text{dp}$ via transparent padding.
- **Safe Area Insets:** Content must strictly avoid hardware obstructions:
  - Top Safe Area (Notch / Dynamic Island): minimum padding `env(safe-area-inset-top)`.
  - Bottom Safe Area (Home Indicator): sticky checkout / booking bars must add `env(safe-area-inset-bottom)` reserve padding.
- **Dynamic Type Support:** All text elements must support up to $200\%$ OS-level dynamic font scaling without truncation or layout overlapping.

### 1.2. Driver App Ergonomics (Safety & Moving Vehicle Constraints)
- **Ultra-Large Touch Target:** In active driving mode (`DRI-006` through `DRI-013`), all primary operational buttons MUST have a minimum physical dimension of **$64 \times 64\text{dp}$** (ideally full screen-width pills of height $72\text{dp}$).
- **Glanceability Rule:** Key telemetry metrics (Speed, Next Stop Name, Distance, GPS Status) must be legible from a distance of $0.8\text{m}$ (mounted dashboard holder) in high-glare direct sunlight or pitch-black night.
- **Single Primary Action per State:** Driving screens must never present dense multi-choice menus. Only one large, unambiguous primary action is displayed (e.g. "XÁC NHẬN ĐẾN TRẠM", "QUÉT VÉ QR").
- **Zero Distracting Animations:** Motion intensity is set to $0$ during active trip mode. No bouncing pills, floating animations, or auto-sliding carousels.

### 1.3. Manager Portal Ergonomics (Desktop Control Center)
- **Information Density:** Optimized for high-throughput scanning ($1440\text{px}+$ viewport baseline).
- **Keyboard Navigation:** Full tab-indexing and keyboard shortcuts for dispatchers (e.g., `/` to focus global search, `Esc` to close drawer, `Enter` to confirm POS booking).

---

## 2. Visual Contrast & Color-Blindness Baselines

1. **Contrast Ratio Baseline:**
   - Normal Body Text ($< 18\text{pt}$): minimum **$4.5:1$** contrast against background.
   - Large Text ($\ge 18\text{pt}$ or $\ge 14\text{pt}$ bold): minimum **$3.0:1$** contrast.
   - Active UI Components & Borders: minimum **$3.0:1$** contrast against adjacent surfaces.
2. **Color-Blindness Independence (Deuteranopia / Protanopia / Tritanopia):**
   - Color is NEVER used as the sole conveyor of information.
   - Every status color is paired with a distinct icon and explicit text label:
     - Available Seat: White background + Thin Border + Clean Number.
     - Held Seat: Amber fill + Small Clock Glyph + "Đang giữ".
     - Booked Seat: Muted Slate fill + "Đã đặt".
     - Blocked Seat: Red Crosshatch Pattern + "Khóa".

---

## 3. Screen Reader & Semantic Grouping Specifications

### 3.1. Vietnamese Screen Reader Formats (TalkBack / VoiceOver)
| Component | Screen Reader Announcement String |
| :--- | :--- |
| **`SeatCell` (Available)** | *"Ghế [Mã ghế], Tầng [Tầng], Giá [Giá] đồng, Trạng thái: Còn trống cho chặng của bạn. Nhấn đúp để chọn."* |
| **`SeatCell` (Held)** | *"Ghế [Mã ghế], Tầng [Tầng], Trạng thái: Đang được hành khách khác giữ chỗ. Không thể chọn."* |
| **`CountdownTimer`** | *"Thời gian giữ ghế còn lại: [Số phút] phút [Số giây] giây."* (Announced at milestones: 5 min, 2 min, 1 min, 30s). |
| **`ETABadge`** | *"Dự kiến xe đến trạm [Tên trạm] sau [Số phút] phút, khoảng cách [Số km] ki-lô-mét."* |
| **`QRCodeView`** | *"Mã QR vé xe điện tử cho chuyến đi [Chặng đi - đến], mã đặt chỗ [PNR]. Đưa mã này cho tài xế khi lên xe."* |
| **`ConnectionBadge` (Offline)**| *"Cảnh báo: Thiết bị đang mất kết nối mạng. Dữ liệu chuyến đi đang được lưu tạm thời."* |

### 3.2. Focus Order & Semantic Landmarks
1. **Header / Navigation Landmark:** Top App Bar (`h1` title, back button, connection pill).
2. **Main Content Landmark:** Primary operational content (Trip details, Seat grid, Manifest list).
3. **Sticky Action Landmark:** Bottom action bar (Total fare summary, Continue CTA button).
