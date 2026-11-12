/**
 * Pluggable bank-transfer payment provider registry.
 * Adding a new payment provider later requires only one new file in `source/server/core/payments/`
 * and one line in `PROVIDER_LIST` below.
 */
import { SEPAY_PROVIDER } from './sepay.js';

export const MANUAL_PROVIDER = {
  id: 'MANUAL',
  label: 'Thu ngân xác nhận thủ công',
  auto: false,
  credential_fields: [],
  verifyWebhook: () => false,
  normalize: () => []
};

const PROVIDER_LIST = [
  MANUAL_PROVIDER,
  SEPAY_PROVIDER
];

const PROVIDERS = new Map(PROVIDER_LIST.map(p => [p.id, p]));

export const ALLOWED_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH'];

export function getProvider(id) {
  if (!id || typeof id !== 'string') return null;
  return PROVIDERS.get(id.trim().toUpperCase()) || null;
}

export function listProviders() {
  return PROVIDER_LIST.map(({ id, label, auto, credential_fields }) => ({
    id,
    label,
    auto: Boolean(auto),
    credential_fields: (credential_fields || []).map(f => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: Boolean(f.required),
      ...(f.options ? { options: [...f.options] } : {})
    }))
  }));
}

/** Masks a secret string as '••••' + last 4 chars; never returns the raw value. */
export function maskSecret(value) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value);
  return `••••${str.slice(-4)}`;
}

/** Masks all secret credential fields for safe API responses and audit logs. */
export function maskCredentials(providerId, values = {}) {
  if (!values || typeof values !== 'object') return {};
  const provider = getProvider(providerId);
  const fields = provider?.credential_fields || [];
  const masked = {};
  for (const [key, val] of Object.entries(values)) {
    if (val === undefined || val === null || val === '') continue;
    const field = fields.find(f => f.key === key);
    if (field && field.type !== 'secret') {
      masked[key] = val;
    } else {
      masked[key] = maskSecret(val);
    }
  }
  return masked;
}
