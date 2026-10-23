/**
 * Discount codes a bus company creates on the operations page and passengers type at checkout.
 * Stored in the company's own database (core/tenantDb.js, D126): every function takes that database.
 *
 * - A code takes a fixed amount or a percentage (with a cap) off the seat fare, from a minimum order,
 *   inside an optional start/end window, with optional limits on total uses and uses per phone.
 * - A use is taken when the order is created (PENDING until its payment window ends), kept when the order
 *   is paid (USED); an order left unpaid gives its use back, so a limit is not eaten by abandoned orders.
 */

/** Demo codes, written once into a new company database outside production (the codes the app always had). */
export const DEMO_VOUCHERS = [
  { code: 'BUSGO50K', description: 'Giảm 50.000 đ cho đơn từ 200.000 đ', discount_type: 'FIXED', discount_value: 50000, max_discount_vnd: null, min_order_vnd: 200000 },
  { code: 'VIP10', description: 'Giảm 10% tối đa 50.000 đ cho đơn từ 150.000 đ', discount_type: 'PERCENT', discount_value: 10, max_discount_vnd: 50000, min_order_vnd: 150000 }
];

const COLUMNS = ['code', 'description', 'discount_type', 'discount_value', 'max_discount_vnd', 'min_order_vnd', 'starts_at', 'ends_at', 'usage_limit', 'per_customer_limit', 'active', 'created_at', 'updated_at'];

function insert(db, v) {
  db.prepare(`INSERT OR IGNORE INTO vouchers (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`)
    .run(...COLUMNS.map(c => (c === 'active' ? (v.active ? 1 : 0) : v[c] ?? null)));
}

/** Seeds a new company database with the demo codes. */
export function seedVouchers(db, now = new Date().toISOString()) {
  for (const v of DEMO_VOUCHERS) insert(db, { starts_at: null, ends_at: null, usage_limit: null, per_customer_limit: null, ...v, active: true, created_at: now, updated_at: now });
}

const fromRow = (row) => ({ ...row, active: row.active === 1 });
export const normalizeCode = (code) => (typeof code === 'string' ? code.trim().toUpperCase() : '');

function getVoucher(db, code) {
  const row = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(normalizeCode(code));
  return row ? fromRow(row) : null;
}

/** Uses that count against the limits: paid orders and orders still inside their payment window. */
function countUses(db, code, now, phone = null) {
  const at = new Date(now).toISOString();
  const sql = `SELECT COUNT(*) AS n FROM voucher_redemptions WHERE code = ? AND (status = 'USED' OR (status = 'PENDING' AND expires_at > ?))${phone ? ' AND phone = ?' : ''}`;
  return db.prepare(sql).get(...[code, at, ...(phone ? [phone] : [])]).n;
}

/** LIVE, SCHEDULED (not started), ENDED, USED_UP or OFF, as the office list shows it. */
export function voucherStatus(v, now = Date.now(), used = 0) {
  if (!v.active) return 'OFF';
  if (v.starts_at && Date.parse(v.starts_at) > now) return 'SCHEDULED';
  if (v.ends_at && Date.parse(v.ends_at) < now) return 'ENDED';
  if (v.usage_limit != null && used >= v.usage_limit) return 'USED_UP';
  return 'LIVE';
}

