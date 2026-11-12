/**
 * FleetBus Server HTTP Utilities & Middlewares
 */
import { clientNow } from '../config.js';
import { clientIp } from '../core/rateLimit.js';

export { clientNow, clientIp };

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Version, X-Device-Id, X-Signature, X-Operator-Code');
}

export function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export function sendSuccess(res, data, statusCode = 200) {
  sendJson(res, statusCode, {
    status: 'success',
    timestamp: new Date().toISOString(),
    data
  });
}

export function sendError(res, message, code = 'ERROR', statusCode = 400, details = null) {
  sendJson(res, statusCode, {
    status: 'error',
    code,
    message,
    timestamp: new Date().toISOString(),
    ...(details ? { details } : {})
  });
}

/** No request of the apps carries more than a few kilobytes; 1 MB leaves room for the largest import. */
export const MAX_BODY_BYTES = 1024 * 1024;

export function readRawBody(req) {
  // The gateway may already have read the body (idempotency fingerprint)
  if (req.rawBody !== undefined) return Promise.resolve(req.rawBody);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      // Past the limit the rest is dropped as it arrives, so a huge upload cannot fill the memory.
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new Error('Dữ liệu gửi lên quá lớn'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', err => reject(err));
  });
}

export function parseJson(raw) {
  if (!raw.trim()) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Dữ liệu gửi lên không phải JSON hợp lệ');
  }
  // Every endpoint reads named fields: null, a list or a bare value would fail deep inside with a JS message.
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Dữ liệu gửi lên phải là một đối tượng JSON');
  }
  return value;
}

export async function parseJsonBody(req) {
  return parseJson(await readRawBody(req));
}
