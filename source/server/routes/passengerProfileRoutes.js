/**
 * PAX-022 profile (D186): the passenger reads and edits their own name and photo. The phone number is the login
 * and is never edited here.
 */
import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

export function handlePassengerProfileRoutes(req, res, pathname, parsedUrl, services) {
  if (pathname !== '/api/v1/passenger/profile' || (req.method !== 'GET' && req.method !== 'PATCH')) return false;
  const { authService, paymentService } = services;
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const session = authService.getProfile(token);
  if (!session.success) {
    sendError(res, session.error, session.code, 401);
    return true;
  }
  const { phone, operator_id: operatorId } = session.data;
  const view = () => ({
    ...authService.sessions.get(token),
    ...authService.profileView(operatorId, phone),
    full_name: authService.sessions.get(token)?.full_name,
    wallet_balance_vnd: paymentService.getWalletBalance(phone, req.operatorId)
  });
  if (req.method === 'GET') {
    sendSuccess(res, view());
    return true;
  }
  parseJsonBody(req).then(body => {
    const result = authService.updateProfile(operatorId, phone, body || {});
    if (!result.ok) {
      sendError(res, result.message, result.code, result.status);
      return;
    }
    sendSuccess(res, view());
  }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
  return true;
}