/** Amount taken off a seat fare [subtotal] by [v], never more than the fare. */
export function discountFor(v, subtotal) {
  const raw = v.discount_type === 'PERCENT' ? Math.floor((subtotal * v.discount_value) / 100) : v.discount_value;
  const capped = v.discount_type === 'PERCENT' && v.max_discount_vnd != null ? Math.min(raw, v.max_discount_vnd) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

const reject = (code, message) => ({ ok: false, status: 422, code, message });

/**
 * Whether [code] applies to an order of [subtotal] for [phone]; { ok, voucher, discount_vnd } or a refusal
 * the passenger can read.
 */
export function evaluateVoucher(db, code, { subtotal, phone = null, now = Date.now() } = {}) {
  const v = getVoucher(db, code);
  if (!v || !v.active) return reject('VOUCHER_INVALID', 'Mã giảm giá không đúng');
  if (v.starts_at && Date.parse(v.starts_at) > now) return reject('VOUCHER_NOT_STARTED', 'Mã giảm giá chưa đến ngày áp dụng');
  if (v.ends_at && Date.parse(v.ends_at) < now) return reject('VOUCHER_EXPIRED', 'Mã giảm giá đã hết hạn');
  if (v.usage_limit != null && countUses(db, v.code, now) >= v.usage_limit) return reject('VOUCHER_USED_UP', 'Mã giảm giá đã hết lượt');
  if (phone && v.per_customer_limit != null && countUses(db, v.code, now, phone) >= v.per_customer_limit) {
    return reject('VOUCHER_CUSTOMER_LIMIT', 'Bạn đã dùng hết lượt của mã này');
  }
  if (subtotal < v.min_order_vnd) {
    return reject('VOUCHER_MIN_ORDER', `Mã áp dụng cho đơn từ ${v.min_order_vnd.toLocaleString('vi-VN')} đ`);
  }
  return { ok: true, voucher: v, discount_vnd: discountFor(v, subtotal) };
}

/** Takes a use for an order just created; it is given back when [expiresAt] passes without payment. */
export function reserveVoucher(db, { code, orderId, phone, discountVnd, expiresAt, now = Date.now() }) {
  db.prepare("INSERT INTO voucher_redemptions (order_id, code, phone, discount_vnd, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)")
    .run(orderId, normalizeCode(code), phone || null, discountVnd, expiresAt, new Date(now).toISOString());
}

/** The order is paid: its use is kept for good. */
export function confirmVoucherUse(db, orderId) {
  db.prepare("UPDATE voucher_redemptions SET status = 'USED' WHERE order_id = ?").run(orderId);
}

// ---------- Office editing (/api/v1/ops/vouchers) ----------
const CODE_RE = /^[A-Z0-9]{3,20}$/;
const invalid = (message) => ({ ok: false, status: 400, code: 'VALIDATION_ERROR', message });
const notFound = () => ({ ok: false, status: 404, code: 'VOUCHER_NOT_FOUND', message: 'Không tìm thấy mã giảm giá' });
const validDate = (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
const wholeOrNull = (v, min) => v === null || (Number.isInteger(v) && v >= min);

/** The editable fields of a code, merged over [base]; returns { fields } or an error result. */
function voucherFields(input, base = {}) {
  const pick = (key) => (input[key] === undefined ? base[key] : input[key]);
  const fields = {
    description: typeof pick('description') === 'string' ? pick('description').trim() : '',
    discount_type: pick('discount_type') ?? 'FIXED',
    discount_value: pick('discount_value'),
    max_discount_vnd: pick('max_discount_vnd') ?? null,
    min_order_vnd: pick('min_order_vnd') ?? 0,
    starts_at: pick('starts_at') || null,
    ends_at: pick('ends_at') || null,
    usage_limit: pick('usage_limit') ?? null,
    per_customer_limit: pick('per_customer_limit') ?? null
  };
  if (fields.description.length > 120) return invalid('Mô tả tối đa 120 ký tự');
  if (!['FIXED', 'PERCENT'].includes(fields.discount_type)) return invalid('Kiểu giảm là FIXED (số tiền) hoặc PERCENT (phần trăm)');
  if (fields.discount_type === 'FIXED' && !(Number.isInteger(fields.discount_value) && fields.discount_value >= 1000)) return invalid('Số tiền giảm từ 1.000 đ');
  if (fields.discount_type === 'PERCENT' && !(Number.isInteger(fields.discount_value) && fields.discount_value >= 1 && fields.discount_value <= 100)) return invalid('Phần trăm giảm từ 1 đến 100');
  if (fields.discount_type === 'FIXED') fields.max_discount_vnd = null;
  if (!wholeOrNull(fields.max_discount_vnd, 1000)) return invalid('Mức giảm tối đa từ 1.000 đ');
  if (!(Number.isInteger(fields.min_order_vnd) && fields.min_order_vnd >= 0)) return invalid('Đơn tối thiểu là số tiền không âm');
  if (!validDate(fields.starts_at) || !validDate(fields.ends_at)) return invalid('Ngày bắt đầu, kết thúc không hợp lệ');
  if (fields.starts_at && fields.ends_at && Date.parse(fields.ends_at) <= Date.parse(fields.starts_at)) return invalid('Ngày kết thúc phải sau ngày bắt đầu');
  if (!wholeOrNull(fields.usage_limit, 1)) return invalid('Tổng số lượt là số nguyên từ 1, để trống là không giới hạn');
  if (!wholeOrNull(fields.per_customer_limit, 1)) return invalid('Số lượt mỗi khách là số nguyên từ 1, để trống là không giới hạn');
  return { ok: true, fields };
}

function officeView(db, v, now) {
  const used = countUses(db, v.code, now);
  return { ...v, used_count: used, status: voucherStatus(v, now, used) };
}

/** Every code of the company, newest first, with uses so far and status. */
export function listOfficeVouchers(db, now = Date.now()) {
  return db.prepare('SELECT * FROM vouchers ORDER BY created_at DESC, code').all().map(r => officeView(db, fromRow(r), now));
}

export function createVoucher(db, input = {}, now = Date.now()) {
  const code = normalizeCode(input.code);
  if (!CODE_RE.test(code)) return invalid('Mã gồm 3-20 chữ cái không dấu hoặc chữ số');
  if (getVoucher(db, code)) return { ok: false, status: 409, code: 'VOUCHER_EXISTS', message: 'Mã này đã có' };
  const r = voucherFields(input);
  if (!r.ok) return r;
  const at = new Date(now).toISOString();
  const voucher = { code, ...r.fields, active: input.active !== false, created_at: at, updated_at: at };
  insert(db, voucher);
  return { ok: true, before: null, voucher: officeView(db, voucher, now) };
}

export function updateVoucher(db, code, input = {}, now = Date.now()) {
  const before = getVoucher(db, code);
  if (!before) return notFound();
  const r = voucherFields(input, before);
  if (!r.ok) return r;
  const keys = Object.keys(r.fields);
  db.prepare(`UPDATE vouchers SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE code = ?`)
    .run(...keys.map(k => r.fields[k]), new Date(now).toISOString(), before.code);
  return { ok: true, before, voucher: officeView(db, getVoucher(db, before.code), now) };
}

export function setVoucherActive(db, code, active, now = Date.now()) {
  const before = getVoucher(db, code);
  if (!before) return notFound();
  db.prepare('UPDATE vouchers SET active = ?, updated_at = ? WHERE code = ?').run(active ? 1 : 0, new Date(now).toISOString(), before.code);
  return { ok: true, before, voucher: officeView(db, getVoucher(db, before.code), now) };
}

/** Only a code with no paid or still-payable order can be deleted; a used one is switched off instead, so orders keep their history. */
export function deleteVoucher(db, code, now = Date.now()) {
  const before = getVoucher(db, code);
  if (!before) return notFound();
  if (countUses(db, before.code, now) > 0) {
    return { ok: false, status: 409, code: 'VOUCHER_IN_USE', message: 'Mã đã có khách dùng, chỉ tắt được, không xóa được' };
  }
  db.prepare('DELETE FROM vouchers WHERE code = ?').run(before.code);
  return { ok: true, before };
}
