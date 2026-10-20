# SH-006 — About & Legal (Giới thiệu và điều khoản)

**App:** Passenger, Driver, Manager Web  
**Platform:** Android / iOS / Web  
**Screen Type:** Settings sub-page / Legal reader  
**Priority:** P1  
**Route:** `/shared/about`  
**Version:** 1.0 (D157)  
**Source Requirements:** `D157`

---

## 1. Purpose & User Story
- **Purpose:** Every app shows who made it, its version, its terms of use, the licences of the open-source software it ships, and a model and data notice that says whether any AI model is used and credits the map data and fonts.
- **Actors:** Passenger, Driver / Assistant Driver, operations staff.
- **Entry Points:**
  - Passenger: tab "Cá nhân" (PAX-022) → "Giới thiệu và điều khoản".
  - Driver: tab "Hồ sơ" (DRI-018) → "Giới thiệu và điều khoản".
  - Manager Web: navigation item "Giới thiệu" (every role, the platform admin included, with or without a company picked).

## 2. Screen Structure

```text
┌──────────────────────────────────────────┐
│ ‹ Giới thiệu                             │
├──────────────────────────────────────────┤
│              [logo]                      │
│          BusGo / BusGo Driver            │
│        Phiên bản 3.0.0 (mono)            │
│ ┌──────────────────────────────────────┐ │
│ │ Điều khoản sử dụng                 › │ │
│ │ Phiên bản 1.0 · hiệu lực từ 20/10/2026│ │
│ │──────────────────────────────────────│ │
│ │ Giấy phép mã nguồn mở              › │ │
│ │ Thư viện và phông chữ dùng trong app │ │
│ │──────────────────────────────────────│ │
│ │ Giấy phép mô hình và dữ liệu       › │ │
│ │ Mô hình AI, bản đồ, phông chữ        │ │
│ └──────────────────────────────────────┘ │
│  (load error) message + "Thử lại"        │
└──────────────────────────────────────────┘
```

- **Legal reader** (terms, model and data notice): header = document title + "Phiên bản X · hiệu lực từ dd/mm/yyyy"; numbered sections "1. Heading" + body; links open in the browser.
- **Open-source licences (apps):** Flutter's licence page (`showLicensePage`), generated from every package in the build plus the SIL OFL 1.1 text of Geist and JetBrains Mono (fonts fetched by google_fonts, registered at start-up from `assets/licenses/`).
- **Manager Web:** one page with three cards: terms, open-source licences (Leaflet 1.9.4 BSD-2-Clause, Leaflet.markercluster 1.5.3 MIT, full texts in collapsible blocks), model and data notice.

## 3. API Contract

`GET /api/v1/legal?app=passenger|driver|manager` — public, no login, no bus company (the apps show it before login too).

```json
{
  "status": "success",
  "data": {
    "app": "driver",
    "version": "1.0",
    "effective_date": "2026-10-20",
    "terms": { "title": "Điều khoản sử dụng", "sections": [{ "heading": "…", "body": "…" }] },
    "model_notice": { "title": "Giấy phép mô hình và dữ liệu", "sections": [{ "heading": "…", "body": "…", "links": [{ "label": "…", "url": "https://…" }] }] }
  }
}
```

- Missing or unknown `app` → `400 INVALID_APP`.
- Source of the texts: `source/server/core/legal.js`. Changing a text means raising `LEGAL_VERSION` and `LEGAL_EFFECTIVE_DATE`.

## 4. Business Rules
- **BR-SH-006-1:** Terms are per app: passenger (service scope, account, 10-minute seat hold, cancellation and refund tiers, boarding, location and notifications, personal data under Decree 13/2023/NĐ-CP, forbidden behaviour, estimated times), driver (accounts and PIN, location only during a trip, safe driving, ticket checks and cash, incident reports, passenger data, the driver's own data), manager (personal accounts, 2-step verification for director and financial controller, roles and the audit log, controller/processor roles, published content, security). All apps end with "Thay đổi điều khoản" and "Luật áp dụng".
- **BR-SH-006-2:** The model and data notice states that no AI or machine-learning model is integrated, called, or sent data; it credits OpenStreetMap data (ODbL 1.0), OpenStreetMap France tiles and the OSRM-derived route shapes. Fonts are listed only in the two mobile apps; Firebase Cloud Messaging only in the passenger app.
- **BR-SH-006-3:** Open-source licences are listed by each client from what it really ships, so they work offline; the terms and the notice need the server and show "Chưa tải được" + "Thử lại" when it cannot be reached (their rows stay closed).
- **BR-SH-006-4:** The version shown is the app version (3.0.0); the terms carry their own version and effective date.

## 5. Acceptance Criteria
1. Each app opens the about screen from its settings entry and shows the app version.
2. "Điều khoản sử dụng" and "Giấy phép mô hình và dữ liệu" show the server texts for that app, with version and effective date.
3. "Giấy phép mã nguồn mở" opens the licence list, including Geist and JetBrains Mono (apps) or Leaflet and Leaflet.markercluster (web).
4. With the server unreachable, the open-source licences still open, the two server rows are closed, and "Thử lại" loads them once the server answers.
5. `GET /api/v1/legal` needs no token and no company; an unknown app is refused with `INVALID_APP`.
