/**
 * Webhook & Integration API Route Handlers (/api/v1/webhooks/...)
 */

import crypto from 'crypto';
import { sendSuccess, sendError, readRawBody, parseJson } from '../middleware/httpUtils.js';
import { API_CATALOG } from '../core/apiCatalog.js';
import { findOperatorByCode, DEFAULT_OPERATOR_ID } from '../core/operators.js';

function signatureMatches(secret, rawBody, provided) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function handleWebhookRoutes(req, res, pathname, parsedUrl, services) {
  const { paymentService } = services;

  // POST /api/v1/webhooks/vietqr/ipn (PAX-014) or POST /api/v1/webhooks/vietqr/:operatorCode/ipn
  const webhookRegex = /^\/api\/v1\/webhooks\/vietqr(?:\/([^/]+))?\/ipn$/;
  const match = pathname.match(webhookRegex);
  if (match && req.method === 'POST') {
    let operatorId = DEFAULT_OPERATOR_ID;
    const operatorCode = match[1];
    if (operatorCode) {
      const op = findOperatorByCode(operatorCode);
      if (!op) {
        sendError(res, 'Không tìm thấy nhà xe', 'OPERATOR_NOT_FOUND', 404);
        return true;
      }
      operatorId = op.operator_id;
    }

    readRawBody(req).then(raw => {
      const secret = services.config?.webhookSecret;
      if (secret && !signatureMatches(secret, raw, req.headers['x-signature'])) {
        sendError(res, 'Chữ ký webhook không hợp lệ', 'INVALID_SIGNATURE', 401);
        return;
      }

      const body = parseJson(raw);
      const result = paymentService.handleVietQrCallback({
        transferMemo: body.transferMemo,
        amountVnd: body.amountVnd,
        bankRef: body.bankRef,
        now: body.now,
        operatorId
      });

      if (!result.success) {
        sendError(res, result.error, result.code, 400);
      } else if (result.settled === false) {
        // Acknowledge receipt so the bank does not retry; the manager sees a refund request.
        sendSuccess(res, { settled: false, status: result.status, pnr: result.pnr });
      } else {
        sendSuccess(res, {
          settled: true,
          pnr: result.pnr,
          issued_tickets: result.issued_tickets
        });
      }
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // GET /health
  if (pathname === '/health' && req.method === 'GET') {
    sendSuccess(res, {
      status: 'UP',
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage(),
      services: {
        passenger_service: 'HEALTHY',
        driver_cockpit_service: 'HEALTHY',
        manager_operations_service: 'HEALTHY',
        vietqr_payment_engine: 'HEALTHY',
        radar_telemetry_hub: 'HEALTHY'
      }
    });
    return true;
  }

  // GET /api/v1/openapi.json
  if ((pathname === '/api/v1/openapi.json' || pathname === '/openapi.json') && req.method === 'GET') {
    const paths = {};
    for (const { method, path, screen, summary } of API_CATALOG) {
      paths[path] = { ...paths[path], [method.toLowerCase()]: { summary, ...(screen ? { 'x-screen': screen } : {}) } };
    }
    const openapiSpec = {
      openapi: '3.0.3',
      info: {
        title: 'FleetBus Unified Platform API',
        version: '3.0.0',
        description: 'Universal REST API connecting Passenger Mobile, Driver Cockpit, and Manager Control Center.'
      },
      servers: [{ url: 'http://localhost:3000' }],
      paths
    };
    sendSuccess(res, openapiSpec);
    return true;
  }

  return false;
}
