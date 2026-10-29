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
import { Messenger } from './core/messaging.js';
import { findShareHolder } from './core/homeTracking.js';
import { DriverCockpitService } from './services/driver/modules/driverService.js';
import { ManagerOperationsService } from './services/manager/modules/managerService.js';

import { setCorsHeaders, sendError, readRawBody, clientIp } from './middleware/httpUtils.js';
import { createAuthRateLimiters } from './core/rateLimit.js';
import { backupConfig, startBackups } from './core/backup.js';
import { handlePassengerRoutes, trackingFor } from './routes/passengerRoutes.js';
import { handleDriverRoutes } from './routes/driverRoutes.js';
import { handleManagerRoutes } from './routes/managerRoutes.js';
import { handleWebhookRoutes } from './routes/webhookRoutes.js';
import { handlePlatformRoutes } from './routes/platformRoutes.js';
import { handleServiceConfigRoutes } from './routes/serviceConfigRoutes.js';
import { handlePaymentSettingsRoutes } from './routes/paymentSettingsRoutes.js';
import { handlePromoBannerRoutes } from './routes/promoBannerRoutes.js';
import { handleVoucherRoutes } from './routes/voucherRoutes.js';
import { handleScheduleRoutes } from './routes/scheduleRoutes.js';
import { handleStaffRoutes } from './routes/staffRoutes.js';
import { handleTripExceptionRoutes } from './routes/tripExceptionRoutes.js';
import { handleLegalRoutes } from './routes/legalRoutes.js';
import { renderOnboardingPage, renderOnboardingNotFound } from './web/onboarding.js';
import { renderTripSharePage } from './web/tripShare.js';
import { renderLegalPage, renderLegalNotFound, renderAccountDeletionPage } from './web/legalPages.js';
import { findOperatorByCode, findOperatorById } from './core/operators.js';
import { reconcileSweep } from './core/payments/reconcile.js';
import { FleetBusEventBridge } from './core/fleetBusEventBridge.js';
import { getWebhookSecret, getAuthMode, isProduction } from './config.js';
import { resolveAccess, authenticate, IdempotencyStore, resolveOperator } from './core/gateway.js';
import { TenantDatabases } from './core/tenantDb.js';
import { seedPromoBanners } from './core/promoBanners.js';
import { seedVouchers } from './core/vouchers.js';
import { loadMasterKey } from './core/dbCrypto.js';
import { StateStore } from './core/stateStore.js';
import { knownOperatorIds, stateCollections } from './core/stateCollections.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_MAIN = import.meta.url === `file://${process.argv[1]}`;

/**
 * Folder of the company databases (D126): FLEETBUS_DATA_DIR, else `data/` when this file is the running
 * server; imported as a library (tests) the databases stay in memory.
 */
function defaultDataDir() {
  if (process.env.FLEETBUS_DATA_DIR) return path.resolve(process.env.FLEETBUS_DATA_DIR);
  return IS_MAIN ? path.resolve(__dirname, '../../data') : null;
}

function seedTenant(db, operatorId) {
  if (!isProduction()) {
    seedPromoBanners(db, operatorId);
    seedVouchers(db);
  }
}

function openTenantDbs(dataDir, env = process.env) {
  const masterKey = loadMasterKey({ dataDir, production: isProduction(), env });
  return new TenantDatabases({ dataDir, seed: seedTenant, masterKey });
}

// A live ping only; a batch replay of offline pings is stored before its answer, as the app then drops its queue.
const GPS_PING_RE = /^\/api\/v1\/driver\/trips\/[^/]+\/telemetry$/;

/** Reads and live GPS pings are stored by the background flush, not before their answer. */
function isDeferredRequest(method, pathname) {
  return method === 'GET' || method === 'HEAD' || GPS_PING_RE.test(pathname);
}

