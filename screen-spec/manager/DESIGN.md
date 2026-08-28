---
name: BusGo Manager Operational Control Center Design System
colors:
  canvas-ops-light: '#F8FAFC'
  surface-panel: '#FFFFFF'
  surface-header: '#0F172A'
  surface-sidebar: '#0F172A'
  sidebar-active: '#1E293B'
  charcoal-ink: '#0F172A'
  text-muted: '#64748B'
  border-whisper: rgba(226, 232, 240, 0.8)
  primary-sapphire: '#2563EB'
  primary-sapphire-soft: '#EFF6FF'
  emerald-safe: '#16A34A'
  emerald-soft: '#F0FDF4'
  amber-warning: '#D97706'
  amber-soft: '#FEF3C7'
  alert-critical: '#DC2626'
  alert-soft: '#FEF2F2'
  pnr-orange: '#FB9821'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.3'
  body-base:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.3'
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.2'
  mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.2'
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.375rem
  lg: 0.5rem
  full: 9999px
spacing:
  gutter: 24px
  unit: 4px
  table-row-height: 48px
  table-row-compact: 38px
---

# Design System: BusGo Manager Operational Control Center

## 1. Visual Theme & Atmosphere
A high-density, mission-critical operational web portal engineered for transportation managers, dispatchers, fleet directors, and financial controllers. The interface pairs an authoritative dark command header/sidebar (`#0F172A`) with an ultra-clean, high-contrast light canvas (`#F8FAFC` and `#FFFFFF`) to maximize daytime operational efficiency, scannability, and rapid decision-making across complex multi-panel workflows.

Density: 8 (High Information Density Desktop Operations)
Variance: 5 (Structured Modular Workspaces)
Motion: 3 (Subtle Micro-Transitions & Live Telemetry Pulses)

## 2. Color Palette & Roles
- **Canvas Ops** (`#F8FAFC`) — Desktop workspace background.
- **Surface Panel** (`#FFFFFF`) — High-density data tables, analytical cards, filter strips, and modal dialogs.
- **Surface Shell / Sidebar** (`#0F172A`) — Tactical dark sidebar navigation and top command header.
- **Charcoal Ink** (`#0F172A`) — Primary high-contrast text, table headers, and vital metrics.
- **Muted Steel** (`#64748B`) — Secondary metadata, timestamps, table column headers, and helper text.
- **Whisper Border** (`rgba(226, 232, 240, 0.8)`) — 1px crisp structural dividing lines and grid borders.
- **Primary Sapphire** (`#2563EB`) — Primary operational buttons, active navigation items, selected table rows.
- **Emerald Safe** (`#16A34A`) — GPS Live status, matched financial transactions, on-time dispatches, confirmed trips.
- **Amber Warning** (`#D97706`) — GPS Stale warnings, delayed departures, payment mismatches requiring manual review.
- **Alert Critical** (`#DC2626`) — No GPS signal on active trip, severe route deviations, dispatch conflicts, emergency SOS.
- **PNR Orange** (`#FB9821`) — Ticketing identifiers, booking reference pills, and promotion badges.

## 3. Typography Rules
- **Display & Headings:** `Geist` — Clean, weight-driven sans-serif with tight tracking for enterprise clarity.
- **Body & Labels:** `Geist` — Highly readable at 12px-14px for data-heavy operations.
- **Mono Data & Telemetry:** `JetBrains Mono` — Mandatory for PNRs (`BG-88219`), vehicle plates (`29B-123.45`), GPS speeds (`62 km/h`), coordinates (`20.9812, 105.8430`), financial amounts (`880.000 đ`), and countdown timers.

## 4. Enterprise Component Patterns
- **Global App Shell:** Fixed 240px dark sidebar (`#0F172A`), top command bar (56px) with tenant switcher and live health telemetry pill.
- **Operational Data Tables:** Sticky headers, sortable columns, inline badge indicators, row hover highlight, 38px/48px row density, right-side detail drawer pattern.
- **Live Radar & Telemetry Split Screen:** 65% Interactive Vector Mapbox view + 35% live vehicle telemetry queue + sliding drill-down drawer.
- **Interactive Dispatch Board:** Timeline Gantt layout showing vehicle turnarounds, driver duty limits, and color-coded conflict warnings.
- **2D Visual Seat Layout Canvas:** Multi-deck seat map grid editor with drag-and-drop cabins, doors, driver cockpit, and seat inventory tagging.
- **Side-by-Side Seat Reallocation Matrix:** Dual vehicle comparison grid for emergency vehicle replacements with auto-mapping algorithms.
- **Automated Reconciliation Ledger:** Dual-column financial comparison (Gateway Ledger vs System Ledger) with mismatch flag triggers.

## 5. Anti-Patterns (BANNED)
- NO decorative emoji in enterprise tables.
- NO giant consumer hero banners or marketing fluff.
- NO pure black (`#000000`) backgrounds.
- NO low-density cards that hide tabular data.
- NO multi-level modal nesting (use slide-over right drawers).
- NO fake round metrics.
