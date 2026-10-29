/**
 * Comprehensive Passenger API Route Handlers (/api/v1/passenger/... & /api/v1/...)
 * Covers all specifications PAX-001 through PAX-025 and API Screen Map matrix.
 */

import { sendSuccess, sendError, parseJsonBody, clientNow, clientIp } from '../middleware/httpUtils.js';
import { evaluateVoucher, listOfficeVouchers, reserveVoucher } from '../core/vouchers.js';
import { findOperatorById, operatorPaymentConfig, publicOperatorProfile, DEFAULT_OPERATOR_ID } from '../core/operators.js';
import { getProvider } from '../core/payments/providers.js';
import { reconcileOperator } from '../core/payments/reconcile.js';
import { tripVisibleTo } from '../core/tenancy.js';
import { verifyToken } from '../core/tokens.js';
import { applyHomeRun, findShareHolder, homeTarget } from '../core/homeTracking.js';
import { homeConfirmed, publicRouteService, resolveHomeBooking, routeServiceConfig } from '../core/serviceAreas.js';
import { isProduction, isVipPassengerPhone } from '../config.js';
import { addDays, checkBookableDeparture, checkTravelDate, serviceCalendar } from '../core/serviceDate.js';
import { findLiveBanner, listLiveBanners } from '../core/promoBanners.js';
import { saleBlock, saleStatus } from '../core/tripSales.js';
import { withdrawHomeRequest } from '../core/homeReview.js';
import { changeTicketStops } from '../core/ticketChanges.js';
import { publicFixedEndpoints } from '../core/fixedEndpoints.js';
import { validateRefundAccount, maskRefundAccount } from '../core/bankAccounts.js';
import { deletePassengerAccount } from '../services/passenger/modules/accountDeletion.js';

// The plate passengers see is the bus the office gave the run; a day's run with no bus yet shows none.
function withAssignedBus(services, trip) {
  const ops = services.managerService?.trips?.find(t => t.trip_id === trip.trip_id);
  const vehicle = ops?.vehicle_id && services.managerService.vehicles?.find(v => v.vehicle_id === ops.vehicle_id);
  if (vehicle) {
    // The bus decides the seats (D147): its model, its layout's size, and what is still free on it.
    const layout = services.managerService.layoutOfVehicle(vehicle.vehicle_id);
    const taken = services.seatMapService?.getOccupiedSeatCodes?.(trip.trip_id)?.length || 0;
    return {
      ...trip,
      plate_number: ops.vehicle_plate || vehicle.plate_number,
      vehicle_title: vehicle.model || trip.vehicle_title,
      vehicle_type: layout.vehicle_type,
      total_seats: layout.seats.length,
      available_seats_count: Math.max(0, layout.seats.length - taken)
    };
  }
  if (ops) return { ...trip, plate_number: ops.vehicle_plate || null };
  return trip.schedule_id ? { ...trip, plate_number: services.managerService?.defaultPlateFor?.(trip.schedule_id) ?? null } : trip;
}

// With authentication enforced, a ticket or order may only be used by its owner (or its holder, where allowed).
function forbidTicket(req, res, paymentService, ticketId, { ownerOnly = false } = {}) {
  const ticket = paymentService.tickets.get(ticketId);
  if (!ticket || (ticket.operator_id || DEFAULT_OPERATOR_ID) !== (req.operatorId || DEFAULT_OPERATOR_ID)) {
    sendError(res, 'Không tìm thấy vé', 'TICKET_NOT_FOUND', 404);
    return true;
  }
  if (!req.identity) return false;
  const access = paymentService.getTicketAccess(ticketId, req.identity.phone);
  if (access === 'NONE' || (ownerOnly && access === 'HOLDER')) {
    sendError(res, 'Bạn không có quyền với vé này', 'FORBIDDEN', 403);
    return true;
  }
  return false;
}

function forbidOrder(req, res, paymentService, orderId) {
  const order = paymentService.orders.get(orderId) || paymentService.orders.get(paymentService.pnrIndex.get(orderId));
  if (!order || (order.operator_id || DEFAULT_OPERATOR_ID) !== (req.operatorId || DEFAULT_OPERATOR_ID)) {
    sendError(res, 'Không tìm thấy đơn hàng', 'ORDER_NOT_FOUND', 404);
    return true;
  }
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

/** A pushed update waits this long for more positions of the same burst. */
const STREAM_COALESCE_MS = 1000;
/** With no position, the view is pushed again this often: its signal ages (LIVE, then STALE, then OFFLINE). */
const STREAM_REFRESH_MS = 20000;

/**
 * Server-sent events: one `tracking` event now, then one after each position of the bus (bursts coalesced)
 * and every 20 s without one. Ends when the trip has ended or is no longer visible; the client then reconnects
 * or falls back to asking every 10 s.
 */
function streamTracking(req, res, services, tripId, build) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  let pending = null;
  let refresh = null;
  let stopWatching = () => {};
  const close = () => {
    clearTimeout(pending);
    clearInterval(refresh);
    stopWatching();
  };
  const push = () => {
    pending = null;
    const tracking = build();
    if (!tracking) {
      close();
      res.end();
      return;
    }
    res.write(`event: tracking\ndata: ${JSON.stringify(tracking)}\n\n`);
    if (tracking.tracking_ended) {
      close();
      res.end();
    }
  };
  res.write('retry: 5000\n\n');
  push();
  if (res.writableEnded) return;
  stopWatching = services.trackingService.watchPositions(tripId, () => {
    if (!pending) pending = setTimeout(push, STREAM_COALESCE_MS);
  });
  refresh = setInterval(push, STREAM_REFRESH_MS);
  req.on('close', close);
}

