/**
 * Comprehensive Passenger API Route Handlers (/api/v1/passenger/... & /api/v1/...)
 * Covers all specifications PAX-001 through PAX-025 and API Screen Map matrix.
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

// With authentication enforced, a ticket or order may only be used by its owner (or its holder, where allowed).
function forbidTicket(req, res, paymentService, ticketId, { ownerOnly = false } = {}) {
  if (!req.identity) return false;
  const access = paymentService.getTicketAccess(ticketId, req.identity.phone);
  if (access === 'NONE' || (ownerOnly && access === 'HOLDER')) {
    sendError(res, 'Bạn không có quyền với vé này', 'FORBIDDEN', 403);
    return true;
  }
  return false;
}

function forbidOrder(req, res, paymentService, orderId) {
  if (!req.identity) return false;
  if (paymentService.getOrderAccess(orderId, req.identity.phone) === 'NONE') {
    sendError(res, 'Bạn không có quyền với đơn hàng này', 'FORBIDDEN', 403);
    return true;
  }
  return false;
}

// A trip is known when any board has it: the search catalog, the driver shift or the manager schedule.
function isKnownTrip(services, tripId) {
  return services.searchService.getTripDetail(tripId).success
    || services.driverService.activeTrips.has(tripId)
    || Boolean(services.managerService.findTrip(tripId));
}

const TRIP_PATH = '(?:passenger/)?trips/([^/]+)';
const TRIP_DETAIL_RE = new RegExp(`^/api/v1/${TRIP_PATH}$`);
const TRIP_SUB_RE = (sub) => new RegExp(`^/api/v1/${TRIP_PATH}/${sub}$`);
const TICKET_RE = /^\/api\/v1\/tickets\/([^/]+)$/;
const WALLET_TICKET_QR_RE = /^\/api\/v1\/passenger\/tickets\/([^/]+)\/qr$/;

export function handlePassengerRoutes(req, res, pathname, parsedUrl, services) {
  const { authService, searchService, seatMapService, checkoutService, paymentService, trackingService } = services;

  // GET /api/v1/passenger/config or /api/v1/app/config (PAX-001)
  if ((pathname === '/api/v1/passenger/config' || pathname === '/api/v1/app/config') && req.method === 'GET') {
    const version = req.headers['x-app-version'] || '3.0.0';
    const config = authService.checkAppConfig(version);
    sendSuccess(res, config.data || config);
    return true;
  }

  // POST /api/v1/passenger/auth/request-otp or /api/v1/auth/passenger/otp/request (PAX-002)
  if ((pathname === '/api/v1/passenger/auth/request-otp' || pathname === '/api/v1/auth/passenger/otp/request') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = authService.requestOTP(body.phone, body.now);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, 429, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/auth/verify-otp or /api/v1/auth/passenger/otp/verify (PAX-003)
  if ((pathname === '/api/v1/passenger/auth/verify-otp' || pathname === '/api/v1/auth/passenger/otp/verify') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = authService.verifyOTP(body.phone, body.otp, body.now);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, 400, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/home-feed (PAX-004)
  if (pathname === '/api/v1/passenger/home-feed' && req.method === 'GET') {
    sendSuccess(res, {
      active_ticket: null,
      popular_corridors: [
        { route_id: 'rt_hn_th', route_name: 'Hà Nội — Thanh Hóa', fare_from_vnd: 220000, duration_hours: 3.25 },
        { route_id: 'rt_hn_hp', route_name: 'Hà Nội — Hải Phòng', fare_from_vnd: 150000, duration_hours: 1.75 },
        { route_id: 'rt_hn_nd', route_name: 'Hà Nội — Nam Định', fare_from_vnd: 120000, duration_hours: 1.5 }
      ],
      promotions: [
        { code: 'BUSGO50K', discount: '50.000 đ', description: 'Giảm ngay 50k cho đơn từ 200k' }
      ]
    });
    return true;
  }

  // GET /api/v1/passenger/stations or /api/v1/routes/stops/search or /api/v1/stations (PAX-005)
  if ((pathname === '/api/v1/passenger/stations' || pathname === '/api/v1/routes/stops/search' || pathname === '/api/v1/stations') && req.method === 'GET') {
    const q = parsedUrl.searchParams.get('q') || '';
    const stations = searchService.searchStations(q);
    sendSuccess(res, stations);
    return true;
  }

  // GET /api/v1/passenger/trips or /api/v1/trips/search or /api/v1/trips (PAX-006)
  if ((pathname === '/api/v1/passenger/trips' || pathname === '/api/v1/trips/search' || pathname === '/api/v1/trips') && req.method === 'GET') {
    const origin = parsedUrl.searchParams.get('origin') || parsedUrl.searchParams.get('originCity') || 'Hà Nội';
    const dest = parsedUrl.searchParams.get('destination') || parsedUrl.searchParams.get('destinationCity') || 'Thanh Hóa';
    const vehicleType = parsedUrl.searchParams.get('vehicle_type');
    const timeSlot = parsedUrl.searchParams.get('time_slot');
    const trips = searchService.searchTrips({ originCity: origin, destinationCity: dest, vehicleType, timeSlot });
    sendSuccess(res, trips.data || trips);
    return true;
  }

  // GET /api/v1/passenger/trips/:tripId/seat-map or /api/v1/trips/:tripId/seat-map (PAX-009)
  if ((pathname.startsWith('/api/v1/passenger/trips/') || pathname.startsWith('/api/v1/trips/')) && pathname.endsWith('/seat-map') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    // No stops asked means the whole route; stops given are checked against the trip (PAX-008, BR-SEAT-001)
    const pickupId = parsedUrl.searchParams.get('pickup_stop_id');
    const dropoffId = parsedUrl.searchParams.get('dropoff_stop_id');
    const seatMap = seatMapService.getSeatMap(tripId, pickupId, dropoffId);
    if (seatMap.success) {
      sendSuccess(res, seatMap.data);
    } else {
      sendError(res, seatMap.error, seatMap.code, seatMap.code === 'TRIP_NOT_FOUND' ? 404 : 400);
    }
    return true;
  }

  // POST /api/v1/passenger/trips/:tripId/hold-seats or /api/v1/trips/:tripId/seats/hold (PAX-010)
  if ((pathname.startsWith('/api/v1/passenger/trips/') || pathname.startsWith('/api/v1/trips/')) && (pathname.endsWith('/hold-seats') || pathname.endsWith('/seats/hold')) && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    parseJsonBody(req).then(body => {
      const userId = req.identity?.sub || body.userId;
      if (!userId) {
        sendError(res, 'Thiếu thông tin người dùng', 'USER_REQUIRED', 400);
        return;
      }
      const result = seatMapService.holdSeats(tripId, body.seatCodes || [], userId, body.now, {
        pickupStopId: body.pickupStopId || body.pickup_stop_id || null,
        dropoffStopId: body.dropoffStopId || body.dropoff_stop_id || null
      });
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, ['STOP_NOT_FOUND', 'INVALID_SEGMENT', 'STOP_NOT_ALLOWED'].includes(result.code) ? 400 : 409, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/bookings/create, /api/v1/passenger/checkout/create-order, or /api/v1/bookings/create (PAX-011, PAX-012, PAX-013)
  // Prices come from the seat inventory, and the seats must be covered by a live hold owned by the booking user.
  if ((pathname === '/api/v1/passenger/bookings/create' || pathname === '/api/v1/passenger/checkout/create-order' || pathname === '/api/v1/bookings/create') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const payerInfo = body.payer || body.payerInfo;
      const passengerList = body.passengers || body.passengerList || [];
      const seatCodes = body.selectedSeats?.map(s => typeof s === 'string' ? s : s.seat_code) || body.seatCodes || [];
      const tripId = body.tripId;
      const userId = req.identity?.sub || body.userId || body.user_id;

      if (!tripId) {
        sendError(res, 'Thiếu mã chuyến xe', 'TRIP_REQUIRED', 400);
        return;
      }

      const checkoutValidation = checkoutService.validateManifest({
        payerInfo,
        passengerList,
        seatCodes
      });

      if (!checkoutValidation.success) {
        sendError(res, checkoutValidation.error, checkoutValidation.code || 'VALIDATION_ERROR', 400);
        return;
      }

      const tripDetailRes = searchService.getTripDetail(tripId);
      if (!tripDetailRes.success) {
        sendError(res, tripDetailRes.error, tripDetailRes.code || 'TRIP_NOT_FOUND', 404);
        return;
      }
      const tripDetail = tripDetailRes.data;

      const holdCheck = seatMapService.validateHold(tripId, body.holdId, userId, seatCodes);
      if (!holdCheck.success) {
        sendError(res, holdCheck.error, holdCheck.code, 409);
        return;
      }

      const orderReview = checkoutService.computeOrderReview({
        trip: tripDetail,
        seats: holdCheck.data.seats,
        seatCodes,
        voucherCode: body.voucherCode,
        insuranceSelected: Boolean(body.insuranceSelected)
      });

      const paymentOrderResult = paymentService.createPaymentOrder({
        holdId: body.holdId,
        trip: tripDetail,
        seatCodes,
        payer: checkoutValidation.data.payer,
        passengers: checkoutValidation.data.passengers,
        amountVnd: orderReview.total_payment_vnd,
        // The segment is the one of the hold; names come from the trip stops (a client name is only for old callers)
        pickupStopId: holdCheck.data.pickup_stop_id,
        dropoffStopId: holdCheck.data.dropoff_stop_id,
        pickupStop: (tripDetail.stops || []).find(s => s.stop_id === holdCheck.data.pickup_stop_id)?.name || body.pickupStop || 'Bến xe Giáp Bát',
        dropoffStop: (tripDetail.stops || []).find(s => s.stop_id === holdCheck.data.dropoff_stop_id)?.name || body.dropoffStop || 'Bến xe Phía Bắc Thanh Hóa'
      });

      // The hold becomes a payment lock until the payment window closes (no double sale while the customer pays).
      seatMapService.extendHold(tripId, body.holdId, new Date(paymentOrderResult.data.expires_at).getTime());

      sendSuccess(res, {
        order: orderReview.data,
        payment: paymentOrderResult.data
      }, 201);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/tickets (PAX-016: Ticket Wallet)
  if (pathname === '/api/v1/passenger/tickets' && req.method === 'GET') {
    const tab = parsedUrl.searchParams.get('tab') || 'UPCOMING';
    const phone = req.identity ? req.identity.phone : parsedUrl.searchParams.get('phone');
    const wallet = paymentService.getTicketsByPhone(phone, tab);
    if (wallet.success) {
      sendSuccess(res, wallet.data);
    } else {
      sendError(res, wallet.error, wallet.code, 400);
    }
    return true;
  }

  // GET /api/v1/passenger/tickets/:ticketId/qr or /api/v1/tickets/:ticketId (PAX-017: static versioned boarding QR)
  if ((WALLET_TICKET_QR_RE.test(pathname) || TICKET_RE.test(pathname)) && req.method === 'GET') {
    const parts = pathname.split('/');
    const ticketId = pathname.startsWith('/api/v1/passenger/') ? parts[5] : parts[4];
    if (forbidTicket(req, res, paymentService, ticketId)) return true;
    const qrResult = paymentService.getBoardingPass(ticketId);
    if (qrResult.success) {
      sendSuccess(res, qrResult.data || qrResult);
    } else {
      sendError(res, qrResult.error, qrResult.code, 404);
    }
    return true;
  }

  // GET /api/v1/passenger/orders/:orderId/group-qr (PAX-017 / REV-01)
  if (pathname.startsWith('/api/v1/passenger/orders/') && pathname.endsWith('/group-qr') && req.method === 'GET') {
    const parts = pathname.split('/');
    const orderId = parts[5];
    if (forbidOrder(req, res, paymentService, orderId)) return true;
    const groupRes = paymentService.getGroupBoardingPass(orderId);
    if (groupRes.success) {
      sendSuccess(res, groupRes.data);
    } else {
      sendError(res, groupRes.error, groupRes.code, 404);
    }
    return true;
  }

  // POST /api/v1/passenger/tickets/:ticketId/qr/reissue (PAX-017, D104): revoke a leaked QR and PIN
  if (pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/qr/reissue') && req.method === 'POST') {
    const ticketId = pathname.split('/')[5];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    const ticket = paymentService.tickets.get(ticketId);
    const driverTrip = ticket ? services.driverService?.activeTrips?.get(ticket.trip_id) : null;
    const boardingStarted = Boolean(driverTrip && ['IN_TRANSIT', 'COMPLETED'].includes(driverTrip.status));
    const result = paymentService.reissueBoardingQR(ticketId, { boardingStarted });
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, result.code === 'TICKET_NOT_FOUND' ? 404 : 409);
    }
    return true;
  }

  // POST /api/v1/passenger/tickets/:ticketId/delegate (PAX-017 / REV-01)
  if (pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/delegate') && req.method === 'POST') {
    const parts = pathname.split('/');
    const ticketId = parts[5];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    parseJsonBody(req).then(body => {
      const result = paymentService.delegateTicket(ticketId, {
        delegateToPhone: body.delegateToPhone || body.phone,
        delegateToName: body.delegateToName || body.name
      });
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/payments/:orderId/verify-status (PAX-013 / REV-02)
  if (pathname.startsWith('/api/v1/passenger/payments/') && pathname.endsWith('/verify-status') && req.method === 'POST') {
    const parts = pathname.split('/');
    const orderId = parts[5];
    if (forbidOrder(req, res, paymentService, orderId)) return true;
    parseJsonBody(req).then(body => {
      const result = paymentService.checkPaymentStatus(orderId, {
        manualTrigger: Boolean(body.manualTrigger || body.manual_trigger)
      });
      if (result.success) {
        sendSuccess(res, result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/tickets/:ticketId/cancel (PAX-021: Cancellation & Refund)
  if (pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/cancel') && req.method === 'POST') {
    const parts = pathname.split('/');
    const ticketId = parts[5];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    parseJsonBody(req).then(body => {
      const result = paymentService.cancelTicket(ticketId, { now: body.now });
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, result.code === 'TICKET_NOT_FOUND' ? 404 : 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/trips/:tripId/radar or /api/v1/trips/:tripId/tracking (PAX-018)
  if (req.method === 'GET' && (TRIP_SUB_RE('radar').test(pathname) || TRIP_SUB_RE('tracking').test(pathname))) {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    if (!isKnownTrip(services, tripId)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    const tracking = trackingService.getLiveTrackingHUD(tripId);
    sendSuccess(res, tracking.data || tracking);
    return true;
  }

  // GET /api/v1/passenger/notifications (PAX-020)
  if (pathname === '/api/v1/passenger/notifications' && req.method === 'GET') {
    // Notifications are kept per phone number; with authentication it comes from the token
    const phone = req.identity ? req.identity.phone : req.headers['x-user-id'];
    if (!phone) {
      sendError(res, 'Thiếu thông tin người dùng', 'USER_REQUIRED', 400);
      return true;
    }
    const notifs = trackingService.getNotifications(phone);
    sendSuccess(res, notifs.data || notifs);
    return true;
  }

  // GET /api/v1/trips/:tripId/stops (PAX-008)
  if (req.method === 'GET' && TRIP_SUB_RE('stops').test(pathname)) {
    const detail = searchService.getTripDetail(pathname.match(TRIP_SUB_RE('stops'))[1]);
    if (detail.success) {
      sendSuccess(res, { trip_id: detail.data.trip_id, stops: detail.data.stops });
    } else {
      sendError(res, detail.error, detail.code, 404);
    }
    return true;
  }

  // DELETE /api/v1/trips/:tripId/seats/hold (PAX-010: release the caller's hold)
  if (req.method === 'DELETE' && TRIP_SUB_RE('seats/hold').test(pathname)) {
    const tripId = pathname.match(TRIP_SUB_RE('seats/hold'))[1];
    const userId = req.identity?.sub || parsedUrl.searchParams.get('userId');
    if (!userId) {
      sendError(res, 'Thiếu thông tin người dùng', 'USER_REQUIRED', 400);
      return true;
    }
    const released = seatMapService.releaseUserHold(tripId, userId);
    sendSuccess(res, { released_count: released.released_count });
    return true;
  }

  // GET /api/v1/trips/:tripId/disruptions and /replacement-info (PAX-025, PAX-024)
  if (req.method === 'GET' && (TRIP_SUB_RE('disruptions').test(pathname) || TRIP_SUB_RE('replacement-info').test(pathname))) {
    const isReplacement = pathname.endsWith('/replacement-info');
    const tripId = pathname.match(TRIP_SUB_RE(isReplacement ? 'replacement-info' : 'disruptions'))[1];
    if (!isKnownTrip(services, tripId)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    const disruption = trackingService.getTripDisruption(tripId).data;
    if (isReplacement) {
      const replaced = disruption?.type === 'VEHICLE_REPLACEMENT';
      sendSuccess(res, replaced
        ? { trip_id: tripId, has_replacement: true, new_plate_number: disruption.new_plate_number, message: disruption.message }
        : { trip_id: tripId, has_replacement: false });
    } else {
      sendSuccess(res, disruption
        ? { trip_id: tripId, has_disruption: true, ...disruption }
        : { trip_id: tripId, has_disruption: false });
    }
    return true;
  }

  // GET /api/v1/payments/:orderId/status (PAX-014)
  if (req.method === 'GET' && /^\/api\/v1\/payments\/[^/]+\/status$/.test(pathname)) {
    const orderId = pathname.split('/')[4];
    if (forbidOrder(req, res, paymentService, orderId)) return true;
    const result = paymentService.checkPaymentStatus(orderId);
    if (result.success || result.code === 'PAYMENT_EXPIRED') {
      sendSuccess(res, { order_id: orderId, payment_status: result.payment_status || result.data?.payment_status, is_settled: Boolean(result.is_settled) });
    } else {
      sendError(res, result.error, result.code, 404);
    }
    return true;
  }

  // GET /api/v1/bookings/:bookingId (PAX-015)
  if (req.method === 'GET' && /^\/api\/v1\/bookings\/[^/]+$/.test(pathname)) {
    const bookingId = pathname.split('/')[4];
    if (forbidOrder(req, res, paymentService, bookingId)) return true;
    const result = paymentService.getBooking(bookingId);
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, 404);
    }
    return true;
  }

  // GET /api/v1/passenger/profile (PAX-022)
  if (req.method === 'GET' && pathname === '/api/v1/passenger/profile') {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const profile = authService.getProfile(token);
    if (profile.success) {
      sendSuccess(res, profile.data);
    } else {
      sendError(res, profile.error, profile.code, 401);
    }
    return true;
  }

  // GET /api/v1/trips/:tripId (PAX-007)
  if (req.method === 'GET' && TRIP_DETAIL_RE.test(pathname)) {
    const detail = searchService.getTripDetail(pathname.match(TRIP_DETAIL_RE)[1]);
    if (detail.success) {
      sendSuccess(res, detail.data);
    } else {
      sendError(res, detail.error, detail.code, 404);
    }
    return true;
  }

  return false;
}
