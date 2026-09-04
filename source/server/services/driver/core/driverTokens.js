/**
 * FleetBus Driver Tactical Design System Tokens
 * Strict adherence to screen-spec/driver/DESIGN.md
 */

export const DRIVER_TOKENS = {
  name: 'BusGo Driver Tactical Design System',
  colors: {
    canvasOps: '#0F172A',
    surfacePanel: '#1E293B',
    surfaceCardActive: '#334155',
    textHighContrast: '#F8FAFC',
    textMuted: '#94A3B8',
    borderTactical: '#334155',
    primaryAction: '#2563EB',
    primaryActionActive: '#1D4ED8',
    emeraldSafe: '#16A34A',
    emeraldSoft: '#064E3B',
    amberWarning: '#D97706',
    amberSoft: '#78350F',
    alertCritical: '#DC2626',
    alertSoft: '#7F1D1D',
    pnrOrange: '#FB9821',
  },
  typography: {
    fontFamilyBase: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontFamilyMono: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    telemetryXl: { fontSize: '36px', fontWeight: '700', lineHeight: '1.1' },
    telemetryLg: { fontSize: '24px', fontWeight: '700', lineHeight: '1.2' },
    headlineLg: { fontSize: '22px', fontWeight: '700', lineHeight: '1.2' },
    headlineMd: { fontSize: '18px', fontWeight: '600', lineHeight: '1.3' },
    bodyBase: { fontSize: '15px', fontWeight: '500', lineHeight: '1.4' },
    monoData: { fontSize: '14px', fontWeight: '600', lineHeight: '1.2' },
    monoSm: { fontSize: '12px', fontWeight: '500', lineHeight: '1.2' },
  },
  spacing: {
    touchTargetPrimary: '64px',
    touchTargetCockpit: '72px',
    gutter: '16px',
    unit: '4px',
  },
  safetyInvariants: [
    'ZERO_DISTRACTING_ANIMATIONS_IN_DRIVE_MODE',
    'MINIMUM_64DP_TOUCH_TARGETS',
    'HIGH_CONTRAST_DARK_COCKPIT_DEFAULT',
    'OFFLINE_TELEMETRY_BUFFERING',
  ]
};
