/**
 * Per-company payment methods & gateway credentials routes (MGR-038).
 * Non-secret settings live on `operator.service_config.payment`; secrets live in
 * `paymentService.gatewayCredentials` (sealed per-company in its tenant database) and are
 * always masked in API responses and audit logs.
 */
import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';
import { defaultServiceConfig, operatorPaymentConfig } from '../core/operators.js';
import { ALLOWED_PAYMENT_METHODS, getProvider, listProviders, maskCredentials, maskSecret } from '../core/payments/providers.js';

function requestOrigin(req) {
  const rawProto = req.headers['x-forwarded-proto'];
  const proto = typeof rawProto === 'string' && rawProto.trim()
    ? rawProto.split(',')[0].trim()
    : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${process.env.PORT || 3000}`;
  return `${proto}://${host}`;
}

function buildPaymentSettingsView(req, services) {
  const op = req.operator;
  const { methods, transfer_provider } = operatorPaymentConfig(op);
  const providerObj = getProvider(transfer_provider);
  const credEntry = services.paymentService.gatewayCredentials.get(op.operator_id);
  const activeValues = credEntry?.provider === transfer_provider ? (credEntry.values || {}) : {};
  const origin = requestOrigin(req);

  const reconciliationEnabled = Boolean(
    providerObj?.auto
    && typeof providerObj.fetchTransactions === 'function'
    && activeValues?.api_token
  );

  return {
    methods,
    transfer_provider,
    providers: listProviders(),
    credentials: maskCredentials(transfer_provider, activeValues),
    // Only a provider that calls us has a webhook address to paste into its dashboard.
    webhook_url: providerObj?.auto ? `${origin}/api/v1/webhooks/${transfer_provider.toLowerCase()}/${op.code}` : null,
    last_webhook_at: credEntry?.last_webhook_at || null,
    reconciliation: {
      enabled: reconciliationEnabled,
      last_run_at: credEntry?.reconciliation?.last_run_at || null,
      last_error: credEntry?.reconciliation?.last_error || null
    }
  };
}

function resolveCredentials(provider, incomingCredentials, existingEntry, currentProviderId) {
  const storedValues = existingEntry?.values || {};
  const hasIncoming = incomingCredentials !== undefined && incomingCredentials !== null;
  if (hasIncoming && (typeof incomingCredentials !== 'object' || Array.isArray(incomingCredentials))) {
    return { ok: false, message: 'Thông tin xác thực (credentials) không hợp lệ' };
  }

  const nextValues = {};
  for (const field of provider.credential_fields || []) {
    const rawIn = hasIncoming ? incomingCredentials[field.key] : undefined;
    const prevVal = storedValues[field.key];

    if (field.type === 'secret') {
      const maskedPrev = prevVal ? maskSecret(prevVal) : null;
      if (typeof rawIn === 'string' && rawIn.trim() !== '') {
        const trimmed = rawIn.trim();
        nextValues[field.key] = (maskedPrev && trimmed === maskedPrev) ? prevVal : trimmed;
      } else if (!hasIncoming && currentProviderId === provider.id && prevVal) {
        nextValues[field.key] = prevVal;
      } else if (!field.required && rawIn === undefined && prevVal) {
        nextValues[field.key] = prevVal;
      }
    } else {
      if (typeof rawIn === 'string' && rawIn.trim() !== '') {
        nextValues[field.key] = rawIn.trim();
      } else if (prevVal) {
        nextValues[field.key] = prevVal;
      } else if (field.options?.length) {
        nextValues[field.key] = field.options[0];
      }
      if (nextValues[field.key] !== undefined && field.options && !field.options.includes(nextValues[field.key])) {
        return { ok: false, message: `Giá trị ${field.key} không hợp lệ` };
      }
    }

    if (provider.auto && field.required && (!nextValues[field.key] || String(nextValues[field.key]).trim() === '')) {
      return { ok: false, message: `Thiếu thông tin xác thực bắt buộc: ${field.key}` };
    }
  }

  return { ok: true, values: nextValues };
}

