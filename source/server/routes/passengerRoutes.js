/**
 * Passenger API Route Handlers (/api/v1/passenger/...)
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

export function handlePassengerRoutes(req, res, pathname, parsedUrl, services) {
  const { authService, searchService, seatMapService, checkoutService, paymentService, trackingService } = services;

  // GET /api/v1/passenger/config (PAX-001)
  if (pathname === '/api/v1/passenger/config' && req.method === 'GET') {
    const version = req.headers['x-app-version'] || '3.0.0';
    const config = authService.checkAppConfig(version);
    sendSuccess(res, config.data);
    return true;
  }

  // POST /api/v1/passenger/auth/request-otp (PAX-002)
  if (pathname === '/api/v1/passenger/auth/request-otp' && req.method === 'POST') {
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

  // POST /api/v1/passenger/auth/verify-otp (PAX-003)
  if (pathname === '/api/v1/passenger/auth/verify-otp' && req.method === 'POST') {
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

  // GET /api/v1/passenger/stations (PAX-005)
  if (pathname === '/api/v1/passenger/stations' && req.method === 'GET') {
    const q = parsedUrl.searchParams.get('q') || '';
    const stations = searchService.searchStations(q);
    sendSuccess(res, stations);
    return true;
  }

  // GET /api/v1/passenger/trips (PAX-006)
  if (pathname === '/api/v1/passenger/trips' && req.method === 'GET') {
    const origin = parsedUrl.searchParams.get('origin') || 'Hà Nội';
    const dest = parsedUrl.searchParams.get('destination') || 'Thanh Hóa';
    const vehicleType = parsedUrl.searchParams.get('vehicle_type');
    const timeSlot = parsedUrl.searchParams.get('time_slot');
    const trips = searchService.searchTrips({ originCity: origin, destinationCity: dest, vehicleType, timeSlot });
    sendSuccess(res, trips.data);
    return true;
  }

  // GET /api/v1/passenger/trips/:tripId/seat-map (PAX-009)
  if (pathname.startsWith('/api/v1/passenger/trips/') && pathname.endsWith('/seat-map') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[5];
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

  // POST /api/v1/passenger/trips/:tripId/hold-seats (PAX-010)
  if (pathname.startsWith('/api/v1/passenger/trips/') && pathname.endsWith('/hold-seats') && req.method === 'POST') {
    const parts = pathname.split('/');
    const tripId = parts[5];
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

  // POST /api/v1/passenger/bookings/create (PAX-011, PAX-013)
  if (pathname === '/api/v1/passenger/bookings/create' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const checkoutValidation = checkoutService.validateManifest({
        payer: body.payer,
        passengers: body.passengers,
        selectedSeatsCount: (body.selectedSeats || []).length
      });

      if (!checkoutValidation.isValid) {
        sendError(res, checkoutValidation.error, 'VALIDATION_ERROR', 400, checkoutValidation.details);
        return;
      }

      const order = checkoutService.computeOrderReview({
        seats: body.selectedSeats || [],
        seatPriceVnd: body.unitPriceVnd || 220000,
        voucherCode: body.voucherCode
      });

      const paymentOrder = paymentService.createPaymentOrder({
        tripId: body.tripId || 'trp_hn_th_01',
        amountVnd: order.total_payment_vnd,
        passengerName: body.payer.full_name,
        seatCodes: (body.selectedSeats || []).map(s => s.seat_code)
      });

      sendSuccess(res, {
        order,
        payment: paymentOrder
      }, 201);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/trips/:tripId/radar (PAX-018)
  if (pathname.startsWith('/api/v1/passenger/trips/') && pathname.endsWith('/radar') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[5];
    const tracking = trackingService.getLiveTrackingHUD(tripId);
    sendSuccess(res, tracking);
    return true;
  }

  return false;
}
