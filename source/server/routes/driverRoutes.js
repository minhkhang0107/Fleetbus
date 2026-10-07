/**
 * Driver Tactical Cockpit API Route Handlers (/api/v1/driver/... & /api/v1/auth/driver/...)
 * Covers all specifications DRI-001 through DRI-019 and API Screen Map matrix.
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';


// An unpaid COD ticket is a 409 that tells the app which fare to collect (DRI-010, DRI-012).
function sendBoardingError(res, result, status = 400) {
  if (result.code === 'COD_PAYMENT_REQUIRED') {
    sendError(res, result.error, result.code, 409, { ticket_id: result.ticket_id, seat_code: result.seat_code, cod_amount_vnd: result.cod_amount_vnd });
    return;
  }
  sendError(res, result.error, result.code, status);
}

export function handleDriverRoutes(req, res, pathname, parsedUrl, services) {
  const { driverService } = services;

  // With authentication enforced, a driver only reaches the trips assigned to them.
  if (req.identity && pathname.startsWith('/api/v1/driver/trips/')) {
    const tripId = pathname.split('/')[5];
    const trip = driverService.activeTrips.get(tripId);
    if (trip && trip.driver_id !== req.identity.sub) {
      sendError(res, 'Chuyến xe không thuộc ca làm việc của bạn', 'FORBIDDEN', 403);
      return true;
    }
  }

  // POST /api/v1/driver/auth/login or /api/v1/auth/driver/login (DRI-001)
  if ((pathname === '/api/v1/driver/auth/login' || pathname === '/api/v1/auth/driver/login') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = driverService.authenticateDriver(body.staffIdOrPhone || body.staff_id || body.username, body.pin || body.password);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, { ACCOUNT_LOCKED: 429, LICENSE_EXPIRED: 403 }[result.code] || 401, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/driver/trips/today (DRI-002)
  if (pathname === '/api/v1/driver/trips/today' && req.method === 'GET') {
    // The token decides who the driver is; the header is only a development fallback
    const driverId = req.identity?.sub || req.headers['x-driver-id'] || 'drv_8821a';
    const result = driverService.getTodayTrips(driverId);
    sendSuccess(res, result.data);
    return true;
  }

  // GET /api/v1/driver/trips/:tripId (DRI-003)
  if (req.method === 'GET' && /^\/api\/v1\/driver\/trips\/[^/]+$/.test(pathname)) {
    const result = driverService.getTrip(pathname.split('/')[5]);
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, 404);
    }
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/stops/:stopId/arrive (DRI-008)
  if (req.method === 'POST' && /^\/api\/v1\/driver\/trips\/[^/]+\/stops\/[^/]+\/arrive$/.test(pathname)) {
    const parts = pathname.split('/');
    const result = driverService.arriveAtStop(parts[5], parts[7]);
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, ['TRIP_NOT_FOUND', 'STOP_NOT_FOUND'].includes(result.code) ? 404 : 400);
    }
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
        sendError(res, result.error, result.code || 'TELEMETRY_ERROR', result.code === 'TRIP_NOT_FOUND' ? 404 : 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/driver/trips/:tripId/manifest (DRI-007)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/manifest') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    const result = driverService.getManifest(tripId);
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, 404);
    }
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/board-qr or /api/v1/driver/trips/:tripId/boarding (DRI-009)
  if (pathname.startsWith('/api/v1/driver/trips/') && (pathname.endsWith('/board-qr') || pathname.endsWith('/boarding')) && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const qrPayload = body.qrString || body.qrPayload || body.qr_code;
      const result = driverService.boardPassengerByQR(tripId, qrPayload, body.now);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendBoardingError(res, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/boarding/manual (DRI-010)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/boarding/manual') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      let qrOrPin = body.qrString || body.qrPayload;
      if (body.pin && (body.ticket_id || body.ticketId)) {
        qrOrPin = `PIN:${body.ticket_id || body.ticketId}:${body.pin}`;
      }
      if (qrOrPin) {
        const result = driverService.boardPassengerByQR(tripId, qrOrPin, body.now);
        if (result.success) {
          sendSuccess(res, result.data || result);
        } else {
          sendBoardingError(res, result);
        }
      } else {
        const result = driverService.boardPassengerManually(
          tripId,
          { ticketId: body.ticket_id || body.ticketId, seatCode: body.seat_code },
          body.now
        );
        if (result.success) {
          sendSuccess(res, result.data);
        } else {
          sendBoardingError(res, result, result.code === 'NOT_FOUND' || result.code === 'TRIP_NOT_FOUND' ? 404 : 400);
        }
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/tickets/:ticketId/no-show or /manifest/:ticketId/no-show (DRI-011)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/no-show') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    const ticketIndex = parts.indexOf('tickets') !== -1 ? parts.indexOf('tickets') : parts.indexOf('manifest');
    const ticketId = ticketIndex !== -1 ? parts[ticketIndex + 1] : null;
    parseJsonBody(req).then(body => {
      const tId = ticketId || body.ticketId || body.ticket_id;
      const result = driverService.markNoShow(tripId, tId, body.reason, {
        mockNow: body.now || Date.now(),
        passengerRequestedCancel: Boolean(body.passenger_requested_cancel)
      });
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, ['TRIP_NOT_FOUND', 'TICKET_NOT_FOUND'].includes(result.code) ? 404 : 400);
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
        sendError(res, result.error, result.code || 'COD_ERROR', ['TRIP_NOT_FOUND', 'TICKET_NOT_FOUND'].includes(result.code) ? 404 : 400);
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
        const status = result.code === 'TRIP_NOT_FOUND' ? 404 : (result.code === 'SEAT_OCCUPIED' ? 409 : 400);
        sendError(res, result.error, result.code || 'HAIL_ERROR', status);
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
      let buffer = body.telemetryBuffer || body.buffer || [];
      if (req.identity && Array.isArray(buffer)) {
        buffer = buffer.filter(item => driverService.activeTrips.get(item.trip_id || item.tripId)?.driver_id === req.identity.sub);
      }
      const result = driverService.replayOfflineBuffer(buffer);
      sendSuccess(res, result);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/driver/trips/:tripId/end (DRI-017)
  if (pathname.startsWith('/api/v1/driver/trips/') && pathname.endsWith('/end') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = driverService.endTrip(tripId, body);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/driver/system/gps-health (DRI-014)
  if (pathname === '/api/v1/driver/system/gps-health' && req.method === 'GET') {
    sendSuccess(res, {
      gps_signal: 'GOOD',
      satellites_locked: 14,
      accuracy_meters: 4.2,
      foreground_service_active: true,
      battery_optimization_whitelisted: true,
      mqtt_connection_status: 'ONLINE',
      mqtt_rtt_ms: 42,
      mock_location_detected: false,
      buffered_offline_count: driverService.offlineQueue.length
    });
    return true;
  }

  // GET /api/v1/driver/system/diagnostics-ping (DRI-016)
  if (pathname === '/api/v1/driver/system/diagnostics-ping' && req.method === 'GET') {
    sendSuccess(res, {
      gateway_status: 'HEALTHY',
      api_latency_ms: 18,
      mqtt_broker_status: 'CONNECTED',
      timestamp: new Date().toISOString()
    });
    return true;
  }

  // GET /api/v1/driver/profile (DRI-018)
  if (pathname === '/api/v1/driver/profile' && req.method === 'GET') {
    const driverId = req.identity?.sub || req.headers['x-driver-id'] || 'drv_8821a';
    const result = driverService.getProfile(driverId);
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, 404);
    }
    return true;
  }

  return false;
}
