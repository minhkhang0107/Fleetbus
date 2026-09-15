/**
 * Driver Tactical Cockpit API Route Handlers (/api/v1/driver/... & /api/v1/auth/driver/...)
 * Covers all specifications DRI-001 through DRI-019 and API Screen Map matrix.
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

export function handleDriverRoutes(req, res, pathname, parsedUrl, services) {
  const { driverService } = services;

  // POST /api/v1/driver/auth/login or /api/v1/auth/driver/login (DRI-001)
  if ((pathname === '/api/v1/driver/auth/login' || pathname === '/api/v1/auth/driver/login') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = driverService.authenticateDriver(body.staffIdOrPhone || body.staff_id || body.username, body.pin || body.password);
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

  // GET /api/v1/driver/trips/:tripId/manifest (DRI-007)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/manifest') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    const trip = driverService.activeTrips.get(tripId);
    if (trip) {
      sendSuccess(res, {
        trip_id: tripId,
        vehicle_plate: trip.vehicle_plate,
        boarded_count: trip.boarded_count,
        manifest: trip.manifest
      });
    } else {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
    }
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/board-qr or /api/v1/driver/trips/:tripId/boarding (DRI-009, DRI-010)
  if (pathname.startsWith('/api/v1/driver/trips/') && (pathname.endsWith('/board-qr') || pathname.endsWith('/boarding')) && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const qrPayload = body.qrString || body.qrPayload || body.qr_code;
      const result = driverService.boardPassengerByQR(tripId, qrPayload, body.now);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/collect-cod or /api/v1/driver/trips/:tripId/payments/cod-collect (DRI-012)
  if (pathname.startsWith('/api/v1/driver/trips/') && (pathname.endsWith('/collect-cod') || pathname.endsWith('/payments/cod-collect')) && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.collectCod(tripId, body.ticketId || body.ticket_id, body);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, 'COD_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/onboard-hail (DRI-006, DRI-007, REV-05)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/onboard-hail') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.onboardHailPassenger(tripId, body, body.now);
      if (result.success) {
        sendSuccess(res, result.data || result, 201);
      } else {
        sendError(res, result.error, result.code || 'HAIL_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/incident or /api/v1/driver/trips/:tripId/incidents (DRI-019)
  if (pathname.startsWith('/api/v1/driver/trips/') && (pathname.endsWith('/incident') || pathname.endsWith('/incidents')) && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.reportIncident(
        tripId,
        body.incidentType || body.type || body.incident_type,
        body.description,
        body.estimatedDelayMinutes || body.delay_minutes || 0,
        { lat: body.lat, lng: body.lng }
      );
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
      const result = driverService.replayOfflineBuffer(body.telemetryBuffer || body.buffer || []);
      sendSuccess(res, result);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/end (DRI-017)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/end') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.endTrip(tripId, body.endOdometerKm || body.odometer_km);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  return false;
}
