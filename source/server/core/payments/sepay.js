/**
 * SePay payment gateway provider (developer.sepay.vn).
 * Supports webhook verification (API Key or HMAC-SHA256), payload normalization,
 * transaction polling for reconciliation, and connection testing.
 */
import crypto from 'node:crypto';

const VN_OFFSET_MS = 7 * 3600 * 1000;
const VN_DATETIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const lower = name.toLowerCase();
  if (headers[lower] !== undefined) return headers[lower];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Parses SePay 'YYYY-MM-DD HH:mm:ss' (Vietnam time, UTC+7) into an ISO-8601 +07:00 timestamp. */
export function parseSePayDate(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const m = trimmed.match(VN_DATETIME_RE);
  if (m) {
    return `${m[1]}T${m[2]}+07:00`;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Formats an instant (epoch ms or ISO string) as 'YYYY-MM-DD HH:mm:ss' in Vietnam time (+07:00). */
export function formatSePayDate(since) {
  if (typeof since === 'string' && VN_DATETIME_RE.test(since.trim())) {
    return since.trim();
  }
  const ms = typeof since === 'number' ? since : Date.parse(since);
  if (!Number.isFinite(ms)) return null;
  const vnIso = new Date(ms + VN_OFFSET_MS).toISOString();
  return `${vnIso.slice(0, 10)} ${vnIso.slice(11, 19)}`;
}

export function verifySePayWebhook({ headers = {}, rawBody = '', credentials = {}, now = Date.now() } = {}) {
  if (!credentials || typeof credentials !== 'object') return false;
  const secret = typeof credentials.webhook_secret === 'string' ? credentials.webhook_secret.trim() : '';
  if (!secret) return false;

  const authMode = credentials.webhook_auth || 'API_KEY';

  if (authMode === 'API_KEY') {
    const authHeader = getHeader(headers, 'authorization');
    if (typeof authHeader !== 'string') return false;
    const match = authHeader.trim().match(/^Apikey\s+(.+)$/i);
    if (!match) return false;
    return safeEqual(secret, match[1].trim());
  }

  if (authMode === 'HMAC') {
    const sigHeader = getHeader(headers, 'x-sepay-signature');
    const tsHeader = getHeader(headers, 'x-sepay-timestamp');
    if (typeof sigHeader !== 'string' || (typeof tsHeader !== 'string' && typeof tsHeader !== 'number')) {
      return false;
    }
    const tsStr = String(tsHeader).trim();
    if (!/^\d+$/.test(tsStr)) return false;
    const tsSec = Number(tsStr);
    const nowSec = now > 1e11 ? now / 1000 : now;
    if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > 300) {
      return false;
    }
    const sigTrimmed = sigHeader.trim();
    if (!sigTrimmed.toLowerCase().startsWith('sha256=')) return false;
    const providedHex = sigTrimmed.slice(7).toLowerCase();
    const bodyStr = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8');
    const expectedHex = crypto.createHmac('sha256', secret).update(`${tsStr}.${bodyStr}`).digest('hex');
    return safeEqual(expectedHex, providedHex);
  }

  return false;
}

function normalizeSingle(item, operator) {
  if (!item || typeof item !== 'object') return [];

  let direction = 'OUT';
  let amountVnd = NaN;

  if (item.transferType !== undefined || item.transferAmount !== undefined) {
    direction = String(item.transferType || '').toLowerCase() === 'in' ? 'IN' : 'OUT';
    amountVnd = Math.round(Number(item.transferAmount));
  } else if (item.amount_in !== undefined) {
    amountVnd = Math.round(Number.parseFloat(String(item.amount_in)));
    direction = 'IN';
  } else {
    return [];
  }

  if (!Number.isInteger(amountVnd) || amountVnd <= 0) {
    return [];
  }

  const rawRef = item.referenceCode ?? item.reference_number ?? null;
  const bankRef = rawRef !== null && rawRef !== undefined && String(rawRef).trim() !== ''
    ? String(rawRef).trim()
    : null;
  const memo = String(item.content || item.transaction_content || item.description || '');
  const accountNumber = item.accountNumber ?? item.account_number ?? null;
  const occurredAt = parseSePayDate(item.transactionDate ?? item.transaction_date);

  return [{
    operatorId: operator?.operator_id || null,
    provider: 'SEPAY',
    providerTxId: item.id !== undefined && item.id !== null ? String(item.id) : null,
    bankRef,
    amountVnd,
    memo,
    accountNumber,
    occurredAt,
    direction
  }];
}

export function normalizeSePayPayload(body, operator) {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body)) {
    return body.flatMap(item => normalizeSingle(item, operator));
  }
  if (Array.isArray(body.transactions)) {
    return body.transactions.flatMap(item => normalizeSingle(item, operator));
  }
  return normalizeSingle(body, operator);
}

export async function fetchSePayTransactions({ credentials = {}, operator = null, since = null, fetchImpl = fetch } = {}) {
  const url = new URL('https://my.sepay.vn/userapi/transactions/list');
  if (operator?.bank?.account_number) {
    url.searchParams.set('account_number', String(operator.bank.account_number));
  }
  if (since !== undefined && since !== null) {
    const minDate = formatSePayDate(since);
    if (minDate) url.searchParams.set('transaction_date_min', minDate);
  }
  url.searchParams.set('limit', '100');

  const apiToken = typeof credentials?.api_token === 'string' ? credentials.api_token.trim() : '';
  const res = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('API token không đúng');
    if (res.status === 429) throw new Error('Vượt giới hạn tần suất SePay API (429)');
    throw new Error(`SePay API lỗi HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data?.error) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Lỗi từ SePay API');
  }

  const items = Array.isArray(data?.transactions) ? data.transactions : [];
  return items.flatMap(item => normalizeSingle(item, operator)).filter(tx => tx.direction === 'IN');
}

export async function testSePayConnection({ credentials = {}, operator = null, fetchImpl = fetch } = {}) {
  const apiToken = typeof credentials?.api_token === 'string' ? credentials.api_token.trim() : '';
  if (!apiToken) {
    return { ok: false, message: 'Chưa nhập API token SePay' };
  }

  const url = new URL('https://my.sepay.vn/userapi/transactions/list');
  if (operator?.bank?.account_number) {
    url.searchParams.set('account_number', String(operator.bank.account_number));
  }
  url.searchParams.set('limit', '1');

  try {
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 401) {
      return { ok: false, message: 'API token không đúng' };
    }
    if (!res.ok) {
      return { ok: false, message: `SePay trả về mã lỗi HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    if (Number(data?.status) === 401) {
      return { ok: false, message: 'API token không đúng' };
    }
    if (data?.error) {
      return { ok: false, message: String(data.messages?.general || data.error) };
    }
    return { ok: true, message: 'Kết nối SePay thành công' };
  } catch (err) {
    return { ok: false, message: err?.message || 'Không thể kết nối tới SePay' };
  }
}

export const SEPAY_PROVIDER = {
  id: 'SEPAY',
  label: 'SePay (tự động)',
  auto: true,
  credential_fields: [
    { key: 'webhook_auth', label: 'Phương thức xác thực Webhook', type: 'select', options: ['API_KEY', 'HMAC'], required: true },
    { key: 'webhook_secret', label: 'Khóa xác thực Webhook (API Key / HMAC Secret)', type: 'secret', required: true },
    { key: 'api_token', label: 'API Token đối soát giao dịch', type: 'secret', required: false }
  ],
  verifyWebhook: verifySePayWebhook,
  normalize: normalizeSePayPayload,
  fetchTransactions: fetchSePayTransactions,
  testConnection: testSePayConnection
};
