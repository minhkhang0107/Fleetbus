/**
 * Active & background bank-transfer reconciliation for auto payment providers (e.g. SePay).
 */
import { DEFAULT_OPERATOR_ID, OPERATORS, findOperatorById, operatorPaymentConfig } from '../operators.js';
import { getProvider } from './providers.js';

const FIVE_MIN_MS = 5 * 60 * 1000;
const MAX_LOOKBACK_MS = 24 * 3600 * 1000;

function computeDefaultSince(paymentService, operatorId, now) {
  let oldestMs = Infinity;
  if (paymentService?.orders) {
    for (const order of paymentService.orders.values()) {
      if ((order.operator_id || DEFAULT_OPERATOR_ID) !== operatorId) continue;
      if (order.payment_status !== 'PENDING_PAYMENT') continue;
      const createdMs = Date.parse(order.created_at);
      if (Number.isFinite(createdMs) && createdMs < oldestMs) {
        oldestMs = createdMs;
      }
    }
  }
  const minAllowed = now - MAX_LOOKBACK_MS;
  if (!Number.isFinite(oldestMs)) return minAllowed;
  return Math.max(oldestMs - FIVE_MIN_MS, minAllowed);
}

/**
 * Reconciles pending bank transfers for one operator via its configured auto provider.
 * Never throws: errors are logged without secrets and stored on `credEntry.reconciliation.last_error`.
 */
export async function reconcileOperator(services, operatorId, { since, fetchImpl, now = Date.now() } = {}) {
  const operator = findOperatorById(operatorId);
  if (!operator || operator.active === false) {
    return { ok: false, skipped: true };
  }

  const paymentCfg = operatorPaymentConfig(operator);
  const provider = getProvider(paymentCfg.transfer_provider);
  const credEntry = services?.paymentService?.gatewayCredentials?.get(operatorId);

  if (
    !provider
    || !provider.auto
    || typeof provider.fetchTransactions !== 'function'
    || !credEntry
    || credEntry.provider !== provider.id
    || !credEntry.values
    || !credEntry.values.api_token
  ) {
    return { ok: false, skipped: true };
  }

  const effectiveFetch = fetchImpl || services?.fetchImpl || globalThis.fetch;

  const resolvedSince = since !== undefined && since !== null
    ? since
    : computeDefaultSince(services.paymentService, operatorId, now);

  try {
    const rawList = await provider.fetchTransactions({
      credentials: credEntry.values,
      operator,
      since: resolvedSince,
      fetchImpl: effectiveFetch
    });
    const items = Array.isArray(rawList) ? rawList : [];
    let settled = 0;

    for (const tx of items) {
      const res = services.paymentService.applyBankTransfer({
        ...tx,
        operatorId,
        provider: provider.id
      }, now);
      if (['SETTLED', 'OVERPAID_SETTLED', 'LATE_SETTLED'].includes(res.outcome) && !res.replay) {
        settled += 1;
      }
    }

    credEntry.reconciliation = {
      last_run_at: new Date(now).toISOString(),
      last_error: null
    };
    return { ok: true, fetched: items.length, settled };
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[reconcile] ${operator.code}: ${message}`);
    credEntry.reconciliation = {
      last_run_at: new Date(now).toISOString(),
      last_error: message
    };
    return { ok: false, error: message };
  }
}

/**
 * One background sweep tick: sequentially reconciles companies that use an auto provider
 * and have at least one PENDING_PAYMENT order (respecting 2 req/s rate limit), then flushes the store.
 */
export async function reconcileSweep(services, { now = Date.now(), fetchImpl, rateLimitDelayMs = 500 } = {}) {
  const { paymentService } = services || {};
  if (!paymentService) return;

  const pendingByOp = new Set();
  for (const order of paymentService.orders.values()) {
    if (order.payment_status === 'PENDING_PAYMENT') {
      pendingByOp.add(order.operator_id || DEFAULT_OPERATOR_ID);
    }
  }
  if (pendingByOp.size === 0) return;

  const targets = OPERATORS.filter(op => {
    if (!op || op.active === false || !pendingByOp.has(op.operator_id)) return false;
    const cfg = operatorPaymentConfig(op);
    const provider = getProvider(cfg.transfer_provider);
    const cred = paymentService.gatewayCredentials?.get(op.operator_id);
    return Boolean(provider?.auto && typeof provider.fetchTransactions === 'function' && cred?.values);
  });

  if (targets.length === 0) return;

  for (let i = 0; i < targets.length; i++) {
    if (i > 0 && rateLimitDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, rateLimitDelayMs));
    }
    await reconcileOperator(services, targets[i].operator_id, { now, fetchImpl });
  }

  try {
    services.store?.flush();
  } catch (err) {
    console.error(`[storage] ${err.message}`);
  }
}