export function createFleetBusServer(customServices = {}) {
  const eventBridge = customServices.eventBridge || new FleetBusEventBridge();

  const services = {
    authService: customServices.authService || new PassengerAuthService(),
    searchService: customServices.searchService || new PassengerSearchService(),
    seatMapService: customServices.seatMapService || new PassengerSeatMapService(),
    checkoutService: customServices.checkoutService || new PassengerCheckoutService(),
    paymentService: customServices.paymentService || new PassengerPaymentService(),
    trackingService: customServices.trackingService || new PassengerTrackingService(),
    messenger: customServices.messenger || new Messenger({ env: customServices.env, fetchImpl: customServices.fetchImpl }),
    driverService: customServices.driverService || new DriverCockpitService(),
    managerService: customServices.managerService || new ManagerOperationsService(),
    tenantDbs: customServices.tenantDbs || openTenantDbs(customServices.dataDir !== undefined ? customServices.dataDir : defaultDataDir(), customServices.env),
    fetchImpl: customServices.fetchImpl || globalThis.fetch,
    rateLimits: createAuthRateLimiters(customServices.rateLimits),
    env: customServices.env || process.env,
    eventBridge,
    config: {
      webhookSecret: customServices.webhookSecret !== undefined ? customServices.webhookSecret : getWebhookSecret(),
      authMode: customServices.authMode || getAuthMode(),
    },
  };

  eventBridge.bindServices(services);

  // Notices that must reach a closed app or a phone without the app go out by push or SMS (D144).
  services.trackingService.messenger = services.messenger;
  services.authService.messenger = services.messenger;

  if (isProduction() && !services.messenger.smsUrl) {
    console.warn('[sms] Cảnh báo: Chưa cấu hình FLEETBUS_SMS_WEBHOOK_URL trong production — không thể gửi mã OTP qua SMS');
  }

  const idempotency = new IdempotencyStore();

  // Working data lives in the company databases (D127): loaded now, written after every request.
  const store = new StateStore({ tenantDbs: services.tenantDbs, collections: stateCollections(services, { idempotency }), knownScopes: knownOperatorIds });
  services.tenantDbs.lock();
  try {
    store.boot();
  } catch (err) {
    services.tenantDbs.close();
    throw err;
  }
  // A mutation cut short by a stop never finished: its key is free again.
  for (const [key, entry] of idempotency.entries) if (!entry.done) idempotency.entries.delete(key);
  services.store = store;
  for (const operatorId of knownOperatorIds()) {
    const chain = services.managerService.verifyAuditChain(operatorId);
    if (!chain.intact) console.error(`[audit] Nhật ký của ${operatorId} bị đứt tại ${chain.broken_at}: có dòng bị xóa hoặc sửa`);
  }

  function dispatchRoutes(req, res, pathname, parsedUrl) {
    try {
      if (handleLegalRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handlePassengerRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleDriverRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleTripExceptionRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleStaffRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleManagerRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleWebhookRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handlePlatformRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleServiceConfigRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handlePaymentSettingsRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handlePromoBannerRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleVoucherRoutes(req, res, pathname, parsedUrl, services)) return;
      if (handleScheduleRoutes(req, res, pathname, parsedUrl, services)) return;
    } catch (err) {
      if (err.code === 'TENANT_REQUIRED') sendError(res, err.message, err.code, 400);
      else sendError(res, err.message, err.code === 'TENANT_DB_MISMATCH' ? err.code : 'INTERNAL_SERVER_ERROR', 500);
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

      const scope = `${req.operatorId}:${req.identity.sub}:${req.method}:${pathname}:${key}`;
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

  function loadStaticSuite(distRel, designRel) {
    const distPath = path.resolve(__dirname, distRel);
    const htmlPath = path.resolve(__dirname, designRel);
    const target = fs.existsSync(distPath) ? distPath : (fs.existsSync(htmlPath) ? htmlPath : null);
    return target ? fs.readFileSync(target) : null;
  }

  const staticSuites = {
    passenger: loadStaticSuite('../../source/passenger/web_dist/index.html', '../../docs/designs/passenger_suite.html'),
    driver: loadStaticSuite('../../source/driver/web_dist/index.html', '../../docs/designs/driver_cockpit.html'),
    manager: loadStaticSuite('../../source/manager/web_dist/index.html', '../../docs/designs/manager_portal.html'),
  };

  const STATIC_ROUTES = new Map([
    ['/', 'passenger'],
    ['/index.html', 'passenger'],
    ['/passenger', 'passenger'],
    ['/driver', 'driver'],
    ['/driver/cockpit', 'driver'],
    ['/driver.html', 'driver'],
    ['/manager', 'manager'],
    ['/ops', 'manager'],
    ['/manager.html', 'manager'],
    ['/admin', 'manager'],
  ]);

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = parsedUrl.pathname;

    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Static client suite served from in-memory cache without database flush (GET and HEAD)
    if (req.method === 'GET' || req.method === 'HEAD') {
      const suite = STATIC_ROUTES.get(pathname);
      if (suite && staticSuites[suite]) {
        const body = staticSuites[suite];
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
    }

    // Storage failed earlier: memory may be ahead of the databases, so answer nothing until a restart.
    if (store.failed) {
      sendError(res, 'Hệ thống tạm ngừng do lỗi lưu dữ liệu', 'STORAGE_UNAVAILABLE', 503);
      return;
    }
    // Writes that change business data are stored before their answer; reads and GPS pings are stored
    // within a second. If a synchronous flush fails the client gets no answer.
    const isDeferred = isDeferredRequest(req.method, pathname);
    const end = res.end.bind(res);
    res.end = (...args) => {
      if (isDeferred) {
        store.markDirty();
        return end(...args);
      }
      try {
        store.flush();
      } catch (err) {
        console.error(`[storage] ${err.message}`);
        res.destroy();
        return res;
      }
      return end(...args);
    };

    const onboarding = req.method === 'GET' && pathname.match(/^\/o\/([A-Za-z0-9]{1,32})\/?$/);
    if (onboarding) {
      const op = findOperatorByCode(onboarding[1]);
      if (!op || op.active === false) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderOnboardingNotFound());
        return;
      }
      const host = req.headers.host || `localhost:${process.env.PORT || 3000}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderOnboardingPage(op, `http://${host}/o/${op.code}`));
      return;
    }

    const trackingShare = req.method === 'GET' && pathname.match(/^\/t\/([A-Za-z0-9_-]{24})\/?$/);
    if (trackingShare) {
      const token = trackingShare[1];
      // An app ticket shared by its owner, or a phone booking's SMS link (D144).
      const holder = findShareHolder(services, token);
      const ticketFound = holder ? { trip_id: holder.tripId, operator_id: holder.operatorId } : null;
      if (!ticketFound) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Không tìm thấy</h1><p>Link theo dõi không hợp lệ hoặc đã hết hạn.</p>');
        return;
      }
      const op = findOperatorById(ticketFound.operator_id);
      if (!op || op.active === false) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Lỗi nhà xe</h1><p>Nhà xe không tồn tại.</p>');
        return;
      }
      
      const shareUrl = new URL(`http://localhost/api/v1/trips/${ticketFound.trip_id}/tracking?share=${encodeURIComponent(token)}`);
      const initialData = trackingFor({ operatorId: op.operator_id, headers: req.headers }, services, ticketFound.trip_id, shareUrl);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderTripSharePage(token, ticketFound.trip_id, op.code, initialData));
      return;
    }

    // Public legal pages and the account deletion page (Google Play asks for both at a URL, without the app).
    if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/legal' || pathname.startsWith('/legal/') || pathname.startsWith('/xoa-tai-khoan'))) {
      const legal = pathname.match(/^\/legal\/([^/]+)\/([^/]+)\/?$/);
      const deletion = /^\/xoa-tai-khoan\/?$/.test(pathname);
      const page = legal ? renderLegalPage(legal[1], legal[2]) : deletion ? renderAccountDeletionPage() : null;
      res.writeHead(page ? 200 : 404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': deletion ? 'no-store' : 'public, max-age=300',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'"
      });
      res.end(req.method === 'HEAD' ? undefined : page || renderLegalNotFound());
      return;
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
    }

    // Staff sign in by email, unique on the platform, so no company is named; once signed in, a company user's
    // company comes from the token and the platform admin has none (in production a missing company is otherwise
    // refused, which locked every office user out).
    const staffAuth = (pathname.startsWith('/api/v1/ops/auth/') || pathname === '/api/v1/auth/staff/login')
      && (!req.identity || req.identity.role === 'PLATFORM_ADMIN');
    const exemptFromOperator = pathname === '/health' || pathname === '/openapi.json' || pathname === '/api/v1/openapi.json' || pathname.startsWith('/api/v1/webhooks/') || pathname.startsWith('/api/v1/platform/') || pathname === '/api/v1/legal' || staffAuth;
    if (!exemptFromOperator) {
      const opResult = resolveOperator(req, parsedUrl, req.identity, { production: isProduction() });
      if (!opResult.ok) {
        sendError(res, opResult.message, opResult.code, opResult.status);
        return;
      }
      req.operator = opResult.operator;
      req.operatorId = opResult.operator.operator_id;
      // Every ops request the platform admin makes inside a company is recorded (spec 2.3).
      if (req.identity?.role === 'PLATFORM_ADMIN') {
        services.managerService.recordAudit({ actor: req.identity.sub, role: 'PLATFORM_ADMIN', action: `PLATFORM_ACCESS ${req.method}`, resource: pathname, ip: clientIp(req, services.env), operator_id: req.operatorId });
      }
    }

    if (services.config.authMode === 'enforce' && access.kind !== 'public' && access.idempotent) {
      dispatchIdempotent(req, res, pathname, parsedUrl);
      return;
    }

    dispatchRoutes(req, res, pathname, parsedUrl);
  });

  const reconcileIntervalMs = customServices.reconcileIntervalMs !== undefined
    ? Number(customServices.reconcileIntervalMs)
    : 0;
  let reconcileTimer = null;
  if (reconcileIntervalMs > 0) {
    let sweepRunning = false;
    reconcileTimer = setInterval(() => {
      if (sweepRunning) return;
      sweepRunning = true;
      reconcileSweep(services).finally(() => {
        sweepRunning = false;
      });
    }, reconcileIntervalMs);
    reconcileTimer.unref();
  }

  const persistIntervalMs = customServices.persistIntervalMs !== undefined
    ? Number(customServices.persistIntervalMs)
    : 1000;
  let persistTimer = null;
  if (persistIntervalMs > 0) {
    persistTimer = setInterval(() => {
      store.flushIfDirty();
    }, persistIntervalMs);
    persistTimer.unref();
  }

  server.on('close', () => {
    if (reconcileTimer) clearInterval(reconcileTimer);
    if (persistTimer) clearInterval(persistTimer);
    store.flushIfDirty();
    services.tenantDbs.close();
  });

  return { server, services };
}

const defaultReconcileMs = IS_MAIN
  ? (process.env.FLEETBUS_RECONCILE_MS !== undefined ? Number(process.env.FLEETBUS_RECONCILE_MS) : 60000)
  : 0;
export const { server, services } = createFleetBusServer({ reconcileIntervalMs: defaultReconcileMs });

const PORT = process.env.PORT || 3000;

// Release the data folder on a normal stop (Ctrl+C, service manager); flushes pending writes before closing.
if (IS_MAIN) {
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    services.store?.flushIfDirty();
    services.tenantDbs.close();
    process.exit(0);
  });
}

if (process.env.NODE_ENV !== 'test' && IS_MAIN) {
  // Copies of every database on a timer (H-08); FLEETBUS_BACKUP=off turns it off.
  const backups = backupConfig(services.tenantDbs.dataDir);
  if (backups) startBackups(services.tenantDbs, { ...backups, beforeRun: () => services.store?.flushIfDirty() });
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
