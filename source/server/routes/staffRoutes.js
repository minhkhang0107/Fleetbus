/**
 * Staff Accounts Routes (B-10 / MGR-038)
 * FLEET_DIRECTOR manages office staff accounts.
 */
import { sendSuccess, sendError, parseJsonBody, clientIp } from '../middleware/httpUtils.js';
import { listStaff, createStaff, updateStaff, resetStaffPassword } from '../services/manager/modules/staffAccounts.js';

const STAFF_RESET_RE = /^\/api\/v1\/ops\/staff\/([^/]+)\/reset-password$/;
const STAFF_ONE_RE = /^\/api\/v1\/ops\/staff\/([^/]+)$/;

export function handleStaffRoutes(req, res, pathname, parsedUrl, services) {
  if (!pathname.startsWith('/api/v1/ops/staff')) return false;

  const { managerService } = services;
  const operatorId = req.operatorId;

  const audit = (action, resource, before, after) => managerService.recordAudit({
    actor: req.identity?.sub || 'anonymous',
    role: req.identity?.role || null,
    ip: clientIp(req, services.env),
    operator_id: operatorId,
    action,
    resource,
    before,
    after
  });

  const withBody = (fn) => parseJsonBody(req).then(fn).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));

  // GET /api/v1/ops/staff
  if (pathname === '/api/v1/ops/staff' && req.method === 'GET') {
    const result = listStaff(operatorId);
    sendSuccess(res, { staff: result.data });
    return true;
  }

  // POST /api/v1/ops/staff
  if (pathname === '/api/v1/ops/staff' && req.method === 'POST') {
    withBody(body => {
      const result = createStaff(operatorId, body);
      if (!result.ok) {
        sendError(res, result.message, result.code, result.status);
        return;
      }
      const { staff, temporary_password } = result.data;
      audit('STAFF_CREATE', staff.user_id, null, staff);
      sendSuccess(res, { staff, temporary_password }, 201);
    });
    return true;
  }

  // POST /api/v1/ops/staff/:userId/reset-password
  const resetMatch = pathname.match(STAFF_RESET_RE);
  if (resetMatch && req.method === 'POST') {
    const userId = decodeURIComponent(resetMatch[1]);
    const result = resetStaffPassword(operatorId, userId, req.identity?.sub, {
      loginGuard: managerService.loginGuard
    });
    if (!result.ok) {
      sendError(res, result.message, result.code, result.status);
      return true;
    }
    const { staff, temporary_password } = result.data;
    audit('STAFF_PASSWORD_RESET', staff.user_id, null, { user_id: staff.user_id, username: staff.username });
    sendSuccess(res, { staff, temporary_password });
    return true;
  }

  // PATCH /api/v1/ops/staff/:userId
  const oneMatch = pathname.match(STAFF_ONE_RE);
  if (oneMatch && req.method === 'PATCH') {
    const userId = decodeURIComponent(oneMatch[1]);
    withBody(body => {
      const result = updateStaff(operatorId, userId, req.identity?.sub, body);
      if (!result.ok) {
        sendError(res, result.message, result.code, result.status);
        return;
      }
      const { staff } = result.data;
      audit('STAFF_UPDATE', staff.user_id, result.before, staff);
      sendSuccess(res, { staff });
    });
    return true;
  }

  return false;
}
