/**
 * Webhook & Integration API Route Handlers (/api/v1/webhooks/...)
 */

import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';

export function handleWebhookRoutes(req, res, pathname, parsedUrl, services) {
  const { paymentService } = services;

  // POST /api/v1/webhooks/vietqr/ipn (PAX-014)
  if (pathname === '/api/v1/webhooks/vietqr/ipn' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const result = paymentService.handleVietQrCallback({
        transferMemo: body.transferMemo,
        amountVnd: body.amountVnd,
        bankRef: body.bankRef,
        now: body.now
      });

      if (result.success) {
        sendSuccess(res, {
          settled: true,
          pnr: result.pnr,
          issued_tickets: result.issued_tickets
        });
      } else {
        sendError(res, result.error, result.code, 400);
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
    const openapiSpec = {
      openapi: '3.0.3',
      info: {
        title: 'FleetBus Unified Platform API',
        version: '3.0.0',
        description: 'Universal REST API connecting Passenger Mobile, Driver Cockpit, and Manager Control Center.'
      },
      servers: [{ url: 'http://localhost:3000' }],
      paths: {
        '/api/v1/passenger/config': { get: { summary: 'App configuration & version handshake' } },
        '/api/v1/passenger/stations': { get: { summary: 'Search stations with diacritics support' } },
        '/api/v1/passenger/trips': { get: { summary: 'Search scheduled bus trips' } },
        '/api/v1/driver/auth/login': { post: { summary: 'Driver PIN authentication' } },
        '/api/v1/driver/trips/today': { get: { summary: 'Get today driver assigned trips' } },
        '/api/v1/ops/dashboard/kpis': { get: { summary: 'Operations executive KPI stream' } },
        '/api/v1/ops/radar': { get: { summary: 'Live fleet GPS radar coordinates' } },
        '/api/v1/webhooks/vietqr/ipn': { post: { summary: 'VietQR payment settlement webhook' } }
      }
    };
    sendSuccess(res, openapiSpec);
    return true;
  }

  return false;
}
