/**
 * Manager & Operations Control API Route Handlers (/api/v1/ops/...)
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

export function handleManagerRoutes(req, res, pathname, parsedUrl, services) {
  const { managerService } = services;

  // POST /api/v1/ops/auth/login (MGR-001)
  if (pathname === '/api/v1/ops/auth/login' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = managerService.authenticateManager(body.username, body.password);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, 401);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/dashboard/kpis (MGR-002)
  if (pathname === '/api/v1/ops/dashboard/kpis' && req.method === 'GET') {
    const result = managerService.getDashboardKPIs();
    sendSuccess(res, result.data);
    return true;
  }

  // GET /api/v1/ops/radar (MGR-003)
  if (pathname === '/api/v1/ops/radar' && req.method === 'GET') {
    const result = managerService.getLiveFleetRadar();
    sendSuccess(res, result.data);
    return true;
  }

  // GET /api/v1/ops/dispatch/board (MGR-014)
  if (pathname === '/api/v1/ops/dispatch/board' && req.method === 'GET') {
    const date = parsedUrl.searchParams.get('date') || '2026-08-28';
    const result = managerService.getDispatchBoard(date);
    sendSuccess(res, result.data);
    return true;
  }

  // POST /api/v1/ops/pos/bookings (MGR-019, MGR-020)
  if (pathname === '/api/v1/ops/pos/bookings' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = managerService.createPosBooking(body);
      if (result.success) {
        sendSuccess(res, result.data, 201);
      } else {
        sendError(res, result.error, 'POS_BOOKING_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/trips/:tripId/replace-vehicle (MGR-023)
  if (pathname.startsWith('/api/v1/ops/trips/') && pathname.endsWith('/replace-vehicle') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = managerService.replaceTripVehicle(tripId, body.newVehicleId, body.reason);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, 'REPLACE_VEHICLE_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/trips/:tripId/delay (MGR-024)
  if (pathname.startsWith('/api/v1/ops/trips/') && pathname.endsWith('/delay') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    parseJsonBody(req).then(body => {
      const result = managerService.broadcastTripDelay(tripId, body.delayMinutes, body.reason);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, 'DELAY_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/refunds/process (MGR-021, MGR-022)
  if (pathname === '/api/v1/ops/refunds/process' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = managerService.processRefund(body.pnr, body.refundAmountVnd, body.reason);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, 'REFUND_ERROR', 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  return false;
}
