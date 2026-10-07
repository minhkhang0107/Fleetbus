/**
 * Manager Operations Control Center API Route Handlers (/api/v1/ops/... & /api/v1/auth/staff/...)
 * Covers all specifications MGR-001 through MGR-030 and API Screen Map matrix.
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';
import { maskPhone } from '../services/passenger/core/formatters.js';
import { ADMIN_ROLE } from '../core/gateway.js';

// Seat conflicts and reservation mismatches are conflicts (409); a missing trip or reservation is 404.
function inventoryErrorStatus(code) {
  if (['STOP_NOT_FOUND', 'INVALID_SEGMENT', 'STOP_NOT_ALLOWED'].includes(code)) return 400;
  if (['SEAT_ALREADY_BOOKED', 'SEAT_LOCKED_BY_OTHER', 'SEAT_BLOCKED', 'SEAT_ALREADY_BLOCKED', 'SEAT_NOT_BLOCKED', 'RESERVATION_MISMATCH', 'TRIP_FULL'].includes(code)) return 409;
  if (['TRIP_NOT_FOUND', 'RESERVATION_NOT_FOUND'].includes(code)) return 404;
  return 400;
}

// OQ-007: only the admin role sees full phone numbers of passengers.
function visibleBooking(req, booking) {
  if (!req.identity || req.identity.role === ADMIN_ROLE) return booking;
  return { ...booking, phone: booking.phone ? maskPhone(booking.phone) : booking.phone };
}

function audit(req, managerService, entry) {
  managerService.recordAudit({
    actor: req.identity?.sub || 'anonymous',
    role: req.identity?.role || null,
    ip: req.socket?.remoteAddress || null,
    ...entry
  });
}

const FLEET_PATHS = ['/api/v1/ops/fleet', '/api/v1/ops/fleet/vehicles', '/api/v1/ops/vehicles'];
const CREW_PATHS = ['/api/v1/ops/crew', '/api/v1/ops/crew/drivers', '/api/v1/ops/drivers'];
const TRIP_DETAIL_RE = /^\/api\/v1\/ops\/trips\/([^/]+)(?:\/master)?$/;
const SEAT_INVENTORY_RE = /^\/api\/v1\/ops\/trips\/([^/]+)\/(?:seat-inventory|seat-matrix)$/;

export function handleManagerRoutes(req, res, pathname, parsedUrl, services) {
  const { managerService } = services;

  // POST /api/v1/ops/auth/login or /api/v1/auth/staff/login (MGR-001, MGR-029)
  if ((pathname === '/api/v1/ops/auth/login' || pathname === '/api/v1/auth/staff/login') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const username = String(body.username || body.email || '').trim().toLowerCase();
      const result = managerService.authenticateStaff(username, body.password, body.totp ?? body.totpCode ?? null);
      if (result.success) {
        managerService.recordAudit({ actor: result.data.user.user_id, role: result.data.user.role, action: 'LOGIN', resource: username, ip: req.socket?.remoteAddress || null });
        sendSuccess(res, result.data || result);
      } else {
        managerService.recordAudit({ action: result.code === 'ACCOUNT_LOCKED' ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', resource: username, ip: req.socket?.remoteAddress || null });
        sendError(res, result.error, result.code, result.code === 'ACCOUNT_LOCKED' ? 429 : 401, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/dashboard/kpis (MGR-002)
  if (pathname === '/api/v1/ops/dashboard/kpis' && req.method === 'GET') {
    const kpis = managerService.getOperationsDashboardKPIs();
    sendSuccess(res, kpis.data || kpis);
    return true;
  }

  // GET /api/v1/ops/radar or /api/v1/ops/fleet/live-positions (MGR-003, MGR-004)
  if ((pathname === '/api/v1/ops/radar' || pathname === '/api/v1/ops/fleet/live-positions') && req.method === 'GET') {
    const radar = managerService.getLiveFleetRadar();
    sendSuccess(res, radar.data || radar);
    return true;
  }

  // GET /api/v1/ops/fleet or /api/v1/ops/vehicles (MGR-005, MGR-006, MGR-007)
  if (FLEET_PATHS.includes(pathname) && req.method === 'GET') {
    const fleet = managerService.getFleetRoster();
    sendSuccess(res, fleet.data || fleet);
    return true;
  }

  // GET /api/v1/ops/crew or /api/v1/ops/drivers (MGR-008, MGR-009, MGR-010)
  if (CREW_PATHS.includes(pathname) && req.method === 'GET') {
    const crew = managerService.getCrewDrivers();
    sendSuccess(res, crew.data || crew);
    return true;
  }

  // GET /api/v1/ops/routes (MGR-011, MGR-012, MGR-013)
  if (pathname === '/api/v1/ops/routes' && req.method === 'GET') {
    const routes = managerService.getRoutes();
    sendSuccess(res, routes.data || routes);
    return true;
  }

  // GET /api/v1/ops/dispatch/board or /api/v1/ops/dispatch/matrix or /api/v1/ops/trips (MGR-014, MGR-015, MGR-016)
  if ((pathname === '/api/v1/ops/dispatch/board' || pathname === '/api/v1/ops/dispatch/matrix' || pathname === '/api/v1/ops/trips') && req.method === 'GET') {
    const shiftDate = parsedUrl.searchParams.get('shift_date') || new Date().toISOString().split('T')[0];
    const dispatch = managerService.getDispatchBoard(shiftDate);
    sendSuccess(res, dispatch.data || dispatch);
    return true;
  }

  // POST /api/v1/ops/pos/bookings or /api/v1/ops/pos/orders (MGR-019, MGR-020)
  if ((pathname === '/api/v1/ops/pos/bookings' || pathname === '/api/v1/ops/pos/orders') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = managerService.createPosBooking({
        tripId: body.tripId || body.trip_id,
        passengerName: body.passengerName || body.passenger_name,
        phone: body.phone,
        seatCodes: body.seatCodes || body.seat_codes || [],
        paymentMethod: body.paymentMethod || body.payment_method || 'CASH_POS',
        agentStaffId: body.agentStaffId || 'stf_pos_01',
        reservationId: body.reservationId || body.reservation_id || null,
        pickupStopId: body.pickupStopId || body.pickup_stop_id || null,
        dropoffStopId: body.dropoffStopId || body.dropoff_stop_id || null,
        mockNow: body.now || Date.now()
      });

      if (result.success) {
        audit(req, managerService, { action: 'POS_ISSUE', resource: result.data.pnr, after: { trip_id: result.data.trip_id, seats: result.data.seat_codes, total_fare_vnd: result.data.total_fare_vnd } });
        sendSuccess(res, result.data || result, 201);
      } else {
        sendError(res, result.error, result.code, inventoryErrorStatus(result.code));
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/pos/hotline-hold (MGR-020 / REV-06)
  if (pathname === '/api/v1/ops/pos/hotline-hold' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = managerService.createHotlineHold({
        tripId: body.tripId || body.trip_id,
        passengerName: body.passengerName || body.passenger_name,
        phone: body.phone,
        seatCodes: body.seatCodes || body.seat_codes || [],
        holdPolicy: body.holdPolicy || body.hold_policy || 'UNTIL_DEPARTURE_OFFSET',
        departureOffsetMinutes: body.departureOffsetMinutes || body.departure_offset_minutes || 30,
        customExpiryMinutes: body.customExpiryMinutes || body.custom_expiry_minutes || 60,
        notes: body.notes || '',
        agentStaffId: body.agentStaffId || 'stf_hotline_01',
        pickupStopId: body.pickupStopId || body.pickup_stop_id || null,
        dropoffStopId: body.dropoffStopId || body.dropoff_stop_id || null,
        mockNow: body.now || Date.now()
      });

      if (result.success) {
        audit(req, managerService, { action: 'HOTLINE_HOLD', resource: result.data.reservation_id, after: { trip_id: result.data.trip_id, seats: result.data.seat_codes, hold_until: result.data.hold_until } });
        sendSuccess(res, result.data || result, 201);
      } else {
        sendError(res, result.error, result.code, inventoryErrorStatus(result.code));
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/trips/:tripId/swap-vehicle or /api/v1/ops/trips/:tripId/replace-vehicle (MGR-023)
  if ((pathname.includes('/swap-vehicle') || pathname.includes('/replace-vehicle')) && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripIndex = parts.indexOf('trips');
    const tripId = tripIndex !== -1 ? parts[tripIndex + 1] : parts[4];
    parseJsonBody(req).then(body => {
      const before = { vehicle_plate: managerService.findTrip(tripId)?.vehicle_plate || null };
      const result = managerService.executeEmergencyVehicleSwap(tripId, {
        newVehiclePlate: body.newVehiclePlate || body.new_vehicle_plate,
        newDriverId: body.newDriverId || body.new_driver_id,
        reason: body.replacementReason || body.reason || 'Sự cố hỏng hóc kỹ thuật động cơ'
      });

      if (result.success) {
        audit(req, managerService, { action: 'VEHICLE_SWAP', resource: tripId, before, after: { vehicle_plate: result.data.new_vehicle_plate } });
        sendSuccess(res, result.data || result);
      } else {
        const status = /_NOT_FOUND$/.test(result.code) ? 404 : (['VEHICLE_UNAVAILABLE', 'DRIVER_UNAVAILABLE', 'CAPACITY_INSUFFICIENT'].includes(result.code) ? 409 : 400);
        sendError(res, result.error, result.code, status);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/trips/:tripId/delay (MGR-024)
  if (pathname.startsWith('/api/v1/ops/trips/') && pathname.endsWith('/delay') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripIndex = parts.indexOf('trips');
    const tripId = tripIndex !== -1 ? parts[tripIndex + 1] : parts[4];
    parseJsonBody(req).then(body => {
      const before = { delay_minutes: managerService.findTrip(tripId)?.delay_minutes ?? null };
      const result = managerService.broadcastTripDelay(tripId, body.delayMinutes || body.delay_minutes || 15, body.reason);
      if (result.success) {
        audit(req, managerService, { action: 'TRIP_DELAY', resource: tripId, before, after: { delay_minutes: result.data.delay_minutes } });
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/refunds/:refundId/process (MGR-021, MGR-022)
  if (pathname.startsWith('/api/v1/ops/refunds/') && pathname.endsWith('/process') && req.method === 'POST') {
    const parts = pathname.split('/');
    const refundIndex = parts.indexOf('refunds');
    const refundId = refundIndex !== -1 ? parts[refundIndex + 1] : parts[4];
    parseJsonBody(req).then(body => {
      if (typeof body.approved !== 'boolean') {
        sendError(res, 'Cần chỉ rõ approved: true hoặc false', 'APPROVED_REQUIRED', 400);
        return;
      }
      const result = managerService.processRefundApproval(refundId, body.approved, body.notes);
      if (result.success) {
        audit(req, managerService, { action: body.approved ? 'REFUND_APPROVED' : 'REFUND_REJECTED', resource: refundId, before: { status: 'REFUND_REQUESTED' }, after: { status: result.data.status, amount_vnd: result.data.amount_vnd } });
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, result.code === 'REFUND_NOT_FOUND' ? 404 : 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/reports/executive or /api/v1/ops/reports/yield (MGR-025, MGR-026, MGR-027)
  if ((pathname === '/api/v1/ops/reports/executive' || pathname === '/api/v1/ops/reports/yield') && req.method === 'GET') {
    const startDate = parsedUrl.searchParams.get('from') || parsedUrl.searchParams.get('start_date');
    const endDate = parsedUrl.searchParams.get('to') || parsedUrl.searchParams.get('end_date');
    const reports = managerService.getExecutiveReports({ startDate, endDate });
    sendSuccess(res, reports.data || reports);
    return true;
  }

  // GET /api/v1/ops/bookings (MGR-017)
  if (pathname === '/api/v1/ops/bookings' && req.method === 'GET') {
    sendSuccess(res, {
      total: managerService.bookings.length,
      bookings: managerService.bookings.map(b => visibleBooking(req, b))
    });
    return true;
  }

  // GET /api/v1/ops/bookings/:bookingId (MGR-018)
  if (/^\/api\/v1\/ops\/bookings\/[^/]+$/.test(pathname) && req.method === 'GET') {
    const bookingId = pathname.split('/')[5];
    const booking = managerService.bookings.find(b => b.pnr === bookingId);
    if (booking) {
      sendSuccess(res, visibleBooking(req, booking));
    } else {
      sendError(res, 'Không tìm thấy thông tin đơn đặt vé', 'BOOKING_NOT_FOUND', 404);
    }
    return true;
  }

  // GET /api/v1/ops/trips/:tripId/seat-matrix or /seat-inventory (MGR-013)
  if (SEAT_INVENTORY_RE.test(pathname) && req.method === 'GET') {
    const tripId = pathname.match(SEAT_INVENTORY_RE)[1];
    const result = managerService.getSeatMatrix(tripId);
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, 404);
    }
    return true;
  }

  // POST /api/v1/ops/trips/:tripId/seats/override-lock (MGR-013, BR-INVENTORY-001)
  const overrideMatch = pathname.match(/^\/api\/v1\/ops\/trips\/([^/]+)\/seats\/override-lock$/);
  if (overrideMatch && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const tripId = overrideMatch[1];
      const locked = body.locked;
      if (typeof locked !== 'boolean') {
        sendError(res, 'Cần chỉ rõ locked: true để khóa hoặc false để mở khóa', 'LOCKED_REQUIRED', 400);
        return;
      }
      const result = managerService.setSeatLock(tripId, {
        seatCodes: body.seatCodes || body.seat_codes || [],
        locked,
        reason: body.reason,
        staffId: req.identity?.sub || null
      });
      if (result.success) {
        audit(req, managerService, { action: locked ? 'SEAT_BLOCKED' : 'SEAT_UNBLOCKED', resource: tripId, after: { seats: result.data.seat_codes, reason: result.data.reason } });
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, inventoryErrorStatus(result.code));
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/debt-receipts/:code/redeem (MGR-022, FLOW-03)
  const debtMatch = pathname.match(/^\/api\/v1\/ops\/debt-receipts\/([^/]+)\/redeem$/);
  if (debtMatch && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const code = decodeURIComponent(debtMatch[1]);
      const result = services.driverService.redeemDebtReceipt(code, { cashierId: req.identity?.sub || null, stationId: body.station_id || body.stationId || null });
      if (result.success) {
        audit(req, managerService, { action: 'DEBT_REDEEMED', resource: result.data.receipt_code, before: { status: 'OUTSTANDING' }, after: { status: 'REDEEMED', amount_vnd: result.data.amount_vnd, station: result.data.redeemed_station } });
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, result.code === 'DEBT_RECEIPT_NOT_FOUND' ? 404 : 409);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/trips/:tripId (MGR-012)
  if (TRIP_DETAIL_RE.test(pathname) && req.method === 'GET') {
    const tripId = pathname.match(TRIP_DETAIL_RE)[1];
    const trip = managerService.findTrip(tripId);
    if (trip) {
      sendSuccess(res, trip);
    } else {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
    }
    return true;
  }

  // GET /api/v1/ops/alerts (MGR-025)
  if (pathname === '/api/v1/ops/alerts' && req.method === 'GET') {
    sendSuccess(res, { total: managerService.alerts.length, alerts: managerService.alerts });
    return true;
  }

  // GET /api/v1/ops/audit-logs (MGR-028)
  if (pathname === '/api/v1/ops/audit-logs' && req.method === 'GET') {
    sendSuccess(res, {
      total: managerService.auditLog.length,
      audit_logs: [...managerService.auditLog].reverse()
    });
    return true;
  }

  return false;
}
