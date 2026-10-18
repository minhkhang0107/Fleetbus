/**
 * Discount codes: the company's director creates and edits them on the operations page; the passenger app
 * checks one at checkout. Always the request's company only (its own database, D126); every office change
 * is written to the audit log.
 */
import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';
import { createVoucher, deleteVoucher, evaluateVoucher, listOfficeVouchers, setVoucherActive, updateVoucher } from '../core/vouchers.js';

const ONE_RE = /^\/api\/v1\/ops\/vouchers\/([^/]+)$/;
const ACTIVE_RE = /^\/api\/v1\/ops\/vouchers\/([^/]+)\/(activate|deactivate)$/;

export function handleVoucherRoutes(req, res, pathname, parsedUrl, services) {
  if (pathname === '/api/v1/passenger/vouchers/check' && req.method === 'POST') {
    handleCheck(req, res, services);
    return true;
  }
  if (!pathname.startsWith('/api/v1/ops/vouchers')) return false;
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
      ip: req.socket?.remoteAddress || null,
      operator_id: req.operatorId,
      action,
      resource: result.voucher?.code || result.before?.code,
      before: result.before,
      after: result.voucher || null
    });
    sendSuccess(res, result.voucher || { deleted: true }, okStatus);
  };
  const withBody = (fn) => parseJsonBody(req).then(fn).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));

  if (pathname === '/api/v1/ops/vouchers' && req.method === 'GET') {
    sendSuccess(res, { vouchers: listOfficeVouchers(db) });
    return true;
  }
  if (pathname === '/api/v1/ops/vouchers' && req.method === 'POST') {
    withBody(body => reply(createVoucher(db, body), 'VOUCHER_CREATE', 201));
    return true;
  }
  const one = pathname.match(ONE_RE);
  if (one && req.method === 'PATCH') {
    withBody(body => reply(updateVoucher(db, decodeURIComponent(one[1]), body), 'VOUCHER_UPDATE'));
    return true;
  }
  if (one && req.method === 'DELETE') {
    reply(deleteVoucher(db, decodeURIComponent(one[1])), 'VOUCHER_DELETE');
    return true;
  }
  const toggle = pathname.match(ACTIVE_RE);
  if (toggle && req.method === 'POST') {
    const active = toggle[2] === 'activate';
    reply(setVoucherActive(db, decodeURIComponent(toggle[1]), active), active ? 'VOUCHER_ACTIVATE' : 'VOUCHER_DEACTIVATE');
    return true;
  }
  return false;
}

/**
 * POST /api/v1/passenger/vouchers/check { code, subtotal_vnd }: what the code takes off this order, for the
 * checkout screen. The order is priced again on the server when it is created; this answer is a preview.
 */
function handleCheck(req, res, services) {
  parseJsonBody(req).then(body => {
    const subtotal = Number(body.subtotal_vnd);
    if (!body.code || !Number.isInteger(subtotal) || subtotal < 0) {
      sendError(res, 'Cần mã giảm giá và tiền vé (subtotal_vnd)', 'VALIDATION_ERROR', 400);
      return;
    }
    const db = services.tenantDbs.forOperator(req.operatorId);
    const r = evaluateVoucher(db, body.code, { subtotal, phone: req.identity?.phone || null });
    if (!r.ok) {
      sendError(res, r.message, r.code, r.status);
      return;
    }
    const v = r.voucher;
    sendSuccess(res, {
      code: v.code,
      description: v.description,
      discount_vnd: r.discount_vnd,
      ends_at: v.ends_at
    });
  }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
}
