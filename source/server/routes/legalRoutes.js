/**
 * About and legal texts (SH-006, D157). Public and outside any bus company: the apps show them before login too.
 */
import { sendSuccess, sendError } from '../middleware/httpUtils.js';
import { LEGAL_APPS, legalContent } from '../core/legal.js';

export function handleLegalRoutes(req, res, pathname, parsedUrl) {
  if (pathname !== '/api/v1/legal' || req.method !== 'GET') return false;
  const content = legalContent(parsedUrl.searchParams.get('app'));
  if (!content) {
    sendError(res, `Tham số app phải là một trong: ${LEGAL_APPS.join(', ')}`, 'INVALID_APP', 400);
    return true;
  }
  sendSuccess(res, content);
  return true;
}
