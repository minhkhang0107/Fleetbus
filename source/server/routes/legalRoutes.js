/**
 * About and legal texts (SH-006, D157). Public and outside any bus company: the apps show them before login too.
 */
import { sendSuccess, sendError } from '../middleware/httpUtils.js';
import { LEGAL_APPS, legalContent } from '../core/legal.js';
import { publicBaseUrl } from '../core/messaging.js';

export function handleLegalRoutes(req, res, pathname, parsedUrl, services = {}) {
  if (pathname !== '/api/v1/legal' || req.method !== 'GET') return false;
  const app = parsedUrl.searchParams.get('app');
  const content = legalContent(app);
  if (!content) {
    sendError(res, `Tham số app phải là một trong: ${LEGAL_APPS.join(', ')}`, 'INVALID_APP', 400);
    return true;
  }
  const base = publicBaseUrl(services?.env || process.env);
  const urls = {
    terms: `${base}/legal/${app}/terms`,
    privacy: `${base}/legal/${app}/privacy`,
    account_deletion: app === 'passenger' ? `${base}/xoa-tai-khoan` : null
  };
  sendSuccess(res, { ...content, urls });
  return true;
}
