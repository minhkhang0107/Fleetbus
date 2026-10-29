/**
 * Pickup / drop-off service configuration of a bus company (spec 3): public read and area check for the
 * passenger app, editing for the company's office under /api/v1/ops. Always the request's company only.
 */
import crypto from 'crypto';
import { sendSuccess, sendError, parseJsonBody, clientIp } from '../middleware/httpUtils.js';
import { defaultServiceConfig, updateOperatorContact } from '../core/operators.js';
import { STOP_STYLES, checkHomeService, publicServiceConfig, routeServiceConfig, validateArea, validateModes, validateRouteSettings } from '../core/serviceAreas.js';
import { tripVisibleTo } from '../core/tenancy.js';
import { validateRouteStops } from '../core/routeStops.js';
import { endpointChoices, publicFixedEndpoints, validateFixedEndpoints } from '../core/fixedEndpoints.js';
import { isProduction } from '../config.js';

const AREA_RE = /^\/api\/v1\/ops\/service-areas\/([^/]+)$/;
const AREA_ACTIVE_RE = /^\/api\/v1\/ops\/service-areas\/([^/]+)\/(activate|deactivate)$/;

function configOf(req) {
  if (!req.operator.service_config) req.operator.service_config = defaultServiceConfig();
  return req.operator.service_config;
}

function companyProfile(op) {
  return {
    operator: {
      operator_id: op.operator_id,
      code: op.code,
      name: op.name,
      short_name: op.short_name,
      hotline: op.hotline ?? null,
      support_email: op.support_email ?? null,
      address: op.address ?? null,
      primary_color: op.primary_color,
      bank: {
        bin: op.bank?.bin || '',
        bank_name: op.bank?.bank_name || '',
        account_number: op.bank?.account_number || '',
        account_name: op.bank?.account_name || ''
      },
      memo_prefix: op.memo_prefix
    },
    editable: ['hotline', 'support_email', 'address']
  };
}

function audit(req, managerService, entry) {
  managerService.recordAudit({
    actor: req.identity?.sub || 'anonymous',
    role: req.identity?.role || null,
    ip: clientIp(req),
    operator_id: req.operatorId,
    ...entry
  });
}

const snapshot = (value) => structuredClone(value);

/** The area fields the office may set; numbers arrive as JSON numbers. */
function areaFields(body, base = {}) {
  const pick = (key) => (body[key] === undefined ? base[key] : body[key]);
  return {
    name: typeof pick('name') === 'string' ? pick('name').trim() : pick('name'),
    kind: pick('kind'),
    polygon: pick('polygon'),
    fee_vnd: pick('fee_vnd'),
    lead_time_minutes: pick('lead_time_minutes'),
    service_hours: pick('service_hours'),
    confirmation: pick('confirmation') ?? 'AUTO'
  };
}

