export const OPERATORS = Object.freeze([
  {
    operator_id: 'op_saomai',
    code: 'SAOMAI',
    name: 'Nhà xe Sao Mai',
    short_name: 'Sao Mai',
    hotline: '1900 6868',
    primary_color: '#2563EB',
    bank: { bin: '970415', bank_name: 'VietinBank', account_number: '1088219999', account_name: 'NHA XE SAO MAI' },
    memo_prefix: 'SAOMAI',
    default: true
  },
  {
    operator_id: 'op_xuyenviet',
    code: 'XUYENVIET',
    name: 'Xuyên Việt Lines',
    short_name: 'Xuyên Việt',
    hotline: '1900 2468',
    primary_color: '#0F766E',
    bank: { bin: '970436', bank_name: 'Vietcombank', account_number: '0071000123456', account_name: 'XUYEN VIET LINES' },
    memo_prefix: 'XUYENVIET'
  }
]);

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
    primary_color: op.primary_color
  };
}