export function handlePaymentSettingsRoutes(req, res, pathname, parsedUrl, services) {
  if (!pathname.startsWith('/api/v1/ops/payment-settings')) return false;

  const { paymentService, managerService } = services;

  // GET /api/v1/ops/payment-settings
  if (pathname === '/api/v1/ops/payment-settings' && req.method === 'GET') {
    if (req.identity && !['FLEET_DIRECTOR', 'FINANCIAL_CONTROLLER', 'PLATFORM_ADMIN'].includes(req.identity.role)) {
      sendError(res, 'Vai trò của bạn không được phép thực hiện thao tác này', 'FORBIDDEN', 403);
      return true;
    }
    sendSuccess(res, buildPaymentSettingsView(req, services));
    return true;
  }

  // PUT /api/v1/ops/payment-settings
  if (pathname === '/api/v1/ops/payment-settings' && req.method === 'PUT') {
    if (req.identity && !['FLEET_DIRECTOR', 'PLATFORM_ADMIN'].includes(req.identity.role)) {
      sendError(res, 'Vai trò của bạn không được phép thực hiện thao tác này', 'FORBIDDEN', 403);
      return true;
    }
    parseJsonBody(req).then(body => {
      const op = req.operator;
      if (!op.service_config) op.service_config = defaultServiceConfig();
      const currentCfg = operatorPaymentConfig(op);

      let methods = currentCfg.methods;
      if (body.methods !== undefined) {
        if (!Array.isArray(body.methods) || body.methods.length === 0) {
          sendError(res, 'Cần chọn ít nhất một phương thức thanh toán', 'VALIDATION_ERROR', 400);
          return;
        }
        const invalidMethod = body.methods.find(m => !ALLOWED_PAYMENT_METHODS.includes(m));
        if (invalidMethod !== undefined) {
          sendError(res, 'Phương thức thanh toán chỉ gồm BANK_TRANSFER và CASH', 'VALIDATION_ERROR', 400);
          return;
        }
        methods = [...new Set(body.methods)];
      }

      if (methods.includes('BANK_TRANSFER') && (!op.bank?.bin || !op.bank?.account_number)) {
        sendError(res, 'Nhà xe cần có tài khoản ngân hàng trước khi bật thanh toán chuyển khoản', 'VALIDATION_ERROR', 400);
        return;
      }

      const rawProvider = body.transfer_provider !== undefined
        ? String(body.transfer_provider || '').trim().toUpperCase()
        : currentCfg.transfer_provider;
      const provider = getProvider(rawProvider);
      if (!provider) {
        sendError(res, 'Cổng thanh toán không tồn tại', 'VALIDATION_ERROR', 400);
        return;
      }

      const existingCred = paymentService.gatewayCredentials.get(op.operator_id);
      const credCheck = resolveCredentials(provider, body.credentials, existingCred, currentCfg.transfer_provider);
      if (!credCheck.ok) {
        sendError(res, credCheck.message, 'VALIDATION_ERROR', 400);
        return;
      }

      const beforeAudit = {
        methods: [...currentCfg.methods],
        transfer_provider: currentCfg.transfer_provider,
        credentials: maskCredentials(existingCred?.provider || currentCfg.transfer_provider, existingCred?.values)
      };

      op.service_config.payment = {
        methods,
        transfer_provider: provider.id
      };
      op.service_config.allow_cash_payment = methods.includes('CASH');

      const nextValues = provider.credential_fields.length > 0 ? credCheck.values : (existingCred?.values || {});
      if (provider.credential_fields.length > 0 || existingCred) {
        paymentService.gatewayCredentials.set(op.operator_id, {
          provider: provider.id,
          values: nextValues,
          updated_at: new Date().toISOString(),
          updated_by: req.identity?.sub || null,
          last_webhook_at: existingCred?.last_webhook_at || null,
          reconciliation: existingCred?.reconciliation || { last_run_at: null, last_error: null }
        });
      }

      const afterAudit = {
        methods: [...methods],
        transfer_provider: provider.id,
        credentials: maskCredentials(provider.id, nextValues)
      };

      managerService.recordAudit({
        actor: req.identity?.sub || 'anonymous',
        role: req.identity?.role || null,
        ip: req.socket?.remoteAddress || null,
        operator_id: op.operator_id,
        action: 'PAYMENT_SETTINGS_UPDATE',
        resource: op.code,
        before: beforeAudit,
        after: afterAudit
      });

      sendSuccess(res, buildPaymentSettingsView(req, services));
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // POST /api/v1/ops/payment-settings/test
  if (pathname === '/api/v1/ops/payment-settings/test' && req.method === 'POST') {
    if (req.identity && !['FLEET_DIRECTOR', 'PLATFORM_ADMIN'].includes(req.identity.role)) {
      sendError(res, 'Vai trò của bạn không được phép thực hiện thao tác này', 'FORBIDDEN', 403);
      return true;
    }
    parseJsonBody(req).then(async body => {
      const op = req.operator;
      const currentCfg = operatorPaymentConfig(op);
      const existingCred = paymentService.gatewayCredentials.get(op.operator_id);
      const providerId = body?.transfer_provider
        ? String(body.transfer_provider).trim().toUpperCase()
        : (currentCfg.transfer_provider !== 'MANUAL' ? currentCfg.transfer_provider : (existingCred?.provider || 'SEPAY'));
      const provider = getProvider(providerId);
      if (!provider) {
        sendError(res, 'Cổng thanh toán không tồn tại', 'VALIDATION_ERROR', 400);
        return;
      }
      if (typeof provider.testConnection !== 'function') {
        sendSuccess(res, { ok: true, message: 'Chế độ thủ công không cần kiểm tra kết nối' });
        return;
      }

      const mergedValues = { ...(existingCred?.values || {}) };
      if (body?.credentials && typeof body.credentials === 'object') {
        for (const [k, v] of Object.entries(body.credentials)) {
          if (typeof v === 'string' && v.trim() !== '') {
            const prev = mergedValues[k];
            if (!prev || v.trim() !== maskSecret(prev)) {
              mergedValues[k] = v.trim();
            }
          }
        }
      }

      const result = await provider.testConnection({
        credentials: mergedValues,
        operator: op,
        fetchImpl: services.fetchImpl || globalThis.fetch
      });
      sendSuccess(res, result);
    }).catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  return false;
}
