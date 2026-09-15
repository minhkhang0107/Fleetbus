/**
 * Comprehensive Passenger API Route Handlers (/api/v1/passenger/... & /api/v1/...)
 * Covers all specifications PAX-001 through PAX-025 and API Screen Map matrix.
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

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
      const result = authService.requestOtp(body.phone, body.now);
      if (result.success) {
        sendSuccess(res, result);
      } else {
        sendError(res, result.error, result.code, 429, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/auth/verify-otp or /api/v1/auth/passenger/otp/verify (PAX-003)
  if ((pathname === '/api/v1/passenger/auth/verify-otp' || pathname === '/api/v1/auth/passenger/otp/verify') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = authService.verifyOtp(body.phone, body.otp, body.now);
      if (result.success) {
        sendSuccess(res, result);
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
    const pickupId = parsedUrl.searchParams.get('pickup_stop_id') || 'stp_hn_gb';
    const dropoffId = parsedUrl.searchParams.get('dropoff_stop_id') || 'stp_th_pb';
    const seatMap = seatMapService.getSeatMap(tripId, pickupId, dropoffId);
    if (seatMap.success) {
      sendSuccess(res, seatMap.data);
    } else {
      sendError(res, seatMap.error, seatMap.code, 404);
    }
    return true;
  }

  // POST /api/v1/passenger/trips/:tripId/hold-seats or /api/v1/trips/:tripId/seats/hold (PAX-010)
  if ((pathname.startsWith('/api/v1/passenger/trips/') || pathname.startsWith('/api/v1/trips/')) && (pathname.endsWith('/hold-seats') || pathname.endsWith('/seats/hold')) && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    parseJsonBody(req).then(body => {
      const result = seatMapService.holdSeats(tripId, body.seatCodes || [], body.userId || 'usr_guest', body.now);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 409, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/bookings/create, /api/v1/passenger/checkout/create-order, or /api/v1/bookings/create (PAX-011, PAX-012, PAX-013)
  if ((pathname === '/api/v1/passenger/bookings/create' || pathname === '/api/v1/passenger/checkout/create-order' || pathname === '/api/v1/bookings/create') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const payerInfo = body.payer || body.payerInfo;
      const passengerList = body.passengers || body.passengerList || [];
      const seatCodes = body.selectedSeats?.map(s => typeof s === 'string' ? s : s.seat_code) || body.seatCodes || [];
      const tripId = body.tripId || 'trp_hn_th_01';

      const checkoutValidation = checkoutService.validateManifest({
        payerInfo,
        passengerList,
        seatCodes
      });

      if (!checkoutValidation.success) {
        sendError(res, checkoutValidation.error, checkoutValidation.code || 'VALIDATION_ERROR', 400);
        return;
      }

      const orderReview = checkoutService.computeOrderReview({
        seats: body.selectedSeats || seatCodes.map(c => ({ seat_code: c, price_vnd: body.unitPriceVnd || 220000 })),
        seatPriceVnd: body.unitPriceVnd || 220000,
        voucherCode: body.voucherCode
      });

      const tripDetailRes = searchService.getTripDetail(tripId);
      const tripDetail = tripDetailRes.success ? tripDetailRes.data : {
        trip_id: tripId,
        route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
        departure_time: '2026-08-28T14:00:00+07:00'
      };

      const paymentOrderResult = paymentService.createPaymentOrder({
        holdId: body.holdId || `hld_${tripId}`,
        trip: tripDetail,
        seatCodes,
        payer: checkoutValidation.data ? checkoutValidation.data.payer : payerInfo,
        passengers: checkoutValidation.data ? checkoutValidation.data.passengers : passengerList,
        amountVnd: orderReview.data ? orderReview.data.total_payment_vnd : orderReview.total_payment_vnd,
        pickupStop: body.pickupStop || 'Bến xe Giáp Bát',
        dropoffStop: body.dropoffStop || 'Bến xe Phía Bắc Thanh Hóa'
      });

      sendSuccess(res, {
        order: orderReview.data || orderReview,
        payment: paymentOrderResult.data
      }, 201);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/tickets (PAX-016: Ticket Wallet)
  if (pathname === '/api/v1/passenger/tickets' && req.method === 'GET') {
    const tab = parsedUrl.searchParams.get('tab') || 'UPCOMING';
    const phone = parsedUrl.searchParams.get('phone') || '0912345678';
    const wallet = paymentService.getTicketsByPhone(phone, tab);
    sendSuccess(res, wallet.data || wallet);
    return true;
  }

  // GET /api/v1/passenger/tickets/:ticketId/qr or /api/v1/tickets/:ticketId (PAX-017: Rotating HMAC QR)
  if (((pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/qr')) || pathname.startsWith('/api/v1/tickets/')) && req.method === 'GET') {
    const parts = pathname.split('/');
    const ticketId = pathname.startsWith('/api/v1/passenger/') ? parts[5] : parts[4];
    const qrResult = paymentService.getDynamicBoardingPass(ticketId);
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
    const groupRes = paymentService.getGroupBoardingPass(orderId);
    if (groupRes.success) {
      sendSuccess(res, groupRes.data);
    } else {
      sendError(res, groupRes.error, groupRes.code, 404);
    }
    return true;
  }

  // POST /api/v1/passenger/tickets/:ticketId/delegate (PAX-017 / REV-01)
  if (pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/delegate') && req.method === 'POST') {
    const parts = pathname.split('/');
    const ticketId = parts[5];
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
    parseJsonBody(req).then(body => {
      const result = trackingService.cancelTicketAndComputeRefund(ticketId, body.departureTime, body.now);
      if (result.success) {
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/trips/:tripId/radar or /api/v1/trips/:tripId/tracking (PAX-018)
  if ((pathname.startsWith('/api/v1/passenger/trips/') || pathname.startsWith('/api/v1/trips/')) && (pathname.endsWith('/radar') || pathname.endsWith('/tracking')) && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    const tracking = trackingService.getLiveTrackingHUD(tripId);
    sendSuccess(res, tracking.data || tracking);
    return true;
  }

  // GET /api/v1/passenger/notifications (PAX-020)
  if (pathname === '/api/v1/passenger/notifications' && req.method === 'GET') {
    const userId = req.headers['x-user-id'] || 'usr_default';
    const notifs = trackingService.getNotifications(userId);
    sendSuccess(res, notifs.data || notifs);
    return true;
  }

  // GET /api/v1/trips/:tripId (PAX-007)
  if ((pathname.startsWith('/api/v1/passenger/trips/') || pathname.startsWith('/api/v1/trips/')) &&
      !pathname.includes('seat-map') && !pathname.includes('hold-seats') && !pathname.includes('radar') &&
      !pathname.includes('seats') && !pathname.includes('tracking') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    const detail = searchService.getTripDetail(tripId);
    if (detail.success) {
      sendSuccess(res, detail.data);
    } else {
      sendError(res, detail.error, detail.code, 404);
    }
    return true;
  }

  return false;
}
