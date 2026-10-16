---
name: BusGo Passenger Design System
colors:
  canvas-passenger: '#F8FAFC'
  surface-card: '#FFFFFF'
  charcoal-ink: '#0F172A'
  muted-steel: '#64748B'
  whisper-border: 'rgba(226, 232, 240, 0.7)'
  primary-sapphire: '#2563EB'
  primary-sapphire-soft: '#EFF6FF'
  emerald-safe: '#16A34A'
  emerald-soft: '#F0FDF4'
  amber-hold: '#D97706'
  amber-soft: '#FEF3C7'
  alert-crimson: '#DC2626'
  pnr-orange: '#FB9821'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body-base:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
  mono-timer:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  lg: 0.75rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter-mobile: 16px
  unit: 4px
  touch-target-min: 44px
---

# Design System: BusGo Passenger Mobile App

## 1. Visual Theme & Atmosphere
A restrained, airy, consumer-first mobile interface engineered for absolute clarity, speed, and trust. The atmosphere is clean and contemporary — pairing spacious white surfaces with crisp 1px whisper borders and high-contrast typography. It communicates institutional safety, punctuality, and transparent pricing.

Density: 3 (Consumer Airy & Spacious)
Variance: 7 (Dynamic Cards & Hero Visuals)
Motion: 5 (Smooth Transitions & Spring Taps)

## 2. Color Palette & Roles
- **Canvas White** (`#F8FAFC`) — Primary background canvas for mobile screens.
- **Pure Surface** (`#FFFFFF`) — Card containers, bottom sheets, and interactive modules.
- **Charcoal Ink** (`#0F172A`) — Primary headlines, ticket seat numbers, and high-emphasis body text.
- **Muted Steel** (`#64748B`) — Subtitles, station metadata, and secondary labels.
- **Whisper Border** (`rgba(226, 232, 240, 0.7)`) — 1px container borders and divider lines.
- **Sapphire Accent** (`#2563EB`) — Primary actions, selected seat states, route lines, and active tabs.
- **Emerald Safe** (`#16A34A`) — Confirmed tickets, verified boarding passes, and on-time badges.
- **Amber Hold** (`#D97706`) — Real-time seat reservation countdowns and delay alerts.
- **PNR Orange** (`#C2410C` text on `#FFF7ED`) — Booking reference codes and promotional discount tags. `#FB9821` stays a fill only; as text it fails 4.5:1.
- **Alert Crimson** (`#DC2626`) — Booking cancellation notices and error alerts.

## 3. Typography Rules
- **Display/Headlines:** `Geist` — Track-tight, weight-driven hierarchy. No oversized shouting text.
- **Body:** `Geist` — Relaxed leading (1.5), high contrast against white backgrounds.
- **Mono:** `JetBrains Mono` — Mandatory for PNR identifiers (`BG-88219`), seat codes (`A02`), ticket price numerals (`220.000 đ`), and countdown timers (`09:59`).
- **Anti-patterns:** No `Inter`, no generic serif fonts (`Times New Roman`, `Georgia`), no rainbow gradient text.

## 4. Component Stylings
- **Buttons:** Flat, solid fill, 48px to 54px height. Primary buttons use Sapphire Accent (`#2563EB`) with tactile `-1px` scale on press. Secondary buttons use ghost styling with whisper borders.
- **Trip & Ticket Cards:** Rounded corners (12px, `design-system.md` section 7), 1px whisper border (`rgba(226, 232, 240, 0.7)`), subtle elevated surface, zero heavy blur drop shadows.
- **Interactive 2D Seat Matrix:** 
  - *Available:* Pure white fill, 1px Slate border, Charcoal text.
  - *Selected:* Sapphire Accent fill (`#2563EB`), White text, subtle spring pop.
  - *Held (Redis Lock):* Soft Amber fill (`#FEF3C7`), Amber border, JetBrains Mono timer badge.
  - *Booked/Occupied:* Slate-100 fill, Slate-300 border, visually muted.
- **Live Tracking Map Module:** Vector polyline in Sapphire Blue, moving vehicle marker with directional heading pill, pulsing green radar beacon for real-time telemetry.
- **Cryptographic QR Code:** High-contrast square QR with central BusGo security shield, protected by full screen brightness booster.
- **Inputs:** Label above input, 48px height, 1px whisper border, 2px Sapphire focus ring.

## 5. Layout Principles
- **Mobile-First Structure:** 390px viewport baseline, 16px screen gutters, single-column vertical flow.
- **Spatial Separation:** Clean breathing room between modules (16px - 24px vertical margins). No overlapping absolute elements.
- **Sticky Actions:** Bottom action sheets anchored with safe-area insets (`padding-bottom: env(safe-area-inset-bottom)`).

## 6. Motion & Interaction
- **Spring Physics:** `stiffness: 120, damping: 18` for bottom sheets and seat selection feedback.
- **Realtime Pulse:** Subtle pulse effect on live bus telemetry markers.
- **Staggered Mount:** Search results and ticket cards reveal with graceful 40ms cascade delays.

## 7. Anti-Patterns (BANNED)
- NO emojis anywhere in the UI.
- NO `Inter` font.
- NO pure black (`#000000`).
- NO purple/neon glow gradients.
- NO 3-layer nested cards.
- NO generic placeholder names ("John Doe", "Acme").
- NO AI copywriting clichés ("Elevate your travel experience").
- NO fake round numbers.
