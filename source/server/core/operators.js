// Bus companies on the platform. Mutable: the platform admin creates, edits and (de)activates them.
const SEED_CREATED_AT = '2026-10-01T00:00:00.000Z';

export const OPERATORS = [
  {
    operator_id: 'op_saomai',
    code: 'SAOMAI',
    name: 'Nhà xe Sao Mai',
    short_name: 'Sao Mai',
    hotline: '1900 6868',
    primary_color: '#2563EB',
    bank: { bin: '970415', bank_name: 'VietinBank', account_number: '1088219999', account_name: 'NHA XE SAO MAI' },
    memo_prefix: 'SAOMAI',
    default: true,
    active: true,
    created_at: SEED_CREATED_AT
  },
  {
    operator_id: 'op_xuyenviet',
    code: 'XUYENVIET',
    name: 'Xuyên Việt Lines',
    short_name: 'Xuyên Việt',
    hotline: '1900 2468',
    primary_color: '#0F766E',
    bank: { bin: '970436', bank_name: 'Vietcombank', account_number: '0071000123456', account_name: 'XUYEN VIET LINES' },
    memo_prefix: 'XUYENVIET',
    active: true,
    created_at: SEED_CREATED_AT
  }
];

export const DEFAULT_OPERATOR_ID = 'op_saomai';

export function normalizeOperatorCode(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.trim().toUpperCase();
}

export function findOperatorByCode(code) {
  const normalized = normalizeOperatorCode(code);
  if (!normalized) return null;
  return OPERATORS.find(op => op.code === normalized) || null;
}

export function findOperatorById(id) {
  if (!id) return null;
  return OPERATORS.find(op => op.operator_id === id) || null;
}

export function publicOperatorProfile(op) {
  if (!op) return null;
  return {
    operator_id: op.operator_id,
    code: op.code,
    name: op.name,
    short_name: op.short_name,
    hotline: op.hotline,
    primary_color: op.primary_color,
    onboarding_url: `/o/${op.code}`
  };
}

const CODE_RE = /^[A-Z0-9]{3,16}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const BANK_FIELDS = ['bin', 'bank_name', 'account_number', 'account_name'];

function invalid(message) {
  return { ok: false, status: 400, code: 'VALIDATION_ERROR', message };
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Checks the editable fields of an operator; returns an error result or null. */
function validateFields(fields) {
  if (!text(fields.name)) return invalid('Cần tên nhà xe');
  if (fields.primary_color !== undefined && !COLOR_RE.test(fields.primary_color)) return invalid('Màu chủ đạo phải có dạng #RRGGBB');
  const bank = fields.bank || {};
  for (const key of BANK_FIELDS) {
    if (!text(bank[key])) return invalid(`Thiếu thông tin tài khoản nhận tiền (${key})`);
  }
  if (!/^\d{6}$/.test(text(bank.bin))) return invalid('Mã BIN ngân hàng gồm 6 chữ số');
  if (!/^\d{6,19}$/.test(text(bank.account_number))) return invalid('Số tài khoản chỉ gồm 6-19 chữ số');
  if (fields.memo_prefix !== undefined && !CODE_RE.test(fields.memo_prefix)) return invalid('Tiền tố nội dung chuyển khoản gồm 3-16 ký tự A-Z, 0-9');
  return null;
}

function cleanBank(bank) {
  return Object.fromEntries(BANK_FIELDS.map(key => [key, text(bank[key])]));
}

export function listOperators() {
  return OPERATORS.map(op => ({ ...op, bank: { ...op.bank } }));
}

export function createOperator(input = {}, now = Date.now()) {
  const code = normalizeOperatorCode(input.code);
  if (!code || !CODE_RE.test(code)) return invalid('Mã nhà xe gồm 3-16 ký tự A-Z, 0-9');
  if (findOperatorByCode(code)) return { ok: false, status: 409, code: 'OPERATOR_CODE_TAKEN', message: 'Mã nhà xe đã được dùng' };
  const fields = { ...input, memo_prefix: input.memo_prefix === undefined ? code : normalizeOperatorCode(input.memo_prefix) };
  const error = validateFields(fields);
  if (error) return error;
  const op = {
    operator_id: `op_${code.toLowerCase()}`,
    code,
    name: text(fields.name),
    short_name: text(fields.short_name) || text(fields.name),
    hotline: text(fields.hotline) || null,
    primary_color: fields.primary_color || '#2563EB',
    bank: cleanBank(fields.bank),
    memo_prefix: fields.memo_prefix,
    active: true,
    created_at: new Date(now).toISOString()
  };
  OPERATORS.push(op);
  return { ok: true, operator: op };
}

/** Updates an operator; the code and id never change (they are in tokens, links and memos). */
export function updateOperator(id, patch = {}) {
  const op = findOperatorById(id);
  if (!op) return { ok: false, status: 404, code: 'OPERATOR_NOT_FOUND', message: 'Không tìm thấy nhà xe' };
  if (patch.code !== undefined && normalizeOperatorCode(patch.code) !== op.code) return invalid('Không đổi được mã nhà xe');
  const next = {
    name: patch.name ?? op.name,
    short_name: patch.short_name ?? op.short_name,
    hotline: patch.hotline ?? op.hotline,
    primary_color: patch.primary_color ?? op.primary_color,
    memo_prefix: patch.memo_prefix === undefined ? op.memo_prefix : normalizeOperatorCode(patch.memo_prefix),
    bank: { ...op.bank, ...(patch.bank || {}) }
  };
  const error = validateFields(next);
  if (error) return error;
  Object.assign(op, { ...next, name: text(next.name), short_name: text(next.short_name) || text(next.name), hotline: text(next.hotline) || null, bank: cleanBank(next.bank) });
  return { ok: true, operator: op };
}

export function setOperatorActive(id, active) {
  const op = findOperatorById(id);
  if (!op) return { ok: false, status: 404, code: 'OPERATOR_NOT_FOUND', message: 'Không tìm thấy nhà xe' };
  op.active = Boolean(active);
  return { ok: true, operator: op };
}

export const OPERATOR_INACTIVE = { ok: false, status: 403, code: 'OPERATOR_INACTIVE', message: 'Nhà xe đang tạm ngừng hoạt động' };
