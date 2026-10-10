/**
 * Pickup / drop-off service configuration of a bus company (spec 3): public read and area check for the
 * passenger app, editing for the company's office under /api/v1/ops. Always the request's company only.
 */
import crypto from 'crypto';
import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';
import { defaultServiceConfig } from '../core/operators.js';
import { checkHomeService, publicServiceConfig, validateArea, validateModes } from '../core/serviceAreas.js';
import { tripVisibleTo } from '../core/tenancy.js';

const AREA_RE = /^\/api\/v1\/ops\/service-areas\/([^/]+)$/;
const AREA_ACTIVE_RE = /^\/api\/v1\/ops\/service-areas\/([^/]+)\/(activate|deactivate)$/;

function configOf(req) {
  if (!req.operator.service_config) req.operator.service_config = defaultServiceConfig();
  return req.operator.service_config;
}

function audit(req, managerService, entry) {
  managerService.recordAudit({
    actor: req.identity?.sub || 'anonymous',
    role: req.identity?.role || null,
    ip: req.socket?.remoteAddress || null,
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
    service_hours: pick('service_hours')
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
      if (body.trip_id) {
        if (!tripVisibleTo(services, body.trip_id, req.operatorId)) {
          sendError(res, 'Không tìm thấy chuyến xe', 'TRIP_NOT_FOUND', 404);
          return;
        }
        departureTime = searchService.getTripDetail(body.trip_id, req.operatorId)?.data?.departure_time || null;
      }
      const result = checkHomeService(configOf(req), { kind, lat: Number(body.lat), lng: Number(body.lng), departureTime });
      if (!result.ok) {
        sendError(res, result.message, result.code, result.code === 'VALIDATION_ERROR' ? 400 : 422);
        return;
      }
      sendSuccess(res, { serviceable: true, area_id: result.area.area_id, area_name: result.area.name, fee_vnd: result.fee_vnd });
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  if (!pathname.startsWith('/api/v1/ops/service-')) return false;

  if (pathname === '/api/v1/ops/service-config' && req.method === 'GET') {
    sendSuccess(res, snapshot(configOf(req)));
    return true;
  }

  if (pathname === '/api/v1/ops/service-config' && req.method === 'PUT') {
    parseJsonBody(req).then(body => {
      const config = configOf(req);
      const next = {
        pickup_modes: body.pickup_modes ?? config.pickup_modes,
        dropoff_modes: body.dropoff_modes ?? config.dropoff_modes,
        allow_home_to_home: body.allow_home_to_home ?? config.allow_home_to_home,
        approaching_threshold_minutes: body.approaching_threshold_minutes ?? config.approaching_threshold_minutes
      };
      const error = validateModes(next);
      if (error) {
        sendError(res, error, 'VALIDATION_ERROR', 400);
        return;
      }
      if (!Number.isInteger(next.approaching_threshold_minutes) || next.approaching_threshold_minutes < 1 || next.approaching_threshold_minutes > 120) {
        sendError(res, 'Ngưỡng báo xe sắp tới là 1-120 phút', 'VALIDATION_ERROR', 400);
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