export function handleServiceConfigRoutes(req, res, pathname, parsedUrl, services) {
  const { managerService, searchService } = services;

  // GET /api/v1/service-config: what the passenger app offers for this company.
  if (pathname === '/api/v1/service-config' && req.method === 'GET') {
    sendSuccess(res, { operator_code: req.operator.code, ...publicServiceConfig(configOf(req)) });
    return true;
  }

  // POST /api/v1/service-areas/check: can this address be served at home (and for this trip)?
  if (pathname === '/api/v1/service-areas/check' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const kind = body.kind;
      if (kind !== 'PICKUP' && kind !== 'DROPOFF') {
        sendError(res, 'Loại phải là PICKUP hoặc DROPOFF', 'VALIDATION_ERROR', 400);
        return;
      }
      let departureTime = null;
      let config = configOf(req);
      if (body.trip_id) {
        if (!tripVisibleTo(services, body.trip_id, req.operatorId)) {
          sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
          return;
        }
        const trip = searchService.getTripDetail(body.trip_id, req.operatorId)?.data;
        departureTime = trip?.departure_time || null;
        // The trip's route may offer other modes than the company default.
        config = routeServiceConfig(config, trip?.route_id);
      }
      // Seed trips are dated 2026-08-28: outside production a past departure is checked as if booked the day before
      // (same rule as the order).
      const departureMs = departureTime ? new Date(departureTime).getTime() : NaN;
      const now = !isProduction() && departureMs < Date.now() ? departureMs - 24 * 3600000 : Date.now();
      const result = checkHomeService(config, { kind, lat: Number(body.lat), lng: Number(body.lng), departureTime, now });
      if (!result.ok) {
        sendError(res, result.message, result.code, result.code === 'VALIDATION_ERROR' ? 400 : 422);
        return;
      }
      // MANUAL: the address is accepted for review only; the app says so before the passenger pays (spec 4.4).
      sendSuccess(res, { serviceable: true, area_id: result.area.area_id, area_name: result.area.name, fee_vnd: result.fee_vnd, confirmation: result.confirmation });
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  if (!pathname.startsWith('/api/v1/ops/service-') && pathname !== '/api/v1/ops/company') return false;

  // GET /api/v1/ops/company: view company profile and contact info
  if (pathname === '/api/v1/ops/company' && req.method === 'GET') {
    sendSuccess(res, companyProfile(req.operator));
    return true;
  }

  // PATCH /api/v1/ops/company: update hotline, support_email, address
  if (pathname === '/api/v1/ops/company' && req.method === 'PATCH') {
    parseJsonBody(req).then(body => {
      const before = {
        hotline: req.operator.hotline ?? null,
        support_email: req.operator.support_email ?? null,
        address: req.operator.address ?? null
      };
      const result = updateOperatorContact(req.operator.operator_id, body);
      if (!result.ok) {
        sendError(res, result.message, result.code, result.status);
        return;
      }
      const after = {
        hotline: result.operator.hotline ?? null,
        support_email: result.operator.support_email ?? null,
        address: result.operator.address ?? null
      };
      audit(req, managerService, {
        action: 'OPERATOR_CONTACT_UPDATE',
        resource: req.operator.code,
        before,
        after
      });
      sendSuccess(res, companyProfile(result.operator));
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  if (pathname === '/api/v1/ops/service-config' && req.method === 'GET') {
    sendSuccess(res, snapshot(configOf(req)));
    return true;
  }

  // GET / PUT /api/v1/ops/service-config/endpoints: the fixed origin and destination of the passenger app (D135).
  if (pathname === '/api/v1/ops/service-config/endpoints' && (req.method === 'GET' || req.method === 'PUT')) {
    const view = () => ({
      fixed_endpoints: configOf(req).fixed_endpoints || null,
      resolved: publicFixedEndpoints(req.operatorId, configOf(req), (a, b) => searchService.servesCities(req.operatorId, a, b)),
      stations: endpointChoices(req.operatorId)
    });
    if (req.method === 'GET') {
      sendSuccess(res, view());
      return true;
    }
    parseJsonBody(req).then(body => {
      const value = body.fixed_endpoints === null ? null : {
        origin_station_id: body.origin_station_id ?? body.fixed_endpoints?.origin_station_id,
        destination_station_id: body.destination_station_id ?? body.fixed_endpoints?.destination_station_id,
        allow_swap: body.allow_swap ?? body.fixed_endpoints?.allow_swap ?? true
      };
      const error = validateFixedEndpoints(req.operatorId, value);
      if (error) {
        sendError(res, error, 'VALIDATION_ERROR', 400);
        return;
      }
      const config = configOf(req);
      const before = snapshot(config.fixed_endpoints || null);
      if (value) config.fixed_endpoints = value; else delete config.fixed_endpoints;
      audit(req, managerService, { action: 'FIXED_ENDPOINTS_UPDATE', resource: req.operator.code, before, after: snapshot(value) });
      sendSuccess(res, view());
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  if (pathname === '/api/v1/ops/service-config' && req.method === 'PUT') {
    parseJsonBody(req).then(body => {
      const config = configOf(req);
      const next = {
        pickup_modes: body.pickup_modes ?? config.pickup_modes,
        dropoff_modes: body.dropoff_modes ?? config.dropoff_modes,
        allow_home_to_home: body.allow_home_to_home ?? config.allow_home_to_home,
        approaching_threshold_minutes: body.approaching_threshold_minutes ?? config.approaching_threshold_minutes,
        home_wait_minutes: body.home_wait_minutes ?? config.home_wait_minutes ?? 5,
        stop_style: body.stop_style ?? config.stop_style ?? 'STATIONS',
        insurance_enabled: body.insurance_enabled !== undefined ? Boolean(body.insurance_enabled) : (config.insurance_enabled ?? false),
        wallet_enabled: body.wallet_enabled !== undefined ? Boolean(body.wallet_enabled) : (config.wallet_enabled ?? false)
      };
      if (!STOP_STYLES.includes(next.stop_style)) {
        sendError(res, 'Kiểu điểm đón phải là ROUTE_LINE hoặc STATIONS', 'VALIDATION_ERROR', 400);
        return;
      }
      const error = validateModes(next);
      if (error) {
        sendError(res, error, 'VALIDATION_ERROR', 400);
        return;
      }
      if (!Number.isInteger(next.approaching_threshold_minutes) || next.approaching_threshold_minutes < 1 || next.approaching_threshold_minutes > 120) {
        sendError(res, 'Ngưỡng báo xe sắp tới là 1-120 phút', 'VALIDATION_ERROR', 400);
        return;
      }
      if (!Number.isInteger(next.home_wait_minutes) || next.home_wait_minutes < 1 || next.home_wait_minutes > 30) {
        sendError(res, 'Thời gian xe chờ khách tại nhà là 1-30 phút', 'VALIDATION_ERROR', 400);
        return;
      }
      const before = snapshot(config);
      Object.assign(config, { ...next, pickup_modes: [...new Set(next.pickup_modes)], dropoff_modes: [...new Set(next.dropoff_modes)], allow_home_to_home: Boolean(next.allow_home_to_home) });
      audit(req, managerService, { action: 'SERVICE_CONFIG_UPDATE', resource: req.operator.code, before, after: snapshot(config) });
      sendSuccess(res, snapshot(config));
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  if (pathname === '/api/v1/ops/service-areas' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const area = areaFields(body);
      const error = validateArea(area);
      if (error) {
        sendError(res, error, 'VALIDATION_ERROR', 400);
        return;
      }
      const created = { area_id: `sa_${crypto.randomBytes(5).toString('hex')}`, ...area, active: true };
      configOf(req).service_areas.push(created);
      audit(req, managerService, { action: 'SERVICE_AREA_CREATE', resource: created.area_id, after: snapshot(created) });
      sendSuccess(res, snapshot(created), 201);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /api/v1/ops/service-config/routes: every route of the company with its own and effective settings.
  if (pathname === '/api/v1/ops/service-config/routes' && req.method === 'GET') {
    const config = configOf(req);
    const routes = managerService.getRoutes(req.operatorId).data;
    sendSuccess(res, {
      routes: routes.map(r => {
        const effective = routeServiceConfig(config, r.route_id);
        const base = searchService.templateForRoute(r.route_id, req.operatorId)?.stops || [];
        // base_* are the route's own stop data, what a checkbox goes back to when the company clears its setting.
        const stops = searchService.routeStops(r.route_id, req.operatorId).map(({ stop_id, name, kind, order, pickup_allowed, dropoff_allowed, hidden, offset_minutes, time_source }, i) => ({ stop_id, name, kind, order, pickup_allowed, dropoff_allowed, base_pickup: base[i]?.pickup_allowed !== false, base_dropoff: base[i]?.dropoff_allowed !== false, hidden, offset_minutes, time_source }));
        return { route_id: r.route_id, name: r.name, own: snapshot(config.route_configs?.[r.route_id] || {}), stop_style: effective.stop_style, pickup_modes: effective.pickup_modes, dropoff_modes: effective.dropoff_modes, stops };
      })
    });
    return true;
  }

  // PUT /api/v1/ops/service-config/routes/:routeId: a route's own stop style and modes (null = use the company's).
  const routeMatch = pathname.match(/^\/api\/v1\/ops\/service-config\/routes\/([^/]+)$/);
  if (routeMatch && req.method === 'PUT') {
    parseJsonBody(req).then(body => {
      const routeId = routeMatch[1];
      if (!managerService.routes.some(r => r.route_id === routeId && r.operator_id === req.operatorId)) {
        sendError(res, 'Không tìm thấy tuyến', 'ROUTE_NOT_FOUND', 404);
        return;
      }
      const error = validateRouteSettings(body);
      if (error) {
        sendError(res, error, 'VALIDATION_ERROR', 400);
        return;
      }
      const config = configOf(req);
      if (!config.route_configs) config.route_configs = {};
      const before = snapshot(config.route_configs[routeId] || {});
      const own = { ...before };
      for (const [key, value] of Object.entries(body)) {
        if (key === 'stops') continue;
        if (value === null) delete own[key];
        else own[key] = Array.isArray(value) ? [...new Set(value)] : value;
      }
      // Stop settings merge per stop and per field; null clears (back to the route's own stop data).
      if (body.stops !== undefined) {
        const stops = structuredClone(own.stops || {});
        for (const [stopId, set] of Object.entries(body.stops || {})) {
          if (set === null) { delete stops[stopId]; continue; }
          const merged = { ...(stops[stopId] || {}) };
          for (const [k, v] of Object.entries(set || {})) { if (v === null) delete merged[k]; else merged[k] = v; }
          if (Object.keys(merged).length) stops[stopId] = merged; else delete stops[stopId];
        }
        const template = searchService.templateForRoute(routeId, req.operatorId);
        const stopError = validateRouteStops(stops, template?.stops || []);
        if (stopError) {
          sendError(res, stopError, 'VALIDATION_ERROR', 400);
          return;
        }
        if (Object.keys(stops).length) own.stops = stops; else delete own.stops;
      }
      if (Object.keys(own).length) config.route_configs[routeId] = own;
      else delete config.route_configs[routeId];
      audit(req, managerService, { action: 'ROUTE_SERVICE_UPDATE', resource: routeId, before, after: snapshot(own) });
      const effective = routeServiceConfig(config, routeId);
      sendSuccess(res, { route_id: routeId, own, stop_style: effective.stop_style, pickup_modes: effective.pickup_modes, dropoff_modes: effective.dropoff_modes });
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  const findArea = (id) => configOf(req).service_areas.find(a => a.area_id === id);
  const notFound = () => sendError(res, 'Không tìm thấy vùng phục vụ', 'AREA_NOT_FOUND', 404);

  const one = pathname.match(AREA_RE);
  if (one && req.method === 'PATCH') {
    parseJsonBody(req).then(body => {
      const area = findArea(one[1]);
      if (!area) return notFound();
      const next = areaFields(body, area);
      const error = validateArea(next);
      if (error) {
        sendError(res, error, 'VALIDATION_ERROR', 400);
        return;
      }
      const before = snapshot(area);
      Object.assign(area, next);
      audit(req, managerService, { action: 'SERVICE_AREA_UPDATE', resource: area.area_id, before, after: snapshot(area) });
      sendSuccess(res, snapshot(area));
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  const toggle = pathname.match(AREA_ACTIVE_RE);
  if (toggle && req.method === 'POST') {
    const area = findArea(toggle[1]);
    if (!area) {
      notFound();
      return true;
    }
    const active = toggle[2] === 'activate';
    if (area.active !== active) {
      area.active = active;
      audit(req, managerService, { action: active ? 'SERVICE_AREA_ACTIVATE' : 'SERVICE_AREA_DEACTIVATE', resource: area.area_id });
    }
    sendSuccess(res, snapshot(area));
    return true;
  }

  return false;
}
