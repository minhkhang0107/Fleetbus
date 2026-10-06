/**
 * FleetBus Unified Node.js API Server & Gateway
 * Connects Passenger Mobile Apps, Driver Cockpit, Manager Portal, and external Banking/Telemetry Webhooks.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PassengerAuthService } from './services/passenger/modules/auth.js';
import { PassengerSearchService } from './services/passenger/modules/search.js';
import { PassengerSeatMapService } from './services/passenger/modules/seatMap.js';
import { PassengerCheckoutService } from './services/passenger/modules/checkout.js';
import { PassengerPaymentService } from './services/passenger/modules/payment.js';
import { PassengerTrackingService } from './services/passenger/modules/tracking.js';
import { DriverCockpitService } from './services/driver/modules/driverService.js';
import { ManagerOperationsService } from './services/manager/modules/managerService.js';

import { setCorsHeaders, sendError, readRawBody } from './middleware/httpUtils.js';
import { handlePassengerRoutes } from './routes/passengerRoutes.js';
import { handleDriverRoutes } from './routes/driverRoutes.js';
import { handleManagerRoutes } from './routes/managerRoutes.js';
import { handleWebhookRoutes } from './routes/webhookRoutes.js';
import { FleetBusEventBridge } from './core/fleetBusEventBridge.js';
import { getWebhookSecret, getAuthMode } from './config.js';
import { resolveAccess, authenticate, IdempotencyStore } from './core/gateway.js';

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
    config: {
      webhookSecret: customServices.webhookSecret !== undefined ? customServices.webhookSecret : getWebhookSecret(),
      authMode: customServices.authMode || getAuthMode(),
    },
  };

  eventBridge.bindServices(services);

  const idempotency = new IdempotencyStore();

  function dispatchRoutes(req, res, pathname, parsedUrl) {
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
  }

  // A mutation with an Idempotency-Key runs once; a retry gets the stored response (api-screen-map).
  function dispatchIdempotent(req, res, pathname, parsedUrl) {
    readRawBody(req).then(raw => {
      req.rawBody = raw;
      const key = req.headers['idempotency-key'];
      if (!key) {
        sendError(res, 'Thiếu header Idempotency-Key', 'IDEMPOTENCY_KEY_REQUIRED', 400);
        return;
      }

      const scope = `${req.identity.sub}:${req.method}:${pathname}:${key}`;
      const begin = idempotency.begin(scope, IdempotencyStore.fingerprint(raw));
      if (begin.state === 'reused') {
        sendError(res, 'Idempotency-Key này đã dùng cho một yêu cầu khác', 'IDEMPOTENCY_KEY_REUSED', 422);
        return;
      }
      if (begin.state === 'in_progress') {
        sendError(res, 'Yêu cầu trước đó vẫn đang được xử lý', 'IDEMPOTENCY_IN_PROGRESS', 409);
        return;
      }
      if (begin.state === 'replay') {
        setCorsHeaders(res);
        res.writeHead(begin.entry.status, { 'Content-Type': 'application/json; charset=utf-8', 'Idempotent-Replay': 'true' });
        res.end(begin.entry.body);
        return;
      }

      let status = 200;
      const writeHead = res.writeHead.bind(res);
      res.writeHead = (code, ...rest) => { status = code; return writeHead(code, ...rest); };
      const end = res.end.bind(res);
      res.end = (chunk, ...rest) => {
        idempotency.complete(scope, status, chunk ? chunk.toString() : '');
        return end(chunk, ...rest);
      };
      dispatchRoutes(req, res, pathname, parsedUrl);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
  }

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
      const distPath = path.resolve(__dirname, '../../source/passenger/web_dist/index.html');
      const htmlPath = path.resolve(__dirname, '../../docs/designs/passenger_suite.html');
      const targetPath = fs.existsSync(distPath) ? distPath : htmlPath;
      if (fs.existsSync(targetPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(targetPath));
        return;
      }
    }

    if (pathname === '/driver' || pathname === '/driver/cockpit' || pathname === '/driver.html') {
      const distPath = path.resolve(__dirname, '../../source/driver/web_dist/index.html');
      const htmlPath = path.resolve(__dirname, '../../docs/designs/driver_cockpit.html');
      const targetPath = fs.existsSync(distPath) ? distPath : htmlPath;
      if (fs.existsSync(targetPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(targetPath));
        return;
      }
    }

    if (pathname === '/manager' || pathname === '/ops' || pathname === '/manager.html' || pathname === '/admin') {
      const distPath = path.resolve(__dirname, '../../source/manager/web_dist/index.html');
      const htmlPath = path.resolve(__dirname, '../../docs/designs/manager_portal.html');
      const targetPath = fs.existsSync(distPath) ? distPath : htmlPath;
      if (fs.existsSync(targetPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(targetPath));
        return;
      }
    }

    // =========================================================================
    // 2. GATEWAY (authentication, roles, idempotency) AND ROUTE DISPATCHERS
    // =========================================================================
    const access = resolveAccess(req.method, pathname);
    if (services.config.authMode === 'enforce' && access.kind !== 'public') {
      const auth = authenticate(req, access, pathname);
      if (!auth.ok) {
        sendError(res, auth.message, auth.code, auth.status);
        return;
      }
      req.identity = auth.identity;
      if (access.idempotent) {
        dispatchIdempotent(req, res, pathname, parsedUrl);
        return;
      }
    }

    dispatchRoutes(req, res, pathname, parsedUrl);
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
