/**
 * Manager Operations Control Center API Route Handlers (/api/v1/ops/... & /api/v1/auth/staff/...)
 * Covers all specifications MGR-001 through MGR-030 and API Screen Map matrix.
 */

import crypto from 'crypto';
import { DEFAULT_OPERATOR_ID } from '../core/operators.js';
import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';
import { maskPhone, normalizePlate } from '../services/passenger/core/formatters.js';
import { ADMIN_ROLE } from '../core/gateway.js';
import { tripVisibleTo } from '../core/tenancy.js';
import { parseServiceDate } from '../core/serviceDate.js';
import { isProduction } from '../config.js';
import { resolveHomeBooking, routeServiceConfig } from '../core/serviceAreas.js';
import { BUILTIN_LAYOUTS, validateLayout, findLayout } from '../core/seatLayouts.js';

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
    operator_id: req.operatorId || null,
    ...entry
  });
}

const FLEET_PATHS = ['/api/v1/ops/fleet', '/api/v1/ops/fleet/vehicles', '/api/v1/ops/vehicles'];
const CREW_PATHS = ['/api/v1/ops/crew', '/api/v1/ops/crew/drivers', '/api/v1/ops/drivers'];
const TRIP_DETAIL_RE = /^\/api\/v1\/ops\/trips\/([^/]+)(?:\/master)?$/;
const SEAT_INVENTORY_RE = /^\/api\/v1\/ops\/trips\/([^/]+)\/(?:seat-inventory|seat-matrix)$/;

/**
 * D144: a home address taken on the phone, checked like an app booking (service area, lead time, fee). The office
 * took it, so it is confirmed at once; the passenger rides from the trip's first stop.
 */
function officeHome(req, services, tripId, body) {
  const raw = body.homePickup || body.home_pickup;
  if (!raw) return { ok: true, home: null, fee: 0, pickupStopId: null };
  const detail = services.searchService.getTripDetail(tripId, req.operatorId);
  if (!detail?.success) return { ok: false, code: 'TRIP_NOT_FOUND', message: 'Chuyến xe không tồn tại' };
  const trip = detail.data;
  const departureMs = Date.parse(trip.departure_time);
  const r = resolveHomeBooking(routeServiceConfig(req.operator?.service_config, trip.route_id), {
    stops: trip.stops || [],
    departureTime: trip.departure_time,
    pickupStopId: null,
    dropoffStopId: null,
    homePickup: raw,
    now: !isProduction() && departureMs < Date.now() ? departureMs - 24 * 3600000 : Date.now()
  });
  if (!r.ok) return r;
  const home = { ...r.home_pickup, status: 'CONFIRMED', reviewed_by: req.identity?.sub || null, source: 'OFFICE' };
  return { ok: true, home, fee: r.fee_vnd, pickupStopId: home.anchor_stop_id };
}

