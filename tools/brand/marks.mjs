// BusGo brand marks as SVG (viewBox 0 0 100 100): a map pin holding a bus front. Passenger blue, driver dark with amber.
export const THEMES = {
  passenger: { bg1: '#3B82F6', bg2: '#1D4ED8', pin: '#FFFFFF', bus: '#1D4ED8', glass: '#FFFFFF', accent: '#FBBF24' },
  driver: { bg1: '#1E293B', bg2: '#0B1220', pin: '#FFFFFF', bus: '#F59E0B', glass: '#FFFFFF', accent: '#22C55E' },
};
// Pin with a bus front inside. scale shrinks the mark around the center (adaptive safe zone).
function mark(t, scale = 1, { mono = false } = {}) {
  const pin = 'M50 90 C50 90 20 60 20 42 A30 30 0 1 1 80 42 C80 60 50 90 50 90 Z';
  const bus = `<rect x="35" y="24" width="30" height="31" rx="7" fill="${mono ? 'black' : t.bus}"/>
    <rect x="39" y="28" width="22" height="11" rx="2.5" fill="${mono ? 'white' : t.glass}"/>
    <circle cx="42" cy="47" r="2.6" fill="${mono ? 'white' : t.glass}"/>
    <circle cx="58" cy="47" r="2.6" fill="${mono ? 'white' : t.glass}"/>
    <rect x="37" y="55" width="6" height="5" rx="1.5" fill="${mono ? 'black' : t.bus}"/>
    <rect x="57" y="55" width="6" height="5" rx="1.5" fill="${mono ? 'black' : t.bus}"/>`;
  const g = `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">`;
  if (mono) {
    // One colour: the pin in white with the bus cut out (Android notification and themed icons).
    return `${g}<mask id="m"><path d="${pin}" fill="white"/>${bus}</mask><rect width="100" height="100" fill="white" mask="url(#m)"/></g>`;
  }
  return `${g}<path d="${pin}" fill="${t.pin}"/>${bus}</g>`;
}
const grad = (t) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>`;
export const svg = {
  // Full icon: rounded square (Android legacy, in-app logo).
  rounded: (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${grad(t)}<rect width="100" height="100" rx="22" fill="url(#g)"/>${mark(t, 0.72)}</svg>`,
  // Full bleed square (iOS masks the corners itself; no transparency allowed).
  square: (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${grad(t)}<rect width="100" height="100" fill="url(#g)"/>${mark(t, 0.7)}</svg>`,
  // Adaptive foreground: the mark inside the 66/108 safe zone, transparent around.
  foreground: (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(t, 0.56)}</svg>`,
  // Adaptive background as an image (the gradient).
  background: (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${grad(t)}<rect width="100" height="100" fill="url(#g)"/></svg>`,
  monochrome: (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(t, 0.56, { mono: true })}</svg>`,
  notification: (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(t, 1.0, { mono: true })}</svg>`,
  // The mark alone, full size (splash, in-app).
  mark: (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(t, 1.0)}</svg>`,
};
