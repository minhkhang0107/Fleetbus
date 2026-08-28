/**
 * Driver Tactical Cockpit API Route Handlers (/api/v1/driver/...)
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

export function handleDriverRoutes(req, res, pathname, parsedUrl, services) {
  const { driverService } = services;

  // POST /api/v1/driver/auth/login (DRI-001)
  if (pathname === '/api/v1/driver/auth/login' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = driverService.authenticateDriver(body.staffIdOrPhone, body.pin);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, 401, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/driver/trips/today (DRI-002)
  if (pathname === '/api/v1/driver/trips/today' && req.method === 'GET') {
    const driverId = req.headers['x-driver-id'] || 'drv_8821a';
    const result = driverService.getTodayTrips(driverId);
    sendSuccess(res, result.data);
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/readiness (DRI-004)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/readiness') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.submitReadinessChecklist(tripId, body.checklist);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/start (DRI-005)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/start') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    const result = driverService.startTrip(tripId);
    if (result.success) {
      sendSuccess(res, result.data || result);
    } else {
      sendError(res, result.error, result.code, 400);
    }
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/telemetry (DRI-006)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/telemetry') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.recordTelemetry(tripId, {
        lat: body.lat,
        lng: body.lng,
        speed_kmh: body.speed_kmh,
        bearing_deg: body.bearing_deg,
        is_offline: body.is_offline
      });
      if (result.success) {
        sendSuccess(res, result);
      } else {
        sendError(res, result.error, 'TELEMETRY_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/board-qr (DRI-009, DRI-010)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/board-qr') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const qrPayload = body.qrString || body.qrPayload;
      const result = driverService.boardPassengerByQR(tripId, qrPayload, body.now);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/collect-cod (DRI-012)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/collect-cod') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.collectCod(tripId, body.ticketId, body.amountVnd);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, 'COD_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/incident (DRI-019)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/incident') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.reportIncident(tripId, body.incidentType, body.description, body.estimatedDelayMinutes);
      if (result.success) {
        sendSuccess(res, result);
      } else {
        sendError(res, result.error, 'INCIDENT_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/telemetry/batch-replay (DRI-015)
  if (pathname === '/api/v1/driver/telemetry/batch-replay' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = driverService.replayOfflineBuffer(body.telemetryBuffer || []);
      sendSuccess(res, result);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/end (DRI-017)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/end') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.endTrip(tripId, body.endOdometerKm);
      if (result.success) {
        sendSuccess(res, result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  return false;
}
