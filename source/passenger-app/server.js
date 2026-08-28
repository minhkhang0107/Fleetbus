/**
 * FleetBus Passenger Application HTTP Server & API Gateway
 * Serves the interactive high-fidelity web suite and passenger REST API endpoints.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PassengerAuthService } from './modules/auth.js';
import { PassengerSearchService } from './modules/search.js';
import { PassengerSeatMapService } from './modules/seatMap.js';
import { PassengerCheckoutService } from './modules/checkout.js';
import { PassengerPaymentService } from './modules/payment.js';
import { PassengerTrackingService } from './modules/tracking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Initialize domain services
export const authService = new PassengerAuthService();
export const searchService = new PassengerSearchService();
export const seatMapService = new PassengerSeatMapService();
export const checkoutService = new PassengerCheckoutService();
export const paymentService = new PassengerPaymentService();
export const trackingService = new PassengerTrackingService();

export const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Static File Serving: docs/designs/passenger_suite.html
  if (pathname === '/' || pathname === '/index.html' || pathname === '/passenger') {
    const htmlPath = path.resolve(__dirname, '../../docs/designs/passenger_suite.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath));
      return;
    }
  }

  // REST API: App Config (PAX-001)
  if (pathname === '/api/v1/app/config' && req.method === 'GET') {
    const version = req.headers['x-app-version'] || '3.0.0';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(authService.checkAppConfig(version)));
    return;
  }

  // REST API: Search Stations (PAX-005)
  if (pathname === '/api/v1/stations' && req.method === 'GET') {
    const q = parsedUrl.searchParams.get('q') || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success', data: searchService.searchStations(q) }));
    return;
  }

  // REST API: Search Trips (PAX-006)
  if (pathname === '/api/v1/trips' && req.method === 'GET') {
    const origin = parsedUrl.searchParams.get('origin') || 'Hà Nội';
    const dest = parsedUrl.searchParams.get('destination') || 'Thanh Hóa';
    const vehicleType = parsedUrl.searchParams.get('vehicle_type');
    const timeSlot = parsedUrl.searchParams.get('time_slot');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(searchService.searchTrips({ originCity: origin, destinationCity: dest, vehicleType, timeSlot })));
    return;
  }

  // REST API: Seat Map (PAX-009)
  if (pathname.startsWith('/api/v1/trips/') && pathname.endsWith('/seat-map') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[4];
    const pickupId = parsedUrl.searchParams.get('pickup_stop_id') || 'stp_hn_gb';
    const dropoffId = parsedUrl.searchParams.get('dropoff_stop_id') || 'stp_th_pb';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(seatMapService.getSeatMap(tripId, pickupId, dropoffId)));
    return;
  }

  // REST API: Live GPS Telemetry Radar (PAX-018)
  if (pathname.startsWith('/api/v1/trips/') && pathname.endsWith('/radar') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[4];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(trackingService.getLiveTrackingHUD(tripId)));
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found', path: pathname }));
});

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`🚀 FleetBus Passenger Server running at http://localhost:${PORT}`);
  });
}
