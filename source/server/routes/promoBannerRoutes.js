/**
 * Promotion banners edited by the bus company's director on the operations page (D125).
 * Always the request's company only (its own database, D126); every change is written to the audit log.
 */
import { sendSuccess, sendError, parseJsonBody, clientIp } from '../middleware/httpUtils.js';
import { createBanner, deleteBanner, listOfficeBanners, setBannerActive, updateBanner } from '../core/promoBanners.js';

const ONE_RE = /^\/api\/v1\/ops\/promo-banners\/([^/]+)$/;
const ACTIVE_RE = /^\/api\/v1\/ops\/promo-banners\/([^/]+)\/(activate|deactivate)$/;

export function handlePromoBannerRoutes(req, res, pathname, parsedUrl, services) {
  if (!pathname.startsWith('/api/v1/ops/promo-banners')) return false;
  const { managerService } = services;
  const db = services.tenantDbs.forOperator(req.operatorId);

  const reply = (result, action, okStatus = 200) => {
    if (!result.ok) {
      sendError(res, result.message, result.code, result.status);
      return;
    }
    managerService.recordAudit({
      actor: req.identity?.sub || 'anonymous',
      role: req.identity?.role || null,
      ip: clientIp(req),
      operator_id: req.operatorId,
      action,
      resource: result.banner?.banner_id || result.before?.banner_id,
      before: result.before,
      after: result.banner || null
    });
    sendSuccess(res, result.banner || { deleted: true }, okStatus);
  };
  const withBody = (fn) => parseJsonBody(req).then(fn).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));

  if (pathname === '/api/v1/ops/promo-banners' && req.method === 'GET') {
    sendSuccess(res, { banners: listOfficeBanners(db) });
    return true;
  }
  if (pathname === '/api/v1/ops/promo-banners' && req.method === 'POST') {
    withBody(body => reply(createBanner(db, body), 'PROMO_BANNER_CREATE', 201));
    return true;
  }
  const one = pathname.match(ONE_RE);
  if (one && req.method === 'PATCH') {
    withBody(body => reply(updateBanner(db, decodeURIComponent(one[1]), body), 'PROMO_BANNER_UPDATE'));
    return true;
  }
  if (one && req.method === 'DELETE') {
    reply(deleteBanner(db, decodeURIComponent(one[1])), 'PROMO_BANNER_DELETE');
    return true;
  }
  const toggle = pathname.match(ACTIVE_RE);
  if (toggle && req.method === 'POST') {
    const active = toggle[2] === 'activate';
    reply(setBannerActive(db, decodeURIComponent(toggle[1]), active), active ? 'PROMO_BANNER_ACTIVATE' : 'PROMO_BANNER_DEACTIVATE');
    return true;
  }
  return false;
}
