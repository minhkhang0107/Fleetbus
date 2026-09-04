/**
 * FleetBus Passenger Design System Tokens
 * Strict adherence to screen-spec/passenger/DESIGN.md
 */

export const DESIGN_TOKENS = {
  name: 'BusGo Passenger Design System',
  colors: {
    canvasPassenger: '#F8FAFC',
    surfaceCard: '#FFFFFF',
    charcoalInk: '#0F172A',
    mutedSteel: '#64748B',
    whisperBorder: 'rgba(226, 232, 240, 0.7)',
    primarySapphire: '#2563EB',
    primarySapphireSoft: '#EFF6FF',
    emeraldSafe: '#16A34A',
    emeraldSoft: '#F0FDF4',
    amberHold: '#D97706',
    amberSoft: '#FEF3C7',
    alertCrimson: '#DC2626',
    alertCrimsonSoft: '#FEE2E2',
    pnrOrange: '#FB9821',
    pnrOrangeSoft: '#FFF7ED',
    seatBookedBg: '#E2E8F0',
    seatBookedBorder: '#CBD5E1',
    seatBookedText: '#94A3B8',
  },
  typography: {
    fontFamilyBase: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontFamilyMono: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    displayLg: { fontSize: '32px', fontWeight: '700', lineHeight: '1.2', letterSpacing: '-0.02em' },
    headlineMd: { fontSize: '22px', fontWeight: '600', lineHeight: '1.3', letterSpacing: '-0.01em' },
    bodyBase: { fontSize: '15px', fontWeight: '400', lineHeight: '1.5' },
    bodySm: { fontSize: '13px', fontWeight: '400', lineHeight: '1.4' },
    monoData: { fontSize: '14px', fontWeight: '600', lineHeight: '1.2' },
    monoTimer: { fontSize: '12px', fontWeight: '700', lineHeight: '1.0' },
  },
  borderRadius: {
    sm: '0.375rem',
    default: '0.75rem',
    lg: '1.0rem',
    xl: '1.5rem',
    full: '9999px',
  },
  spacing: {
    gutterMobile: '16px',
    unit: '4px',
    touchTargetMin: '44px',
    ctaHeight: '54px',
  },
  antiPatternsBanned: [
    'NO_EMOJIS',
    'NO_INTER_FONT',
    'NO_PURE_BLACK_000000',
    'NO_PURPLE_NEON_GRADIENTS',
    'NO_THREE_LAYER_NESTED_CARDS',
  ]
};
