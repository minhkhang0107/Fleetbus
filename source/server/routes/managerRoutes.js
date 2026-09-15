/**
 * Manager Operations Control Center API Route Handlers (/api/v1/ops/... & /api/v1/auth/staff/...)
 * Covers all specifications MGR-001 through MGR-030 and API Screen Map matrix.
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

export function handleManagerRoutes(req, res, pathname, parsedUrl, services) {
  const { managerService } = services;

  // POST /api/v1/ops/auth/login or /api/v1/auth/staff/login (MGR-001, MGR-029)
  if ((pathname === '/api/v1/ops/auth/login' || pathname === '/api/v1/auth/staff/login') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = managerService.authenticateStaff(body.username || body.email, body.password);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 401, result);
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
  if ((pathname.startsWith('/api/v1/ops/fleet') || pathname.startsWith('/api/v1/ops/vehicles')) && req.method === 'GET') {
    const fleet = managerService.getFleetRoster();
    sendSuccess(res, fleet.data || fleet);
    return true;
  }

  // GET /api/v1/ops/crew or /api/v1/ops/drivers (MGR-008, MGR-009, MGR-010)
  if ((pathname.startsWith('/api/v1/ops/crew') || pathname.startsWith('/api/v1/ops/drivers')) && req.method === 'GET') {
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
        agentStaffId: body.agentStaffId || 'stf_pos_01'
      });

      if (result.success) {
        sendSuccess(res, result.data || result, 201);
      } else {
        sendError(res, result.error, result.code, 400);
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
        mockNow: body.now || Date.now()
      });

      if (result.success) {
        sendSuccess(res, result.data || result, 201);
      } else {
        sendError(res, result.error, result.code, 400);
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
      const result = managerService.executeEmergencyVehicleSwap(tripId, {
        newVehiclePlate: body.newVehiclePlate || body.new_vehicle_plate,
        newDriverId: body.newDriverId || body.new_driver_id,
        reason: body.replacementReason || body.reason || 'Sự cố hỏng hóc kỹ thuật động cơ'
      });

      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
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
      const result = managerService.broadcastTripDelay(tripId, body.delayMinutes || body.delay_minutes || 15, body.reason);
      if (result.success) {
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
      const result = managerService.processRefundApproval(refundId, body.approved, body.notes);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/reports/executive or /api/v1/ops/reports/yield (MGR-025, MGR-026, MGR-027)
  if ((pathname === '/api/v1/ops/reports/executive' || pathname === '/api/v1/ops/reports/yield') && req.method === 'GET') {
    const startDate = parsedUrl.searchParams.get('start_date');
    const endDate = parsedUrl.searchParams.get('end_date');
    const reports = managerService.getExecutiveReports({ startDate, endDate });
    sendSuccess(res, reports.data || reports);
    return true;
  }

  // GET /api/v1/ops/bookings (MGR-017)
  if (pathname === '/api/v1/ops/bookings' && req.method === 'GET') {
    sendSuccess(res, {
      total: managerService.bookings.length,
      bookings: managerService.bookings
    });
    return true;
  }

  // GET /api/v1/ops/bookings/:bookingId (MGR-018)
  if (pathname.startsWith('/api/v1/ops/bookings/') && req.method === 'GET') {
    const bookingId = pathname.split('/')[5];
    const booking = managerService.bookings.find(b => b.pnr === bookingId || b.trip_id === bookingId);
    if (booking) {
      sendSuccess(res, booking);
    } else {
      sendError(res, 'Không tìm thấy thông tin đơn đặt vé', 'BOOKING_NOT_FOUND', 404);
    }
    return true;
  }

  // GET /api/v1/ops/trips/:tripId/seat-inventory (MGR-013)
  if (pathname.startsWith('/api/v1/ops/trips/') && pathname.endsWith('/seat-inventory') && req.method === 'GET') {
    const tripId = pathname.split('/')[5];
    const trip = managerService.findTrip(tripId);
    if (trip) {
      sendSuccess(res, {
        trip_id: tripId,
        total_seats: trip.total_seats,
        booked_seats: trip.booked_seats,
        vacant_seats: trip.total_seats - trip.booked_seats,
        hotline_holds: managerService.hotlineReservations.filter(r => r.trip_id === tripId && r.status === 'HELD_HOTLINE')
      });
    } else {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
    }
    return true;
  }

  // GET /api/v1/ops/trips/:tripId (MGR-012)
  if (pathname.startsWith('/api/v1/ops/trips/') && !pathname.includes('seat-inventory') && !pathname.includes('delay') && !pathname.includes('replace-vehicle') && req.method === 'GET') {
    const tripId = pathname.split('/')[5];
    const trip = managerService.findTrip(tripId);
    if (trip) {
      sendSuccess(res, trip);
    } else {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
    }
    return true;
  }

  // GET /api/v1/ops/audit-logs (MGR-028)
  if (pathname === '/api/v1/ops/audit-logs' && req.method === 'GET') {
    sendSuccess(res, {
      total: managerService.alerts.length,
      audit_logs: managerService.alerts
    });
    return true;
  }

  return false;
}
