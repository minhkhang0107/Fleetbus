/**
 * Platform administration (spec 2.3): the platform admin creates, edits and (de)activates bus companies.
 * The gateway lets only PLATFORM_ADMIN tokens through and requires an Idempotency-Key on POSTs.
 */
import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';
import { createOperator, findOperatorByCode, findOperatorById, listOperators, setOperatorActive, updateOperator } from '../core/operators.js';

const OPERATOR_RE = /^\/api\/v1\/platform\/operators\/([^/]+)$/;
const ACTIVE_RE = /^\/api\/v1\/platform\/operators\/([^/]+)\/(activate|deactivate)$/;
const RESET_DIR_RE = /^\/api\/v1\/platform\/operators\/([^/]+)\/director\/reset-password$/;

function audit(req, managerService, entry) {
  managerService.recordAudit({
    actor: req.identity?.sub || 'anonymous',
    role: req.identity?.role || null,
    ip: req.socket?.remoteAddress || null,
    ...entry
  });
}

function reply(res, result, status = 200) {
  if (!result.ok) sendError(res, result.message, result.code, result.status);
  else sendSuccess(res, result.operator, status);
}

export function handlePlatformRoutes(req, res, pathname, parsedUrl, services) {
  if (!pathname.startsWith('/api/v1/platform/')) return false;
  const { managerService } = services;
  // Also checked by the gateway; repeated here so the routes stay closed when auth is switched off in development.
  if (req.identity?.role !== 'PLATFORM_ADMIN') {
    sendError(res, 'Chỉ quản trị nền tảng được dùng chức năng này', 'FORBIDDEN', 403);
    return true;
  }

  if (pathname === '/api/v1/platform/operators' && req.method === 'GET') {
    const operators = listOperators();
    sendSuccess(res, { total: operators.length, operators });
    return true;
  }

  if (pathname === '/api/v1/platform/operators' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = createOperator(body);
      if (result.ok) {
        audit(req, managerService, { action: 'OPERATOR_CREATE', resource: result.operator.code, after: result.operator, operator_id: result.operator.operator_id });
        sendSuccess(res, {
          ...result.operator,
          director: result.director,
          temporary_password: result.temporary_password
        }, 201);
      } else {
        sendError(res, result.message, result.code, result.status);
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  const resetDir = pathname.match(RESET_DIR_RE);
  if (resetDir && req.method === 'POST') {
    const op = findOperatorById(resetDir[1]) || findOperatorByCode(resetDir[1]);
    if (!op) {
      sendError(res, 'Không tìm thấy nhà xe', 'OPERATOR_NOT_FOUND', 404);
      return true;
    }
    const result = managerService.resetDirectorPassword(op.operator_id);
    if (result.success) {
      audit(req, managerService, { action: 'DIRECTOR_PASSWORD_RESET', resource: result.director.username, operator_id: op.operator_id });
      sendSuccess(res, { temporary_password: result.temporary_password });
    } else {
      sendError(res, result.error, result.code, result.status || 400);
    }
    return true;
  }

  const one = pathname.match(OPERATOR_RE);
  if (one && req.method === 'PATCH') {
    parseJsonBody(req).then(body => {
      const before = findOperatorById(one[1]);
      const snapshot = before ? { ...before, bank: { ...before.bank } } : null;
      const result = updateOperator(one[1], body);
      if (result.ok) audit(req, managerService, { action: 'OPERATOR_UPDATE', resource: result.operator.code, before: snapshot, after: result.operator, operator_id: result.operator.operator_id });
      reply(res, result);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  const toggle = pathname.match(ACTIVE_RE);
  if (toggle && req.method === 'POST') {
    const active = toggle[2] === 'activate';
    const result = setOperatorActive(toggle[1], active);
    if (result.ok) audit(req, managerService, { action: active ? 'OPERATOR_ACTIVATE' : 'OPERATOR_DEACTIVATE', resource: result.operator.code, operator_id: result.operator.operator_id });
    reply(res, result);
    return true;
  }

  sendError(res, 'Không tìm thấy chức năng', 'NOT_FOUND', 404);
  return true;
}
