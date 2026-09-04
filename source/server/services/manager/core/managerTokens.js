/**
 * FleetBus Manager Operational Control Center Design System Tokens
 * Strict adherence to screen-spec/manager/DESIGN.md
 */

export const MANAGER_TOKENS = {
  name: 'BusGo Manager Operational Control Center Design System',
  colors: {
    canvasOpsLight: '#F8FAFC',
    surfacePanel: '#FFFFFF',
    surfaceHeader: '#0F172A',
    surfaceSidebar: '#0F172A',
    sidebarActive: '#1E293B',
    charcoalInk: '#0F172A',
    textMuted: '#64748B',
    borderWhisper: 'rgba(226, 232, 240, 0.8)',
    primarySapphire: '#2563EB',
    primarySapphireSoft: '#EFF6FF',
    emeraldSafe: '#16A34A',
    emeraldSoft: '#F0FDF4',
    amberWarning: '#D97706',
    amberSoft: '#FEF3C7',
    alertCritical: '#DC2626',
    alertSoft: '#FEF2F2',
    pnrOrange: '#FB9821',
  },
  typography: {
    fontFamilyBase: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontFamilyMono: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    displayLg: { fontSize: '28px', fontWeight: '700', lineHeight: '1.2' },
    headlineMd: { fontSize: '20px', fontWeight: '600', lineHeight: '1.3' },
    headlineSm: { fontSize: '16px', fontWeight: '600', lineHeight: '1.3' },
    bodyBase: { fontSize: '14px', fontWeight: '400', lineHeight: '1.4' },
    bodySm: { fontSize: '12px', fontWeight: '500', lineHeight: '1.3' },
    monoData: { fontSize: '13px', fontWeight: '600', lineHeight: '1.2' },
    monoLg: { fontSize: '20px', fontWeight: '700', lineHeight: '1.2' },
    monoSm: { fontSize: '11px', fontWeight: '500', lineHeight: '1.2' },
  },
  spacing: {
    gutter: '24px',
    unit: '4px',
    tableRowHeight: '48px',
    tableRowCompact: '38px',
  },
  safetyInvariants: [
    'HIGH_INFORMATION_DENSITY_DESKTOP',
    'SLIDE_OVER_DRAWER_PATTERN',
    'REALTIME_RADAR_TELEMETRY',
    'SIDE_BY_SIDE_SEAT_REALLOCATION',
  ]
};