/**
 * PAX-018: what the caller may see of the trip's bus, or null when the trip is not theirs to see. A ticket the
 * caller owns (or a share link) shows the bus and the ETA to its own stop; anyone else gets the public view.
 */
export function trackingFor(req, services, tripId, url) {
  const { searchService, paymentService, trackingService } = services;
  if (!tripVisibleTo(services, tripId, req.operatorId)) return null;
  const ticketId = url.searchParams.get('ticket_id');
  const shareToken = url.searchParams.get('share');
  let pickupStopId = null;
  let dropoffStopId = null;
  let boarded = false;
  let view = 'PUBLIC';
  let canSeeBus = false;
  let homePickup = null;
  let manifestId = null;

  let isStaff = false;
  let callerPhone = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const tokenResult = verifyToken(authHeader.slice(7));
    if (tokenResult.valid) {
      if (tokenResult.payload.kind === 'staff' && (tokenResult.payload.operator_id === req.operatorId || tokenResult.payload.role === 'PLATFORM_ADMIN')) {
        isStaff = true;
        canSeeBus = true;
        view = 'STAFF';
      }
      if (tokenResult.payload.kind === 'passenger') {
        callerPhone = tokenResult.payload.phone;
      }
    }
  }

  if (shareToken) {
    // A shared app ticket, or a phone booking's SMS link (D144).
    const holder = findShareHolder(services, shareToken, tripId);
    if (holder) {
      pickupStopId = holder.pickupStopId;
      dropoffStopId = holder.dropoffStopId;
      boarded = holder.boarded;
      view = 'TICKET';
      canSeeBus = true;
      homePickup = homeTarget(holder.home);
      manifestId = holder.manifestId;
    }
  } else if (ticketId && paymentService.tickets) {
    const ticket = paymentService.tickets.get(ticketId);
    if (ticket && ticket.trip_id === tripId && ticket.status !== 'CANCELLED') {
      if (tripVisibleTo(services, ticket.trip_id, req.operatorId)) {
        const access = callerPhone ? paymentService.getTicketAccess(ticketId, callerPhone) : 'NONE';
        if (access !== 'NONE') {
          pickupStopId = ticket.pickup_stop_id || null;
          dropoffStopId = ticket.dropoff_stop_id || null;
          boarded = ticket.status === 'BOARDED';
          view = 'TICKET';
          canSeeBus = true;
          homePickup = homeTarget(ticket.home_pickup);
          manifestId = ticket.ticket_id;
        }
      }
    }
  }

  const detail = searchService.getTripDetail(tripId, req.operatorId);
  const stops = (detail && detail.success && detail.data && Array.isArray(detail.data.stops))
    ? detail.data.stops
    : [];

  const tracking = trackingService.getTripRadar(tripId, {
    pickupStopId,
    dropoffStopId,
    boarded,
    stops,
    view,
    canSeeBus,
    // The live status is the driver's (or the office's) trip, not the search catalog.
    tripStatus: services.driverService?.activeTrips?.get(tripId)?.status || services.managerService?.findTrip?.(tripId)?.status || null,
    isStaff,
    homePickup
  });
  const data = tracking.data || tracking;
  data.boarded = Boolean(boarded);
  // D144: a home pickup is timed along the run (addresses before theirs, the wait at each door).
  return manifestId && !boarded ? applyHomeRun(data, services, tripId, manifestId) : data;
}