export function handleManagerRoutes(req, res, pathname, parsedUrl, services) {
  const { managerService } = services;

  // POST /api/v1/ops/auth/login or /api/v1/auth/staff/login (MGR-001, MGR-029)
  if ((pathname === '/api/v1/ops/auth/login' || pathname === '/api/v1/auth/staff/login') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const username = String(body.username || body.email || '').trim().toLowerCase();
      const result = managerService.authenticateStaff(username, body.password, body.totp ?? body.totpCode ?? null);
      if (result.success) {
        managerService.recordAudit({ actor: result.data.user.user_id, role: result.data.user.role, action: 'LOGIN', resource: username, ip: req.socket?.remoteAddress || null, operator_id: result.data.operator?.operator_id ?? null });
        sendSuccess(res, result.data || result);
      } else {
        managerService.recordAudit({ action: result.code === 'ACCOUNT_LOCKED' ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', resource: username, ip: req.socket?.remoteAddress || null });
        const status = result.code === 'ACCOUNT_LOCKED' ? 429 : result.code === 'OPERATOR_INACTIVE' ? 403 : 401;
        sendError(res, result.error, result.code, status, result);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/dashboard/kpis (MGR-002)
  if (pathname === '/api/v1/ops/dashboard/kpis' && req.method === 'GET') {
    const kpis = managerService.getOperationsDashboardKPIs(req.operatorId);
    sendSuccess(res, kpis.data || kpis);
    return true;
  }

  // GET /api/v1/ops/radar or /api/v1/ops/fleet/live-positions (MGR-003, MGR-004)
  if ((pathname === '/api/v1/ops/radar' || pathname === '/api/v1/ops/fleet/live-positions') && req.method === 'GET') {
    const radar = managerService.getLiveFleetRadar(Date.now(), req.operatorId);
    sendSuccess(res, radar.data || radar);
    return true;
  }

  // GET /api/v1/ops/fleet or /api/v1/ops/vehicles (MGR-005, MGR-006, MGR-007)
  if (FLEET_PATHS.includes(pathname) && req.method === 'GET') {
    const fleet = managerService.getFleetRoster(req.operatorId);
    sendSuccess(res, fleet.data || fleet);
    return true;
  }

  // POST /api/v1/ops/vehicles (MGR-006)
  if (pathname === '/api/v1/ops/vehicles' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const rawPlate = body?.plate_number ?? body?.plateNumber;
      const plateCheck = normalizePlate(rawPlate);
      if (!plateCheck.isValid) {
        sendError(res, plateCheck.message, 'VALIDATION_ERROR', 400);
        return;
      }
      const normalizedPlate = plateCheck.normalized;
      const operatorId = req.operatorId || DEFAULT_OPERATOR_ID;
      const exists = managerService.vehicles.some(v => (v.operator_id || DEFAULT_OPERATOR_ID) === operatorId && normalizePlate(v.plate_number).normalized === normalizedPlate);
      if (exists) {
        sendError(res, 'Biển số xe đã tồn tại trong đội xe của công ty', 'VEHICLE_EXISTS', 409);
        return;
      }
      const layoutId = body?.layout_id || body?.layoutId;
      const customLayouts = (managerService.seatLayouts || []).filter(l => (l.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
      const layout = layoutId ? findLayout(layoutId, customLayouts) : null;
      if (!layout) {
        sendError(res, 'Sơ đồ ghế không hợp lệ hoặc không thuộc nhà xe', 'VALIDATION_ERROR', 400);
        return;
      }
      const rawModel = typeof body?.model === 'string' ? body.model.trim() : '';
      if (!rawModel) {
        sendError(res, 'Dòng xe không được để trống', 'VALIDATION_ERROR', 400);
        return;
      }
      if (rawModel.length > 80) {
        sendError(res, 'Dòng xe tối đa 80 ký tự', 'VALIDATION_ERROR', 400);
        return;
      }
      const model = rawModel;
      const result = managerService.addVehicle({ plate_number: normalizedPlate, model, layout_id: layout.layout_id }, operatorId);
      const newVehicle = result.data;
      audit(req, managerService, { action: 'VEHICLE_CREATE', resource: newVehicle.vehicle_id, before: null, after: newVehicle });
      sendSuccess(res, newVehicle, 201);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // PATCH /api/v1/ops/vehicles/:vehicleId (MGR-006)
  const vehicleOne = pathname.match(/^\/api\/v1\/ops\/vehicles\/([^/]+)$/);
  if (vehicleOne && req.method === 'PATCH') {
    const vehicleId = decodeURIComponent(vehicleOne[1]);
    const operatorId = req.operatorId || DEFAULT_OPERATOR_ID;
    const vehicle = managerService.vehicles.find(v => v.vehicle_id === vehicleId && (v.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    if (!vehicle) {
      sendError(res, 'Không tìm thấy xe', 'VEHICLE_NOT_FOUND', 404);
      return true;
    }
    parseJsonBody(req).then(body => {
      const before = { ...vehicle };
      const assignedTrips = managerService.trips.filter(t => (t.operator_id || DEFAULT_OPERATOR_ID) === operatorId && t.vehicle_id === vehicleId && t.status !== 'COMPLETED');
      if (body.layout_id !== undefined && body.layout_id !== vehicle.layout_id) {
        const customLayouts = (managerService.seatLayouts || []).filter(l => (l.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
        const newLayout = findLayout(body.layout_id, customLayouts);
        if (!newLayout) {
          sendError(res, 'Sơ đồ ghế không tồn tại hoặc không thuộc nhà xe', 'VALIDATION_ERROR', 400);
          return;
        }
        const newCodes = new Set(newLayout.seats.map(s => s.seat_code));
        for (const trip of assignedTrips) {
          const occupied = services.seatMapService ? services.seatMapService.getOccupiedSeatCodes(trip.trip_id) : [];
          const missing = occupied.filter(c => !newCodes.has(c));
          if (missing.length > 0 || (occupied.length === 0 && ((trip.booked_seats || 0) + (trip.held_seats || 0)) > 0)) {
            sendError(res, `Sơ đồ mới thiếu ghế đã bán hoặc đang giữ: ${missing.length > 0 ? missing.join(', ') : 'ghế đã bán'}`, 'LAYOUT_MISSING_SOLD_SEATS', 409);
            return;
          }
        }
        vehicle.layout_id = newLayout.layout_id;
        vehicle.total_seats = newLayout.seats.length;
        vehicle.layout_name = newLayout.name;
        for (const trip of assignedTrips) {
          trip.total_seats = vehicle.total_seats;
          if (services.seatMapService) services.seatMapService.rebuildLayout(trip.trip_id);
        }
      }
      if (body.model !== undefined) {
        vehicle.model = String(body.model).trim();
      }
      audit(req, managerService, { action: 'VEHICLE_UPDATE', resource: vehicleId, before, after: { ...vehicle } });
      sendSuccess(res, vehicle);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/seat-layouts (MGR-007)
  if (pathname === '/api/v1/ops/seat-layouts' && req.method === 'GET') {
    const operatorId = req.operatorId || DEFAULT_OPERATOR_ID;
    const companyVehicles = managerService.vehicles.filter(v => (v.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    const companyCustom = (managerService.seatLayouts || []).filter(l => (l.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    const all = [
      ...BUILTIN_LAYOUTS.map(b => ({ ...b, builtin: true })),
      ...companyCustom.map(c => ({ ...c, builtin: false }))
    ];
    const data = all.map(l => ({
      layout_id: l.layout_id,
      name: l.name,
      vehicle_type: l.vehicle_type,
      total_decks: l.total_decks,
      columns: l.columns,
      total_seats: l.total_seats || l.seats?.length || 0,
      seats: l.seats,
      builtin: Boolean(l.builtin),
      used_by: companyVehicles.filter(v => managerService.layoutOfVehicle(v.vehicle_id)?.layout_id === l.layout_id).map(v => v.plate_number)
    }));
    sendSuccess(res, data);
    return true;
  }

  // POST /api/v1/ops/seat-layouts (MGR-007)
  if (pathname === '/api/v1/ops/seat-layouts' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const candidate = {
        name: body?.name,
        vehicle_type: body?.vehicle_type || (body?.total_decks > 1 ? 'DOUBLE_DECK_SLEEPER' : 'SINGLE_DECK_SEATER'),
        total_decks: body?.total_decks,
        columns: body?.columns,
        seats: body?.seats
      };
      const err = validateLayout(candidate);
      if (err) {
        sendError(res, err, 'VALIDATION_ERROR', 400);
        return;
      }
      const operatorId = req.operatorId || DEFAULT_OPERATOR_ID;
      const newLayout = {
        layout_id: `custom_${crypto.randomBytes(4).toString('hex')}`,
        operator_id: operatorId,
        name: candidate.name,
        vehicle_type: candidate.vehicle_type,
        total_decks: candidate.total_decks,
        columns: candidate.columns,
        total_seats: candidate.seats.length,
        seats: candidate.seats,
        builtin: false
      };
      managerService.seatLayouts.push(newLayout);
      audit(req, managerService, { action: 'SEAT_LAYOUT_CREATE', resource: newLayout.layout_id, before: null, after: newLayout });
      sendSuccess(res, newLayout, 201);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // PATCH or DELETE /api/v1/ops/seat-layouts/:layoutId (MGR-007)
  const seatLayoutOne = pathname.match(/^\/api\/v1\/ops\/seat-layouts\/([^/]+)$/);
  if (seatLayoutOne && req.method === 'PATCH') {
    const layoutId = decodeURIComponent(seatLayoutOne[1]);
    if (BUILTIN_LAYOUTS.some(b => b.layout_id === layoutId)) {
      sendError(res, 'Không thể chỉnh sửa sơ đồ mặc định của hệ thống', 'LAYOUT_BUILTIN', 409);
      return true;
    }
    const operatorId = req.operatorId || DEFAULT_OPERATOR_ID;
    const existing = (managerService.seatLayouts || []).find(l => l.layout_id === layoutId && (l.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    if (!existing) {
      sendError(res, 'Không tìm thấy sơ đồ ghế', 'LAYOUT_NOT_FOUND', 404);
      return true;
    }
    parseJsonBody(req).then(body => {
      const candidate = {
        name: body.name !== undefined ? body.name : existing.name,
        vehicle_type: body.vehicle_type !== undefined ? body.vehicle_type : existing.vehicle_type,
        total_decks: body.total_decks !== undefined ? body.total_decks : existing.total_decks,
        columns: body.columns !== undefined ? body.columns : existing.columns,
        seats: body.seats !== undefined ? body.seats : existing.seats
      };
      const err = validateLayout(candidate);
      if (err) {
        sendError(res, err, 'VALIDATION_ERROR', 400);
        return;
      }

      const usingVehicles = managerService.vehicles.filter(v => (v.operator_id || DEFAULT_OPERATOR_ID) === operatorId && v.layout_id === layoutId);
      const inUse = usingVehicles.some(v => {
        const trips = managerService.trips.filter(t => (t.operator_id || DEFAULT_OPERATOR_ID) === operatorId && t.vehicle_id === v.vehicle_id && t.status !== 'COMPLETED');
        return trips.some(t => {
          const held = services.seatMapService ? services.seatMapService.getOccupiedSeatCodes(t.trip_id).length : 0;
          return ((t.booked_seats || 0) + (t.held_seats || 0) + held) > 0;
        });
      });
      if (inUse) {
        sendError(res, 'Sơ đồ đang được sử dụng bởi chuyến xe đã có vé đặt hoặc đang giữ chỗ', 'LAYOUT_IN_USE', 409);
        return;
      }

      const before = { ...existing };
      existing.name = candidate.name;
      existing.vehicle_type = candidate.vehicle_type;
      existing.total_decks = candidate.total_decks;
      existing.columns = candidate.columns;
      existing.seats = candidate.seats;
      existing.total_seats = candidate.seats.length;

      for (const v of usingVehicles) {
        v.total_seats = existing.total_seats;
        v.layout_name = existing.name;
        // Finished trips keep the seats they ran with.
        const trips = managerService.trips.filter(t => (t.operator_id || DEFAULT_OPERATOR_ID) === operatorId && t.vehicle_id === v.vehicle_id && t.status !== 'COMPLETED');
        for (const t of trips) {
          t.total_seats = existing.total_seats;
          if (services.seatMapService) services.seatMapService.rebuildLayout(t.trip_id);
        }
      }

      audit(req, managerService, { action: 'SEAT_LAYOUT_UPDATE', resource: layoutId, before, after: { ...existing } });
      sendSuccess(res, existing);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  if (seatLayoutOne && req.method === 'DELETE') {
    const layoutId = decodeURIComponent(seatLayoutOne[1]);
    if (BUILTIN_LAYOUTS.some(b => b.layout_id === layoutId)) {
      sendError(res, 'Không thể xóa sơ đồ mặc định của hệ thống', 'LAYOUT_BUILTIN', 409);
      return true;
    }
    const operatorId = req.operatorId || DEFAULT_OPERATOR_ID;
    const index = (managerService.seatLayouts || []).findIndex(l => l.layout_id === layoutId && (l.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    if (index < 0) {
      sendError(res, 'Không tìm thấy sơ đồ ghế', 'LAYOUT_NOT_FOUND', 404);
      return true;
    }
    const using = managerService.vehicles.filter(v => (v.operator_id || DEFAULT_OPERATOR_ID) === operatorId && v.layout_id === layoutId);
    if (using.length > 0) {
      const plates = using.map(v => v.plate_number).join(', ');
      sendError(res, `Sơ đồ đang được sử dụng bởi các xe: ${plates}`, 'LAYOUT_IN_USE', 409, { plates: using.map(v => v.plate_number) });
      return true;
    }
    const before = managerService.seatLayouts[index];
    managerService.seatLayouts.splice(index, 1);
    audit(req, managerService, { action: 'SEAT_LAYOUT_DELETE', resource: layoutId, before, after: null });
    sendSuccess(res, { deleted: true, layout_id: layoutId });
    return true;
  }

  // GET /api/v1/ops/crew or /api/v1/ops/drivers (MGR-008, MGR-009, MGR-010)
  if (CREW_PATHS.includes(pathname) && req.method === 'GET') {
    const crew = managerService.getCrewDrivers(req.operatorId);
    sendSuccess(res, crew.data || crew);
    return true;
  }

  // GET /api/v1/ops/routes (MGR-011, MGR-012, MGR-013)
  if (pathname === '/api/v1/ops/routes' && req.method === 'GET') {
    const routes = managerService.getRoutes(req.operatorId);
    sendSuccess(res, routes.data || routes);
    return true;
  }

  // GET /api/v1/ops/dispatch/board or /api/v1/ops/dispatch/matrix or /api/v1/ops/trips (MGR-014, MGR-015, MGR-016)
  if ((pathname === '/api/v1/ops/dispatch/board' || pathname === '/api/v1/ops/dispatch/matrix' || pathname === '/api/v1/ops/trips') && req.method === 'GET') {
    // A day asked must be a real YYYY-MM-DD; none means today (Vietnam time).
    const asked = parsedUrl.searchParams.get('shift_date') || parsedUrl.searchParams.get('date');
    if (asked && !parseServiceDate(asked)) {
      sendError(res, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)', 'INVALID_DATE', 400);
      return true;
    }
    const dispatch = managerService.getDispatchBoard(asked || null, req.operatorId, { production: isProduction() });
    sendSuccess(res, dispatch.data || dispatch);
    return true;
  }

  // POST /api/v1/ops/pos/bookings or /api/v1/ops/pos/orders (MGR-019, MGR-020)
  if ((pathname === '/api/v1/ops/pos/bookings' || pathname === '/api/v1/ops/pos/orders') && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const home = officeHome(req, services, body.tripId || body.trip_id, body);
      if (!home.ok) {
        sendError(res, home.message, home.code, home.code === 'VALIDATION_ERROR' ? 400 : 422);
        return;
      }
      const result = managerService.createPosBooking({
        tripId: body.tripId || body.trip_id,
        passengerName: body.passengerName || body.passenger_name,
        phone: body.phone,
        seatCodes: body.seatCodes || body.seat_codes || [],
        paymentMethod: body.paymentMethod || body.payment_method || 'CASH_POS',
        agentStaffId: body.agentStaffId || 'stf_pos_01',
        reservationId: body.reservationId || body.reservation_id || null,
        pickupStopId: home.pickupStopId || body.pickupStopId || body.pickup_stop_id || null,
        dropoffStopId: body.dropoffStopId || body.dropoff_stop_id || null,
        homePickup: home.home,
        homeFeeVnd: home.fee,
        mockNow: body.now || Date.now(),
        operatorId: req.operatorId
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

  // GET /api/v1/ops/messages?trip_id= (D144): what went out to passengers by push or SMS, newest first
  if (pathname === '/api/v1/ops/messages' && req.method === 'GET') {
    const tripId = parsedUrl.searchParams.get('trip_id');
    sendSuccess(res, { messages: services.messenger.list(req.operatorId, { tripId }), sms_provider: Boolean(services.messenger.smsUrl), push_provider: services.messenger.pushReady });
    return true;
  }

  // POST /api/v1/ops/pos/hotline-hold (MGR-020 / REV-06)
  if (pathname === '/api/v1/ops/pos/hotline-hold' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const home = officeHome(req, services, body.tripId || body.trip_id, body);
      if (!home.ok) {
        sendError(res, home.message, home.code, home.code === 'VALIDATION_ERROR' ? 400 : 422);
        return;
      }
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
        pickupStopId: home.pickupStopId || body.pickupStopId || body.pickup_stop_id || null,
        dropoffStopId: body.dropoffStopId || body.dropoff_stop_id || null,
        homePickup: home.home,
        homeFeeVnd: home.fee,
        mockNow: body.now || Date.now(),
        operatorId: req.operatorId
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
        operatorId: req.operatorId,
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
      const rawMinutes = body?.delayMinutes !== undefined ? body.delayMinutes : body?.delay_minutes;
      if (typeof rawMinutes !== 'number' || !Number.isInteger(rawMinutes) || rawMinutes < 0 || rawMinutes > 600) {
        sendError(res, 'Số phút trễ là số nguyên từ 0 đến 600', 'VALIDATION_ERROR', 400);
        return;
      }
      const rawReason = body?.reason;
      if (rawReason !== undefined && rawReason !== null) {
        const trimmedReason = String(rawReason).trim();
        if (trimmedReason.length > 200) {
          sendError(res, 'Nội dung tối đa 200 ký tự', 'VALIDATION_ERROR', 400);
          return;
        }
      }
      const reason = (rawReason !== undefined && rawReason !== null && String(rawReason).trim()) ? String(rawReason).trim() : 'Kẹt xe đường bộ';
      const before = { delay_minutes: managerService.findTrip(tripId)?.delay_minutes ?? null };
      const result = managerService.broadcastTripDelay(tripId, rawMinutes, reason, req.operatorId);
      if (result.success) {
        audit(req, managerService, { action: 'TRIP_DELAY', resource: tripId, before, after: { delay_minutes: result.data.delay_minutes } });
        sendSuccess(res, result.data || result);
      } else {
        sendError(res, result.error, result.code, (result.code === "TRIP_NOT_FOUND" || result.code === "REFUND_NOT_FOUND") ? 404 : 400);
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
      const result = managerService.processRefundApproval(refundId, body.approved, body.notes, req.operatorId);
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
    const reports = managerService.getExecutiveReports({ startDate, endDate }, req.operatorId);
    sendSuccess(res, reports.data || reports);
    return true;
  }

  // GET /api/v1/ops/bookings (MGR-017)
  if (pathname === '/api/v1/ops/bookings' && req.method === 'GET') {
    sendSuccess(res, {
      total: managerService.bookings.filter(b => !req.operatorId || managerService.findTrip(b.trip_id)?.operator_id === req.operatorId).length,
      bookings: managerService.bookings.filter(b => !req.operatorId || managerService.findTrip(b.trip_id)?.operator_id === req.operatorId).map(b => visibleBooking(req, b))
    });
    return true;
  }

  // GET /api/v1/ops/bookings/:bookingId (MGR-018)
  if (/^\/api\/v1\/ops\/bookings\/[^/]+$/.test(pathname) && req.method === 'GET') {
    const bookingId = pathname.split('/')[5];
    const booking = managerService.bookings.find(b => b.pnr === bookingId && (!req.operatorId || managerService.findTrip(b.trip_id)?.operator_id === req.operatorId));
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
    const result = managerService.getSeatMatrix(tripId, Date.now(), req.operatorId);
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
      }, Date.now(), req.operatorId);
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
  // GET /api/v1/ops/trips/:tripId/assign-options and POST /api/v1/ops/trips/:tripId/assign (MGR-017)
  const assign = pathname.match(/^\/api\/v1\/ops\/trips\/([^/]+)\/(assign|assign-options)$/);
  if (assign && ((assign[2] === 'assign-options' && req.method === 'GET') || (assign[2] === 'assign' && req.method === 'POST'))) {
    const tripId = assign[1];
    const status = (code) => ({ TRIP_NOT_FOUND: 404, VEHICLE_NOT_FOUND: 404, DRIVER_NOT_FOUND: 404, VALIDATION_ERROR: 400 }[code] || 409);
    if (assign[2] === 'assign-options') {
      const result = managerService.getAssignOptions(tripId, req.operatorId);
      if (result.success) sendSuccess(res, result.data);
      else sendError(res, result.error, result.code, status(result.code));
      return true;
    }
    parseJsonBody(req).then(body => {
      const before = managerService.findTrip(tripId);
      const snapshot = before ? { vehicle_id: before.vehicle_id || null, driver_id: before.driver_id || null } : null;
      const result = managerService.assignTrip(tripId, { vehicleId: body.vehicleId || body.vehicle_id, driverId: body.driverId || body.driver_id, scope: body.scope || 'TRIP' }, req.operatorId);
      if (!result.success) {
        sendError(res, result.error, result.code, status(result.code), result.conflict_trip_id ? { conflict_trip_id: result.conflict_trip_id } : null);
        return;
      }
      audit(req, managerService, { action: 'TRIP_ASSIGN', resource: tripId, before: snapshot, after: { vehicle_id: result.data.vehicle_id, driver_id: result.data.driver_id, scope: result.data.scope } });
      sendSuccess(res, result.data);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/trips/:tripId/operations: stops with passenger counts, home pickups and the event log (spec 5.2, 5.3)
  const operations = pathname.match(/^\/api\/v1\/ops\/trips\/([^/]+)\/operations$/);
  if (operations && req.method === 'GET') {
    const tripId = operations[1];
    const result = tripVisibleTo(services, tripId, req.operatorId) ? services.driverService.getTripOperations(tripId) : null;
    if (!result || !result.success) {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
      return true;
    }
    sendSuccess(res, result.data);
    return true;
  }

  if (TRIP_DETAIL_RE.test(pathname) && req.method === 'GET') {
    const tripId = pathname.match(TRIP_DETAIL_RE)[1];
    const trip = managerService.findTrip(tripId);
    if (trip && (!req.operatorId || trip.operator_id === req.operatorId)) {
      sendSuccess(res, trip);
    } else {
      sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
    }
    return true;
  }

  // GET /api/v1/ops/alerts (MGR-025)
  if (pathname === '/api/v1/ops/alerts' && req.method === 'GET') {
    const alerts = req.operatorId ? managerService.alerts.filter(a => (a.operator_id || DEFAULT_OPERATOR_ID) === req.operatorId) : managerService.alerts;
    sendSuccess(res, { total: alerts.length, alerts });
    return true;
  }

  // GET /api/v1/ops/audit-logs (MGR-028)
  if (pathname === '/api/v1/ops/audit-logs' && req.method === 'GET') {
    sendSuccess(res, {
      total: managerService.auditLog.filter(a => (a.operator_id || DEFAULT_OPERATOR_ID) === req.operatorId).length,
      audit_logs: [...managerService.auditLog].filter(a => (a.operator_id || DEFAULT_OPERATOR_ID) === req.operatorId).reverse(),
      chain: managerService.verifyAuditChain(req.operatorId)
    });
    return true;
  }

  return false;
}
