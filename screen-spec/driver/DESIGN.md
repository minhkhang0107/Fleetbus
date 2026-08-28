---
name: BusGo Driver Tactical Design System
colors:
  canvas-ops: '#0F172A'
  surface-panel: '#1E293B'
  surface-card-active: '#334155'
  text-high-contrast: '#F8FAFC'
  text-muted: '#94A3B8'
  border-tactical: '#334155'
  primary-action: '#2563EB'
  emerald-safe: '#16A34A'
  emerald-soft: '#064E3B'
  amber-warning: '#D97706'
  amber-soft: '#78350F'
  alert-critical: '#DC2626'
  alert-soft: '#7F1D1D'
  pnr-orange: '#FB9821'
typography:
  telemetry-xl:
    fontFamily: JetBrains Mono
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.1'
  telemetry-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg:
    fontFamily: Geist
    fontSize: 22px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.3'
  body-base:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '500'
    lineHeight: '1.4'
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  lg: 0.75rem
  full: 9999px
spacing:
  touch-target-primary: 64px
  touch-target-cockpit: 72px
  gutter: 16px
  unit: 4px
---

# Design System: BusGo Driver Tactical Cockpit

## 1. Visual Theme & Atmosphere
An ultra-high-contrast, tactical dark cockpit interface engineered for commercial drivers operating interprovincial buses. The atmosphere is calm, industrial, and utilitarian — designed to be readable at a glance (0.8m dashboard mount) with zero cognitive distraction and zero unnecessary motion.

Density: 6 (Glanceable Operational Density)
Variance: 3 (Strictly Predictable Layouts)
Motion: 2 (Static Restrained, 0 in Active Drive Mode)

## 2. Color Palette & Roles
- **Canvas Ops** (`#0F172A`) — Primary dark background, minimizes eye fatigue and screen glare during night driving.
- **Surface Panel** (`#1E293B`) — High-contrast container fill for telemetry blocks, stop cards, and manifest rows.
- **Text High-Contrast** (`#F8FAFC`) — Primary text, numerals, and stop names for maximum daytime/nighttime legibility.
- **Text Muted** (`#94A3B8`) — Secondary metadata, timestamps, and route notes.
- **Border Tactical** (`#334155`) — 1px crisp structural borders separating operational zones.
- **Primary Action Sapphire** (`#2563EB`) — Massive touch action buttons (64dp - 72dp) for instant single-tap execution.
- **Emerald Safe** (`#16A34A`) — GPS Live indicator, boarded confirmation, ready checklist states.
- **Amber Warning** (`#D97706`) — COD cash collection pending, delayed trip status, 10-min no-show countdowns.
- **Alert Critical** (`#DC2626`) — SOS reports, route deviations, expired/forged QR codes, hard errors.
- **PNR Orange** (`#FB9821`) — Ticketing identifiers and seat reservation numbers.

## 3. Typography Rules
- **Display & Telemetry:** `JetBrains Mono` — Mandatory for speed (km/h), distance (km), ETA countdowns, seat codes (A02), PNRs, and passenger counters. Prevents numeric jittering.
- **Headlines & Labels:** `Geist` — Clean, bold, track-tight sans-serif.
- **Banned:** No `Inter`, no generic serif fonts (`Times New Roman`, `Georgia`), no decorative scripts.

## 4. Operational Component Stylings
- **Cockpit Action Pills:** Ultra-large touch buttons (height 64px to 72px) spanning full width. Flat solid fill, high-contrast text, tactile `-1px` scale on press.
- **Telemetry Glance Deck:** Bold numerals (24px - 36px) paired with compact uppercase labels.
- **Manifest Item Cards:** High-contrast rows grouped chronologically by stop. Includes quick-action call button, COD badge, and single-tap "LÊN XE" boarding trigger.
- **QR Camera Overlay:** 60 FPS viewport with bright alignment reticle, audio beep cue, and high-visibility success/warning/error result overlays.
- **GPS Health & Offline Banners:** Top-mounted persistent status pills (`[ 🟢 GPS Live ]`, `[ 📦 Offline Queue (14) ]`).

## 5. Driver Ergonomics & Safety Rules
- **Touch Target Rule:** Minimum 64dp height for all primary operational buttons.
- **Single Primary Action:** Each screen possesses exactly ONE obvious primary CTA.
- **Zero Drive Mode Motion:** No auto-scrolling banners, no floating decorative elements.
- **Audio/Haptic Pairing:** Boarding actions paired with distinct high-pitch chime (success) vs low buzz (error/COD).

## 6. Anti-Patterns (BANNED)
- NO emojis in the UI.
- NO consumer travel marketing banners.
- NO pure black (`#000000`) — use Slate-900 `#0F172A`.
- NO tiny text (< 13px) for operational data.
- NO desktop-style dense spreadsheet tables.
- NO multi-layer modal stacks (max 1 modal layer).
- NO fake round metrics.
