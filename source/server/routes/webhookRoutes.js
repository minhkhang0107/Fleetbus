/**
 * Webhook & Integration API Route Handlers (/api/v1/webhooks/...)
 */

import crypto from 'crypto';
import { sendJson, sendSuccess, sendError, readRawBody, parseJson } from '../middleware/httpUtils.js';
import { API_CATALOG } from '../core/apiCatalog.js';
import { findOperatorByCode, operatorPaymentConfig, DEFAULT_OPERATOR_ID } from '../core/operators.js';
import { getProvider } from '../core/payments/providers.js';
import { isProduction } from '../config.js';

function signatureMatches(secret, rawBody, provided) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function handleWebhookRoutes(req, res, pathname, parsedUrl, services) {
  const { paymentService } = services;

  // POST /api/v1/webhooks/sepay/:operatorCode
  const sepayMatch = pathname.match(/^\/api\/v1\/webhooks\/sepay\/([^/]+)$/);
  if (sepayMatch && req.method === 'POST') {
    const op = findOperatorByCode(sepayMatch[1]);
    if (!op) {
      sendError(res, 'Không tìm thấy nhà xe', 'OPERATOR_NOT_FOUND', 404);
      return true;
    }

    const paymentCfg = operatorPaymentConfig(op);
    const credEntry = paymentService.gatewayCredentials.get(op.operator_id);
    const provider = getProvider('SEPAY');
    if (
      paymentCfg.transfer_provider !== 'SEPAY'
      || !credEntry
      || credEntry.provider !== 'SEPAY'
      || !credEntry.values?.webhook_secret
    ) {
      sendJson(res, 401, { success: false });
      return true;
    }

    readRawBody(req).then(raw => {
      let body = {};
      try {
        body = parseJson(raw);
      } catch {
        sendJson(res, 400, { success: false });
        return;
      }

      const now = !isProduction() && body?.now ? Number(body.now) : Date.now();
      const verified = provider.verifyWebhook({
        headers: req.headers,
        rawBody: raw,
        credentials: credEntry.values,
        now
      });
      if (!verified) {
        sendJson(res, 401, { success: false });
        return;
      }

      credEntry.last_webhook_at = new Date(now).toISOString();
      const txs = provider.normalize(body, op);
      for (const tx of txs) {
        paymentService.applyBankTransfer({
          ...tx,
          operatorId: op.operator_id,
          provider: 'SEPAY'
        }, now);
      }
      sendJson(res, 200, { success: true });
    }).catch(() => sendJson(res, 400, { success: false }));
    return true;
  }

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
    } else if (isProduction()) {
      sendError(res, 'Webhook cần mã nhà xe: /api/v1/webhooks/vietqr/{mã nhà xe}/ipn', 'OPERATOR_REQUIRED', 400);
      return true;
    }

    readRawBody(req).then(raw => {
      const secret = services.config?.webhookSecret;
      if (secret && !signatureMatches(secret, raw, req.headers['x-signature'])) {
        sendError(res, 'Chữ ký webhook không hợp lệ', 'INVALID_SIGNATURE', 401);
        return;
      }

      const body = parseJson(raw);
      const now = !isProduction() && body.now ? body.now : Date.now();
      const result = paymentService.handleVietQrCallback({
        transferMemo: body.transferMemo ?? body.memo,
        amountVnd: body.amountVnd ?? body.amount_vnd,
        bankRef: body.bankRef ?? body.bank_ref,
        providerTxId: body.providerTxId ?? body.provider_tx_id,
        accountNumber: body.accountNumber ?? body.account_number ?? null,
        occurredAt: body.occurredAt ?? body.occurred_at ?? null,
        direction: body.direction ?? 'IN',
        now,
        operatorId
      });

      if (result.settled === false) {
        // Acknowledge receipt with HTTP 200 so the bank does not retry; office handles anomalies/refunds.
        sendSuccess(res, { settled: false, status: result.status, pnr: result.pnr || null });
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
