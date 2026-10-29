/**
 * Office actions on what was sold (spec 3.4, 4.3, 8.4): review of home pickup / drop-off requests (D130) and
 * exceptions on one day's departure: stop or resume online sales, cancel it (D131). Every action is audited.
 */
import { sendSuccess, sendError, parseJsonBody, clientIp } from '../middleware/httpUtils.js';
import { listHomeRequests, reviewHomeRequest } from '../core/homeReview.js';
import { cancelTrip, setTripSales } from '../core/tripSales.js';

const REVIEW_RE = /^\/api\/v1\/ops\/home-requests\/([^/]+)\/([^/]+)\/(confirm|reject)$/;
const TRIP_RE = /^\/api\/v1\/ops\/trips\/([^/]+)\/(cancel|sales)$/;
const STATUSES = ['PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'WITHDRAWN', 'ALL'];

export function handleTripExceptionRoutes(req, res, pathname, parsedUrl, services) {
  const isReview = pathname.startsWith('/api/v1/ops/home-requests');
  const trip = pathname.match(TRIP_RE);
  if (!isReview && !trip) return false;
  const { managerService } = services;
  const actor = req.identity?.sub || 'anonymous';
  const audit = (action, resource, before, after) => managerService.recordAudit({
    actor, role: req.identity?.role || null, ip: clientIp(req), operator_id: req.operatorId, action, resource, before, after
  });
  const reply = (r, action, resource, body) => {
    if (!r.ok) {
      sendError(res, r.message, r.code, r.status);
      return;
    }
    audit(action, resource, r.before ?? null, body);
    sendSuccess(res, body);
  };

  // GET /api/v1/ops/home-requests?status=PENDING_REVIEW|CONFIRMED|REJECTED|WITHDRAWN|ALL
  if (pathname === '/api/v1/ops/home-requests' && req.method === 'GET') {
    const status = parsedUrl.searchParams.get('status') || 'PENDING_REVIEW';
    if (!STATUSES.includes(status)) {
      sendError(res, `Trạng thái phải là một trong ${STATUSES.join(', ')}`, 'VALIDATION_ERROR', 400);
      return true;
    }
    sendSuccess(res, listHomeRequests(services, req.operatorId, { status }));
    return true;
  }

  const review = pathname.match(REVIEW_RE);
  if (review && req.method === 'POST') {
    const [, orderId, side, verb] = review;
    if (side !== 'PICKUP' && side !== 'DROPOFF') {
      sendError(res, 'Chiều phải là PICKUP hoặc DROPOFF', 'VALIDATION_ERROR', 400);
      return true;
    }
    parseJsonBody(req).then(body => {
      const r = reviewHomeRequest(services, req.operatorId, decodeURIComponent(orderId), side, { approve: verb === 'confirm', reason: body.reason, actor });
      reply(r, verb === 'confirm' ? 'HOME_REQUEST_CONFIRM' : 'HOME_REQUEST_REJECT', `${orderId}:${side}`, r.ok ? { ...r.request, refund_id: r.refund?.refund_id || null } : null);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  if (trip && req.method === 'POST') {
    const tripId = decodeURIComponent(trip[1]);
    parseJsonBody(req).then(body => {
      if (trip[2] === 'cancel') {
        const r = cancelTrip(services, req.operatorId, tripId, { reason: body.reason, actor });
        reply(r, 'TRIP_CANCEL', tripId, r.ok ? r.result : null);
        return;
      }
      if (typeof body.open !== 'boolean') {
        sendError(res, 'Cần open: true (mở bán) hoặc false (ngừng bán)', 'VALIDATION_ERROR', 400);
        return;
      }
      const r = setTripSales(services, req.operatorId, tripId, { open: body.open, reason: body.reason, actor });
      reply(r, body.open ? 'TRIP_SALES_OPEN' : 'TRIP_SALES_CLOSE', tripId, r.ok ? r.trip : null);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  return false;
}
