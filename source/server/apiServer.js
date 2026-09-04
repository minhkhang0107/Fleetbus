/**
 * FleetBus Unified Node.js API Server & Gateway
 * Connects Passenger Mobile Apps, Driver Cockpit, Manager Portal, and external Banking/Telemetry Webhooks.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PassengerAuthService } from '../passenger-app/modules/auth.js';
import { PassengerSearchService } from '../passenger-app/modules/search.js';
import { PassengerSeatMapService } from '../passenger-app/modules/seatMap.js';
import { PassengerCheckoutService } from '../passenger-app/modules/checkout.js';
import { PassengerPaymentService } from '../passenger-app/modules/payment.js';
import { PassengerTrackingService } from '../passenger-app/modules/tracking.js';
import { DriverCockpitService } from '../driver-app/modules/driverService.js';
import { ManagerOperationsService } from '../manager-app/modules/managerService.js';

import { setCorsHeaders, sendError } from './middleware/httpUtils.js';
import { handlePassengerRoutes } from './routes/passengerRoutes.js';
import { handleDriverRoutes } from './routes/driverRoutes.js';
import { handleManagerRoutes } from './routes/managerRoutes.js';
import { handleWebhookRoutes } from './routes/webhookRoutes.js';
import { FleetBusEventBridge } from './core/fleetBusEventBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createFleetBusServer(customServices = {}) {
  const eventBridge = customServices.eventBridge || new FleetBusEventBridge();

  const services = {
    authService: customServices.authService || new PassengerAuthService(),
    searchService: customServices.searchService || new PassengerSearchService(),
    seatMapService: customServices.seatMapService || new PassengerSeatMapService(),
    checkoutService: customServices.checkoutService || new PassengerCheckoutService(),
    paymentService: customServices.paymentService || new PassengerPaymentService(),
    trackingService: customServices.trackingService || new PassengerTrackingService(),
    driverService: customServices.driverService || new DriverCockpitService(),
    managerService: customServices.managerService || new ManagerOperationsService(),
    eventBridge,
  };

  eventBridge.bindServices(services);

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = parsedUrl.pathname;

    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // =========================================================================
    // 1. STATIC CLIENT SUITE SERVING
    // =========================================================================
    if (pathname === '/' || pathname === '/index.html' || pathname === '/passenger') {
      const htmlPath = path.resolve(__dirname, '../../docs/designs/passenger_suite.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(htmlPath));
        return;
      }
    }

    if (pathname === '/driver' || pathname === '/driver/cockpit' || pathname === '/driver.html') {
      const htmlPath = path.resolve(__dirname, '../../docs/designs/driver_cockpit.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(htmlPath));
        return;
      }
    }

    if (pathname === '/manager' || pathname === '/ops' || pathname === '/manager.html' || pathname === '/admin') {
      const htmlPath = path.resolve(__dirname, '../../docs/designs/manager_portal.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(htmlPath));
        return;
      }
    }

    // Legacy Route Aliases for backward compatibility
    if (pathname === '/api/v1/app/config') {
      const version = req.headers['x-app-version'] || '3.0.0';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(services.authService.checkAppConfig(version)));
      return;
    }
    if (pathname === '/api/v1/stations') {
      const q = parsedUrl.searchParams.get('q') || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: services.searchService.searchStations(q) }));
      return;
    }
    if (pathname === '/api/v1/trips') {
      const origin = parsedUrl.searchParams.get('origin') || 'Hà Nội';
      const dest = parsedUrl.searchParams.get('destination') || 'Thanh Hóa';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(services.searchService.searchTrips({ originCity: origin, destinationCity: dest })));
      return;
    }

    // =========================================================================
    // 2. ROUTE DISPATCHERS
    // =========================================================================
    try {
      if (handlePassengerRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleDriverRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleManagerRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleWebhookRoutes(req, res, pathname, parsedUrl, services)) return;
    } catch (err) {
      sendError(res, err.message, 'INTERNAL_SERVER_ERROR', 500);
      return;
    }

    // Fallback 404
    sendError(res, `Đường dẫn ${pathname} không tồn tại trên hệ thống API FleetBus`, 'NOT_FOUND', 404);
  });

  return { server, services };
}

export const { server, services } = createFleetBusServer();

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                BUSGO FLEET PLATFORM API SERVER                     ║
║         Unified Gateway for Passenger, Driver & Manager            ║
╠════════════════════════════════════════════════════════════════════╣
║ 🚀 Server running at: http://localhost:${PORT}                       ║
║ 📱 Passenger Web Suite: http://localhost:${PORT}/passenger           ║
║ 🚌 Driver Cockpit:     http://localhost:${PORT}/driver              ║
║ 🖥️ Manager Control:    http://localhost:${PORT}/manager             ║
║ 📖 OpenAPI Spec:       http://localhost:${PORT}/api/v1/openapi.json ║
╚════════════════════════════════════════════════════════════════════╝
    `);
  });
}