export function handlePassengerRoutes(req, res, pathname, parsedUrl, services) {
  const { authService, searchService, seatMapService, checkoutService, paymentService, trackingService, managerService } = services;

  // GET /api/v1/passenger/config or /api/v1/app/config (PAX-001)
  if ((pathname === '/api/v1/passenger/config' || pathname === '/api/v1/app/config') && req.method === 'GET') {
    const version = req.headers['x-app-version'] || '3.0.0';
    const config = authService.checkAppConfig(version);
    const responseData = config.data || config;
    if (req.operator) {
      responseData.operator = publicOperatorProfile(req.operator);
    }
    // The app takes "today" and the bookable days from here, not from the phone's clock.
    responseData.service_calendar = serviceCalendar(Date.now(), { production: isProduction() });
    // The company's fixed origin and destination (D135); null lets the passenger pick places.
    responseData.fixed_endpoints = req.operator
      ? publicFixedEndpoints(req.operator.operator_id, req.operator.service_config, (a, b) => searchService.servesCities(req.operator.operator_id, a, b))
      : null;
    const insEnabled = Boolean(req.operator?.service_config?.insurance_enabled);
    const walEnabled = Boolean(req.operator?.service_config?.wallet_enabled);
    responseData.insurance_enabled = insEnabled;
    responseData.wallet_enabled = walEnabled;
    if (responseData.features) {
      responseData.features.insurance_enabled = insEnabled;
      responseData.features.wallet_enabled = walEnabled;
    }
    sendSuccess(res, responseData);
    return true;
  }

  // POST /api/v1/passenger/auth/request-otp or /api/v1/auth/passenger/otp/request (PAX-002)
  if ((pathname === '/api/v1/passenger/auth/request-otp' || pathname === '/api/v1/auth/passenger/otp/request') && req.method === 'POST') {
    if (services.rateLimits?.requestOtp && !services.rateLimits.requestOtp.enforce(req, res, services.env)) {
      return true;
    }
    parseJsonBody(req).then(body => {
      // Five codes per number in ten minutes, whatever address asks (an SMS costs money).
      const digits = String(body.phone || '').replace(/\D/g, '').slice(-9);
      if (digits && services.rateLimits?.requestOtpPhone && !services.rateLimits.requestOtpPhone.enforce(req, res, services.env, `${req.operatorId}:${digits}`)) return;
      const result = authService.requestOTP(body.phone, clientNow(body), req.operatorId);
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, result.status || 429, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/auth/verify-otp or /api/v1/auth/passenger/otp/verify (PAX-003)
  if ((pathname === '/api/v1/passenger/auth/verify-otp' || pathname === '/api/v1/auth/passenger/otp/verify') && req.method === 'POST') {
    if (services.rateLimits?.verifyOtp && !services.rateLimits.verifyOtp.enforce(req, res, services.env)) {
      return true;
    }
    parseJsonBody(req).then(body => {
      const result = authService.verifyOTP(body.phone, body.otp, clientNow(body), req.operatorId);
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
    const popularCorridors = (managerService?.routes || [])
      .filter(r => (r.operator_id || DEFAULT_OPERATOR_ID) === req.operatorId)
      .slice(0, 3)
      .map(r => ({
        route_id: r.route_id,
        route_name: r.name,
        fare_from_vnd: r.base_fare_vnd,
        duration_hours: r.duration_hours ?? null
      }));

    const db = services.tenantDbs?.forOperator(req.operatorId);
    const vouchers = db ? listOfficeVouchers(db) : [];
    const promotions = vouchers
      .filter(v => v.status === 'LIVE')
      .slice(0, 3)
      .map(v => ({
        code: v.code,
        discount: v.discount_type === 'PERCENT' ? `${v.discount_value}%` : `${v.discount_value.toLocaleString('vi-VN')} đ`,
        description: v.description
      }));

    sendSuccess(res, {
      active_ticket: null,
      popular_corridors: popularCorridors,
      promotions
    });
    return true;
  }

  // GET /api/v1/passenger/promo-banners (PAX-004 slider, D124): an empty list hides the slider
  if (pathname === '/api/v1/passenger/promo-banners' && req.method === 'GET') {
    sendSuccess(res, { banners: listLiveBanners(services.tenantDbs.forOperator(req.operatorId || DEFAULT_OPERATOR_ID)) });
    return true;
  }

  // GET /api/v1/passenger/promo-banners/{id}: the HTML page behind one slide
  const bannerMatch = pathname.match(/^\/api\/v1\/passenger\/promo-banners\/([^/]+)$/);
  if (bannerMatch && req.method === 'GET') {
    const banner = findLiveBanner(services.tenantDbs.forOperator(req.operatorId || DEFAULT_OPERATOR_ID), decodeURIComponent(bannerMatch[1]));
    if (!banner) {
      sendError(res, 'Chương trình này không còn', 'BANNER_NOT_FOUND', 404);
      return true;
    }
    sendSuccess(res, banner);
    return true;
  }

  // GET /api/v1/passenger/stations or /api/v1/routes/stops/search or /api/v1/stations (PAX-005)
  if ((pathname === '/api/v1/passenger/stations' || pathname === '/api/v1/routes/stops/search' || pathname === '/api/v1/stations') && req.method === 'GET') {
    const q = parsedUrl.searchParams.get('q') || '';
    const stations = searchService.searchStations(q, 10, req.operatorId);
    sendSuccess(res, stations);
    return true;
  }

  // GET /api/v1/trips/run-days (PAX-004 date picker, D128): the days of the window with a departure on the route
  if (pathname === '/api/v1/trips/run-days' && req.method === 'GET') {
    const calendar = serviceCalendar(Date.now(), { production: isProduction() });
    const window = [];
    for (let day = calendar.today; day <= calendar.last_date; day = addDays(day, 1)) window.push(day);
    const days = searchService.runDays({
      originCity: parsedUrl.searchParams.get('origin') || '',
      destinationCity: parsedUrl.searchParams.get('destination') || '',
      operatorId: req.operatorId,
      days: window,
      // A suspended route has no day to offer (D132).
      routeOpen: (routeId) => !routeServiceConfig(req.operator?.service_config, routeId).sales_suspended
    });
    sendSuccess(res, { today: calendar.today, last_date: calendar.last_date, days });
    return true;
  }

  // GET /api/v1/passenger/trips or /api/v1/trips/search or /api/v1/trips (PAX-006)
  if ((pathname === '/api/v1/passenger/trips' || pathname === '/api/v1/trips/search' || pathname === '/api/v1/trips') && req.method === 'GET') {
    const origin = parsedUrl.searchParams.get('origin') || parsedUrl.searchParams.get('originCity') || 'Hà Nội';
    const dest = parsedUrl.searchParams.get('destination') || parsedUrl.searchParams.get('destinationCity') || 'Thanh Hóa';
    const vehicleType = parsedUrl.searchParams.get('vehicle_type');
    const timeSlot = parsedUrl.searchParams.get('time_slot');
    // A travel day must be a real YYYY-MM-DD inside the booking window (today .. +14 days, Vietnam time).
    const rawDate = parsedUrl.searchParams.get('date');
    let date = null;
    if (rawDate !== null) {
      const day = checkTravelDate(rawDate, Date.now(), { production: isProduction() });
      if (!day.ok) {
        sendError(res, day.message, day.code, 400);
        return true;
      }
      date = day.date;
    }
    const found = searchService.searchTrips({ originCity: origin, destinationCity: dest, vehicleType, timeSlot, date, operatorId: req.operatorId });
    // Runs of the day that already left are not sold.
    // Cancelled or closed departures and suspended routes are not shown as bookable (spec 6.4, D131, D132).
    const onSale = (found.data || []).filter(t => !saleBlock(services, t.trip_id, req.operator?.service_config, t.route_id));
    const listed = date ? onSale.filter(t => checkBookableDeparture(t.departure_time, Date.now(), { production: isProduction() }).ok) : onSale;
    // Each trip says how its route offers pickup / drop-off (stop style and modes, set per company and route).
    // With stop coordinates and the road shape, so the app can draw the route line without another call.
    sendSuccess(res, listed.map(t => withAssignedBus(services, { ...(searchService.getTripDetail(t.trip_id, req.operatorId).data || t), sale_status: saleStatus(services, t.trip_id), service: publicRouteService(req.operator?.service_config, t.route_id) })));
    return true;
  }

  // GET /api/v1/passenger/trips/:tripId/seat-map or /api/v1/trips/:tripId/seat-map (PAX-009)
  if ((pathname.startsWith('/api/v1/passenger/trips/') || pathname.startsWith('/api/v1/trips/')) && pathname.endsWith('/seat-map') && req.method === 'GET') {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    if (!tripVisibleTo(services, tripId, req.operatorId)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
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
    if (!tripVisibleTo(services, tripId, req.operatorId)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    parseJsonBody(req).then(body => {
      const userId = req.identity?.sub || body.userId;
      if (!userId) {
        sendError(res, 'Thiếu thông tin người dùng', 'USER_REQUIRED', 400);
        return;
      }
      // The trip must still be on sale; the clock is the server's (a client "now" is honoured only in tests).
      const bookable = checkBookableDeparture(searchService.getTripDetail(tripId, req.operatorId).data?.departure_time, Date.now(), { production: isProduction() });
      if (!bookable.ok) {
        sendError(res, bookable.message, bookable.code, 409);
        return;
      }
      const blocked = saleBlock(services, tripId, req.operator?.service_config, searchService.getTripDetail(tripId, req.operatorId).data?.route_id);
      if (blocked) {
        sendError(res, blocked.message, blocked.code, 409);
        return;
      }
      // The company stopped this departure on that day (D128): sold tickets stay, no new ones.
      if (!searchService.isOnSchedule(tripId)) {
        sendError(res, 'Nhà xe không còn chạy chuyến này vào ngày đã chọn. Chọn chuyến khác.', 'TRIP_NOT_SCHEDULED', 409);
        return;
      }
      const result = seatMapService.holdSeats(tripId, body.seatCodes || [], userId, clientNow(body), {
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

      if (!tripVisibleTo(services, tripId, req.operatorId)) {
        sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
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

      const tripDetailRes = searchService.getTripDetail(tripId, req.operatorId);
      if (!tripDetailRes.success) {
        sendError(res, tripDetailRes.error, tripDetailRes.code || 'TRIP_NOT_FOUND', 404);
        return;
      }
      const tripDetail = tripDetailRes.data;
      const bookable = checkBookableDeparture(tripDetail.departure_time, Date.now(), { production: isProduction() });
      if (!bookable.ok) {
        sendError(res, bookable.message, bookable.code, 409);
        return;
      }

      // Cancelled, closed or suspended since the hold: the hold no longer sells (D131, D132).
      const blocked = saleBlock(services, tripId, req.operator?.service_config, tripDetail.route_id);
      if (blocked) {
        sendError(res, blocked.message, blocked.code, 409);
        return;
      }

      const holdCheck = seatMapService.validateHold(tripId, body.holdId, userId, seatCodes);
      if (!holdCheck.success) {
        sendError(res, holdCheck.error, holdCheck.code, 409);
        return;
      }

      // Home pickup / drop-off (spec 3.1): checked against the company's areas, fee added to the order.
      // Seed trips are dated 2026-08-28: outside production a departure already past is a demo trip, so the lead time
      // is measured as if booked the day before.
      const departureMs = new Date(tripDetail.departure_time).getTime();
      const home = resolveHomeBooking(routeServiceConfig(req.operator?.service_config, tripDetail.route_id), {
        stops: tripDetail.stops || [],
        departureTime: tripDetail.departure_time,
        pickupStopId: holdCheck.data.pickup_stop_id,
        dropoffStopId: holdCheck.data.dropoff_stop_id,
        homePickup: body.homePickup,
        homeDropoff: body.homeDropoff,
        now: !isProduction() && departureMs < Date.now() ? departureMs - 24 * 3600000 : Date.now()
      });
      if (!home.ok) {
        sendError(res, home.message, home.code, home.code === 'VALIDATION_ERROR' ? 400 : 422);
        return;
      }

      const vip = req.identity?.vip === true && isVipPassengerPhone(req.identity.phone);
      if (vip) {
        home.fee_vnd = 0;
        if (home.home_pickup) home.home_pickup.fee_vnd = 0;
        if (home.home_dropoff) home.home_dropoff.fee_vnd = 0;
      }

      const voucherDb = (!vip && body.voucherCode) ? services.tenantDbs.forOperator(req.operatorId) : null;
      const voucherPhone = req.identity?.phone || checkoutValidation.data.payer?.phone || null;
      const orderReview = checkoutService.computeOrderReview({
        trip: tripDetail,
        seats: holdCheck.data.seats,
        seatCodes,
        ...(vip ? { free: true } : { voucherCode: body.voucherCode }),
        resolveVoucher: vip ? null : ((code, subtotal) => evaluateVoucher(voucherDb, code, { subtotal, phone: voucherPhone })),
        insuranceSelected: Boolean(body.insuranceSelected),
        insuranceEnabled: Boolean(req.operator?.service_config?.insurance_enabled)
      });
      if (!orderReview.success) {
        sendError(res, orderReview.error, orderReview.code, 422);
        return;
      }
      const applied = orderReview.data.applied_voucher;
      const totalVnd = orderReview.total_payment_vnd + home.fee_vnd;

      const rawMethod = body.paymentMethod;
      if (rawMethod !== undefined && rawMethod !== null && !['CASH', 'BANK_TRANSFER', 'VIETQR_NAPAS247', 'VIETQR'].includes(rawMethod)) {
        sendError(res, 'Nhà xe không hỗ trợ phương thức thanh toán này', 'PAYMENT_METHOD_NOT_ALLOWED', 422);
        return;
      }
      let paymentMethod = rawMethod === 'CASH' ? 'CASH' : 'VIETQR_NAPAS247';
      const methodKey = paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER';
      const allowedMethods = operatorPaymentConfig(req.operator).methods;
      if (!allowedMethods.includes(methodKey)) {
        sendError(
          res,
          methodKey === 'CASH' ? 'Nhà xe không nhận thanh toán tiền mặt' : 'Nhà xe không nhận thanh toán chuyển khoản',
          'PAYMENT_METHOD_NOT_ALLOWED',
          422
        );
        return;
      }
      if (paymentMethod === 'CASH' && totalVnd === 0) {
        paymentMethod = 'VIETQR_NAPAS247';
      }

      if (paymentMethod !== 'CASH' && totalVnd > 0 && (!req.operator?.bank?.bin || !req.operator?.bank?.account_number)) {
        sendError(res, 'Nhà xe chưa có tài khoản nhận tiền, vui lòng liên hệ tổng đài nhà xe', 'PAYEE_MISSING', 409);
        return;
      }

      const paymentOrderResult = paymentService.createPaymentOrder({
        holdId: body.holdId,
        trip: tripDetail,
        seatCodes,
        payer: checkoutValidation.data.payer,
        passengers: checkoutValidation.data.passengers,
        amountVnd: totalVnd,
        homePickup: home.home_pickup,
        homeDropoff: home.home_dropoff,
        // The segment is the one of the hold; names come from the trip stops (a client name is only for old callers)
        pickupStopId: holdCheck.data.pickup_stop_id,
        dropoffStopId: holdCheck.data.dropoff_stop_id,
        pickupStop: (tripDetail.stops || []).find(s => s.stop_id === holdCheck.data.pickup_stop_id)?.name || body.pickupStop || 'Bến xe Giáp Bát',
        dropoffStop: (tripDetail.stops || []).find(s => s.stop_id === holdCheck.data.dropoff_stop_id)?.name || body.dropoffStop || 'Bến xe Phía Bắc Thanh Hóa',
        voucherCode: applied?.code || null,
        discountVnd: applied?.discount_amount || 0,
        paymentMethod
      });

      // The code's use is taken now and given back if the payment window closes unpaid.
      if (applied) {
        reserveVoucher(voucherDb, { code: applied.code, orderId: paymentOrderResult.data.order_id, phone: voucherPhone, discountVnd: applied.discount_amount, expiresAt: paymentOrderResult.data.expires_at });
      }

      // The hold becomes a payment lock until the payment window closes (no double sale while the customer pays).
      seatMapService.extendHold(tripId, body.holdId, new Date(paymentOrderResult.data.expires_at).getTime());

      // Nothing to transfer (a code took the whole fare): banks cannot send 0 đ, so the order is paid now.
      if (totalVnd === 0) {
        paymentService.settlePayment(paymentOrderResult.data.order_id, vip ? 'VIP_FREE' : `VOUCHER_${applied?.code || 'FREE'}`);
      } else if (paymentMethod === 'CASH') {
        paymentService.settlePayment(paymentOrderResult.data.order_id, 'CASH_ON_BOARDING');
      }

      sendSuccess(res, {
        // needs_review: an address the company still has to confirm; the app says so before the transfer (D130).
        order: { ...orderReview.data, home_service_fee_vnd: home.fee_vnd, total_payment_vnd: totalVnd, home_pickup_status: home.home_pickup?.status || null, home_dropoff_status: home.home_dropoff?.status || null, home_needs_review: Boolean(home.needs_review), ...(vip ? { vip: true } : {}) },
        payment: paymentOrderResult.data
      }, 201);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/tickets (PAX-016: Ticket Wallet)
  if (pathname === '/api/v1/passenger/tickets' && req.method === 'GET') {
    const tab = parsedUrl.searchParams.get('tab') || 'UPCOMING';
    const phone = req.identity ? req.identity.phone : parsedUrl.searchParams.get('phone');
    const wallet = paymentService.getTicketsByPhone(phone, tab, req.operatorId);
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

  // POST /api/v1/passenger/tickets/:ticketId/share (PAX-018)
  if (pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/share') && req.method === 'POST') {
    const parts = pathname.split('/');
    const ticketId = parts[5];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    const result = paymentService.createShareLink(ticketId);
    if (result.success) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error, result.code, 400);
    }
    return true;
  }

  // POST /api/v1/passenger/payments/:orderId/verify-status (PAX-013 / REV-02)
  if (pathname.startsWith('/api/v1/passenger/payments/') && pathname.endsWith('/verify-status') && req.method === 'POST') {
    const parts = pathname.split('/');
    const orderId = parts[5];
    if (forbidOrder(req, res, paymentService, orderId)) return true;
    parseJsonBody(req).then(async body => {
      const manualTrigger = Boolean(body.manualTrigger || body.manual_trigger);
      const now = clientNow(body);
      const order = paymentService.orders.get(orderId) || paymentService.orders.get(paymentService.pnrIndex.get(orderId));
      if (manualTrigger && order && order.payment_status === 'PENDING_PAYMENT') {
        const op = findOperatorById(order.operator_id || req.operatorId);
        const provider = getProvider(operatorPaymentConfig(op).transfer_provider);
        if (provider?.auto && typeof provider.fetchTransactions === 'function') {
          const lastAt = order.last_manual_reconcile_at ? Date.parse(order.last_manual_reconcile_at) : 0;
          if (!lastAt || (now - lastAt >= 15000)) {
            order.last_manual_reconcile_at = new Date(now).toISOString();
            await reconcileOperator(services, op.operator_id, { now });
          }
        }
      }
      const result = paymentService.checkPaymentStatus(order ? order.order_id : orderId, {
        manualTrigger,
        mockNow: now
      });
      if (result.success) {
        sendSuccess(res, result);
      } else {
        sendError(res, result.error, result.code, 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/tickets/:ticketId/home-request/withdraw {side}: take back a home request under review (D130)
  const withdraw = pathname.match(/^\/api\/v1\/passenger\/tickets\/([^/]+)\/home-request\/withdraw$/);
  if (withdraw && req.method === 'POST') {
    const ticketId = withdraw[1];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    parseJsonBody(req).then(body => {
      if (!['PICKUP', 'DROPOFF'].includes(body.side)) {
        sendError(res, 'side phải là PICKUP hoặc DROPOFF', 'VALIDATION_ERROR', 400);
        return;
      }
      const r = withdrawHomeRequest(services, paymentService.tickets.get(ticketId), body.side);
      if (r.ok) sendSuccess(res, { ...r.request, refund_id: r.refund?.refund_id || null });
      else sendError(res, r.message, r.code, r.status);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/tickets/:ticketId/stops {pickup_stop_id?, dropoff_stop_id?}: change stops inside the paid segment (D133)
  const stopsChange = pathname.match(/^\/api\/v1\/passenger\/tickets\/([^/]+)\/stops$/);
  if (stopsChange && req.method === 'POST') {
    const ticketId = stopsChange[1];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    parseJsonBody(req).then(body => {
      const r = changeTicketStops(services, paymentService.tickets.get(ticketId), {
        pickupStopId: body.pickup_stop_id || body.pickupStopId || null,
        dropoffStopId: body.dropoff_stop_id || body.dropoffStopId || null,
        demo: !isProduction()
      });
      if (r.ok) sendSuccess(res, r.ticket);
      else sendError(res, r.message, r.code, r.status);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/tickets/:ticketId/cancel (PAX-021: Cancellation & Refund)
  if (pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/cancel') && req.method === 'POST') {
    const parts = pathname.split('/');
    const ticketId = parts[5];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    parseJsonBody(req).then(body => {
      const result = paymentService.cancelTicket(ticketId, {
        now: clientNow(body),
        reason: body.reason,
        refund_account: body.refund_account || body.refundAccount || null
      });
      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        sendError(res, result.error, result.code, result.code === 'TICKET_NOT_FOUND' ? 404 : 400);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // PATCH /api/v1/passenger/tickets/:ticketId/refund-account (H-01)
  if (pathname.startsWith('/api/v1/passenger/tickets/') && pathname.endsWith('/refund-account') && req.method === 'PATCH') {
    const parts = pathname.split('/');
    const ticketId = parts[5];
    if (forbidTicket(req, res, paymentService, ticketId, { ownerOnly: true })) return true;
    parseJsonBody(req).then(body => {
      const accInput = body.refund_account || body.refundAccount || body;
      const accCheck = validateRefundAccount(accInput);
      if (!accCheck.ok) {
        sendError(res, accCheck.message, accCheck.code, 400);
        return;
      }
      const ticket = paymentService.tickets.get(ticketId);
      const refund = managerService.refundRequests.find(r => r.ticket_id === ticketId || (ticket?.pnr && r.pnr === ticket.pnr));
      if (!refund) {
        sendError(res, 'Không tìm thấy yêu cầu hoàn tiền', 'REFUND_NOT_FOUND', 404);
        return;
      }
      if (refund.status !== 'REFUND_REQUESTED') {
        sendError(res, 'Chỉ có thể đổi tài khoản khi yêu cầu hoàn tiền đang chờ xử lý', 'REFUND_NOT_EDITABLE', 400);
        return;
      }
      refund.refund_account = accCheck.account;
      sendSuccess(res, {
        ticket_id: ticketId,
        refund_id: refund.refund_id,
        refund_account: maskRefundAccount(accCheck.account)
      });
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/passenger/trips/:tripId/radar or /api/v1/trips/:tripId/tracking (PAX-018)
  if (req.method === 'GET' && (TRIP_SUB_RE('radar').test(pathname) || TRIP_SUB_RE('tracking').test(pathname))) {
    const parts = pathname.split('/');
    const tripId = parts[pathname.startsWith('/api/v1/passenger/') ? 5 : 4];
    const tracking = trackingFor(req, services, tripId, new URL(req.url, 'http://x'));
    if (!tracking) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    sendSuccess(res, tracking);
    return true;
  }

  // GET /api/v1/trips/:tripId/tracking/stream (PAX-018): the same view, pushed when the bus sends a position
  if (req.method === 'GET' && TRIP_SUB_RE('tracking/stream').test(pathname)) {
    const tripId = pathname.match(TRIP_SUB_RE('tracking/stream'))[1];
    const url = new URL(req.url, 'http://x');
    if (!trackingFor(req, services, tripId, url)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    streamTracking(req, res, services, tripId, () => trackingFor(req, services, tripId, url));
    return true;
  }

  // D144: a home passenger answers before the bus comes: READY, NEED_2 or NEED_5 (minutes).
  // POST /api/v1/passenger/tickets/:ticketId/pickup-ready (owner token) or /api/v1/share/:token/pickup-ready (SMS link)
  const readyTicket = pathname.match(/^\/api\/v1\/passenger\/tickets\/([^/]+)\/pickup-ready$/);
  const readyShare = pathname.match(/^\/api\/v1\/share\/([A-Za-z0-9_-]+)\/pickup-ready$/);
  if ((readyTicket || readyShare) && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      let tripId = null;
      let manifestId = null;
      if (readyTicket) {
        const ticket = paymentService.tickets.get(decodeURIComponent(readyTicket[1]));
        const phone = req.identity?.phone;
        if (!ticket || !phone || paymentService.getTicketAccess(ticket.ticket_id, phone) === 'NONE' || !tripVisibleTo(services, ticket.trip_id, req.operatorId)) {
          sendError(res, 'Không tìm thấy vé', 'TICKET_NOT_FOUND', 404);
          return;
        }
        tripId = ticket.trip_id;
        manifestId = ticket.ticket_id;
      } else {
        const holder = findShareHolder(services, readyShare[1]);
        if (!holder) {
          sendError(res, 'Link theo dõi không hợp lệ hoặc đã hết hạn', 'SHARE_NOT_FOUND', 404);
          return;
        }
        tripId = holder.tripId;
        manifestId = holder.manifestId;
      }
      const result = services.driverService.setPickupReady(tripId, manifestId, body.status);
      if (result.success) sendSuccess(res, result.data);
      else sendError(res, result.error, result.code, result.code === 'VALIDATION_ERROR' ? 400 : (['TRIP_NOT_FOUND', 'TICKET_NOT_FOUND'].includes(result.code) ? 404 : 409));
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/passenger/devices (D144): the app's phone, with a push token once it has one
  if (pathname === '/api/v1/passenger/devices' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const phone = req.identity?.phone;
      if (!phone) {
        sendError(res, 'Cần đăng nhập', 'UNAUTHORIZED', 401);
        return;
      }
      const token = typeof body.token === 'string' && body.token.length <= 4096 ? body.token : null;
      const platform = ['android', 'ios', 'web'].includes(body.platform) ? body.platform : null;
      sendSuccess(res, services.messenger.registerDevice(phone, { token, platform, operatorId: req.operatorId }));
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
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
    const notifs = trackingService.getNotifications(phone, req.operatorId);
    sendSuccess(res, notifs.data || notifs);
    return true;
  }

  // GET /api/v1/trips/:tripId/stops (PAX-008)
  if (req.method === 'GET' && TRIP_SUB_RE('stops').test(pathname)) {
    const tripId = pathname.match(TRIP_SUB_RE('stops'))[1];
    if (!tripVisibleTo(services, tripId, req.operatorId)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    const detail = searchService.getTripDetail(tripId, req.operatorId);
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
    if (!tripVisibleTo(services, tripId, req.operatorId)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
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
    if (!tripVisibleTo(services, tripId, req.operatorId)) {
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
      const data = { ...profile.data };
      if (data.phone) {
        data.wallet_balance_vnd = paymentService.getWalletBalance(data.phone, req.operatorId);
      }
      sendSuccess(res, data);
    } else {
      sendError(res, profile.error, profile.code, 401);
    }
    return true;
  }

  // DELETE /api/v1/passenger/me (PAX-022, B-12): the passenger deletes their account with this company
  if (pathname === '/api/v1/passenger/me' && req.method === 'DELETE') {
    const result = deletePassengerAccount(services, { operatorId: req.operatorId, phone: req.identity?.phone });
    if (!result.ok) {
      sendError(res, result.message, result.code, result.status);
      return true;
    }
    managerService.recordAudit({
      actor: req.identity.sub,
      role: 'ROLE_PASSENGER',
      action: 'PASSENGER_ACCOUNT_DELETED',
      resource: result.masked_phone,
      ip: clientIp(req, services.env),
      operator_id: req.operatorId
    });
    sendSuccess(res, { deleted: true });
    return true;
  }

  // GET /api/v1/trips/:tripId (PAX-007)
  if (req.method === 'GET' && TRIP_DETAIL_RE.test(pathname)) {
    const tripId = pathname.match(TRIP_DETAIL_RE)[1];
    if (!tripVisibleTo(services, tripId, req.operatorId)) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    const detail = searchService.getTripDetail(tripId, req.operatorId);
    if (detail.success) {
      sendSuccess(res, withAssignedBus(services, { ...detail.data, service: publicRouteService(req.operator?.service_config, detail.data.route_id) }));
    } else {
      sendError(res, detail.error, detail.code, 404);
    }
    return true;
  }

  return false;
}
