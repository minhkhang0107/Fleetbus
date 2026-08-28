/**
 * FleetBus Server HTTP Utilities & Middlewares
 */

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Version, X-Device-Id, X-Signature');
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

export async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Safeguard against large payloads (> 1MB)
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', err => reject(err));
  });
}
