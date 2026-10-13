/**
 * Promotion banners a bus company shows on the passenger home slider (PAX-004 "PromoCarousel", D124),
 * edited by its director on the operations page (MGR-031, D125). Stored in the company's own database
 * (core/tenantDb.js, D126): every function takes that database, never a company id to filter on.
 * The list carries only what a slide draws; the HTML body is fetched when the passenger opens one.
 */
import crypto from 'crypto';

/** Demo slides, written once into a new company database outside production. */
export const SEED_BANNERS = [
  {
    banner_id: 'bn_saomai_early',
    operator_id: 'op_saomai',
    title: 'Đặt sớm giảm 50.000 đ',
    subtitle: 'Nhập mã BUSGO50K cho đơn từ 200.000 đ',
    background_color: '#2563EB',
    image_url: null,
    sort_order: 1,
    starts_at: '2026-10-01T00:00:00+07:00',
    ends_at: null,
    active: true,
    content_html: `<h2>Đặt sớm giảm 50.000 đ</h2>
<p>Nhập mã <b>BUSGO50K</b> khi thanh toán để được giảm ngay <b>50.000 đ</b> cho đơn từ 200.000 đ.</p>
<ul>
  <li>Áp dụng mọi tuyến của Nhà xe Sao Mai.</li>
  <li>Mỗi đơn dùng một mã.</li>
  <li>Không đổi thành tiền mặt.</li>
</ul>
<p>Hỏi thêm: gọi <b>1900 6868</b>.</p>`
  },
  {
    banner_id: 'bn_saomai_home_pickup',
    operator_id: 'op_saomai',
    title: 'Đón tận nhà nội thành Hà Nội',
    subtitle: 'Xe trung chuyển đón bạn trước giờ xuất bến',
    background_color: '#0F766E',
    image_url: null,
    sort_order: 2,
    starts_at: '2026-10-01T00:00:00+07:00',
    ends_at: null,
    active: true,
    content_html: `<h2>Đón tận nhà nội thành Hà Nội</h2>
<p>Chọn <b>Đón tận nhà</b> khi đặt vé tuyến Hà Nội — Thanh Hóa, xe trung chuyển tới đón bạn từ 75 đến 30 phút trước giờ xuất bến.</p>
<p>Phụ phí <b>50.000 đ</b> một lượt, tính chung cho cả đơn.</p>
<p>Đặt trước ít nhất 2 giờ.</p>`
  },
  {
    banner_id: 'bn_saomai_summer',
    operator_id: 'op_saomai',
    title: 'Hè rực rỡ',
    subtitle: 'Chương trình đã kết thúc',
    background_color: '#B45309',
    image_url: null,
    sort_order: 3,
    starts_at: '2026-06-01T00:00:00+07:00',
    ends_at: '2026-08-31T23:59:59+07:00',
    active: true,
    content_html: '<h2>Hè rực rỡ</h2><p>Chương trình đã kết thúc.</p>'
  }
];

const COLUMNS = ['banner_id', 'title', 'subtitle', 'background_color', 'image_url', 'sort_order', 'starts_at', 'ends_at', 'content_html', 'active', 'created_at', 'updated_at'];

function insert(db, banner) {
  db.prepare(`INSERT INTO promo_banners (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`)
    .run(...COLUMNS.map(c => (c === 'active' ? (banner.active ? 1 : 0) : banner[c] ?? null)));
}

/** Seeds a new company database with that company's demo slides. */
export function seedPromoBanners(db, operatorId, now = new Date().toISOString()) {
  for (const { operator_id, ...banner } of SEED_BANNERS) {
    if (operator_id === operatorId) insert(db, { ...banner, created_at: now, updated_at: now });
  }
}

const fromRow = (row) => ({ ...row, active: row.active === 1 });

function allBanners(db) {
  return db.prepare('SELECT * FROM promo_banners ORDER BY sort_order, created_at').all().map(fromRow);
}

function getBanner(db, bannerId) {
  const row = db.prepare('SELECT * FROM promo_banners WHERE banner_id = ?').get(bannerId);
  return row ? fromRow(row) : null;
}

/** LIVE, SCHEDULED (not started), ENDED or OFF, as the office list shows it. */
export function bannerStatus(banner, now = Date.now()) {
  if (!banner.active) return 'OFF';
  if (banner.starts_at && Date.parse(banner.starts_at) > now) return 'SCHEDULED';
  if (banner.ends_at && Date.parse(banner.ends_at) < now) return 'ENDED';
  return 'LIVE';
}

/** Slides that are switched on and inside their run window, in display order. */
export function listLiveBanners(db, now = Date.now()) {
  return allBanners(db)
    .filter(b => bannerStatus(b, now) === 'LIVE')
    .map(({ banner_id, title, subtitle, background_color, image_url }) => ({ banner_id, title, subtitle, background_color, image_url }));
}

/** The page behind one slide; null when it is missing, switched off or out of its window. */
export function findLiveBanner(db, bannerId, now = Date.now()) {
  const banner = getBanner(db, bannerId);
  if (!banner || bannerStatus(banner, now) !== 'LIVE') return null;
  return { banner_id: banner.banner_id, title: banner.title, content_html: banner.content_html };
}

// ---------- Office editing (/api/v1/ops/promo-banners, D125) ----------
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_HTML = 50000;
// Neither the app nor the office preview runs scripts; refusing them keeps the stored page plain content.
const ACTIVE_CONTENT_RE = /<\s*(script|iframe|object|embed|form)\b|\son[a-z]+\s*=|javascript:/i;

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const invalid = (message) => ({ ok: false, status: 400, code: 'VALIDATION_ERROR', message });
const notFound = () => ({ ok: false, status: 404, code: 'BANNER_NOT_FOUND', message: 'Không tìm thấy quảng cáo' });

function validDate(v) {
  return v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
}

/** The editable fields of a banner, merged over [base]; returns { fields } or an error result. */
function bannerFields(input, base = {}) {
  const pick = (key) => (input[key] === undefined ? base[key] : input[key]);
  const fields = {
    title: text(pick('title')),
    subtitle: text(pick('subtitle') ?? ''),
    background_color: pick('background_color') ?? '#2563EB',
    image_url: text(pick('image_url') ?? '') || null,
    sort_order: pick('sort_order') ?? 1,
    starts_at: pick('starts_at') || null,
    ends_at: pick('ends_at') || null,
    content_html: typeof pick('content_html') === 'string' ? pick('content_html').trim() : ''
  };
  if (!fields.title || fields.title.length > 80) return invalid('Tiêu đề cần 1-80 ký tự');
  if (fields.subtitle.length > 120) return invalid('Mô tả ngắn tối đa 120 ký tự');
  if (!COLOR_RE.test(fields.background_color)) return invalid('Màu nền phải có dạng #RRGGBB');
  if (fields.image_url && (!/^https?:\/\/\S+$/.test(fields.image_url) || fields.image_url.length > 500)) return invalid('Ảnh phải là đường dẫn http(s)');
  if (!Number.isInteger(fields.sort_order) || fields.sort_order < 0 || fields.sort_order > 999) return invalid('Thứ tự là số nguyên 0-999');
  if (!validDate(fields.starts_at) || !validDate(fields.ends_at)) return invalid('Ngày bắt đầu, kết thúc không hợp lệ');
  if (fields.starts_at && fields.ends_at && Date.parse(fields.ends_at) <= Date.parse(fields.starts_at)) return invalid('Ngày kết thúc phải sau ngày bắt đầu');
  if (!fields.content_html) return invalid('Cần nội dung trang chi tiết');
  if (fields.content_html.length > MAX_HTML) return invalid('Nội dung tối đa 50.000 ký tự');
  if (ACTIVE_CONTENT_RE.test(fields.content_html)) return invalid('Nội dung không được chứa script, iframe, form hay sự kiện on...');
  return { ok: true, fields };
}

const officeView = (banner, now) => ({ ...banner, status: bannerStatus(banner, now) });

/** Every banner of the company, switched off and ended ones included, in display order. */
export function listOfficeBanners(db, now = Date.now()) {
  return allBanners(db).map(b => officeView(b, now));
}

export function createBanner(db, input = {}, now = Date.now()) {
  const r = bannerFields(input);
  if (!r.ok) return r;
  const at = new Date(now).toISOString();
  const banner = { banner_id: `bn_${crypto.randomBytes(5).toString('hex')}`, ...r.fields, active: input.active !== false, created_at: at, updated_at: at };
  insert(db, banner);
  return { ok: true, before: null, banner: officeView(banner, now) };
}

export function updateBanner(db, bannerId, input = {}, now = Date.now()) {
  const before = getBanner(db, bannerId);
  if (!before) return notFound();
  const r = bannerFields(input, before);
  if (!r.ok) return r;
  const keys = Object.keys(r.fields);
  db.prepare(`UPDATE promo_banners SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE banner_id = ?`)
    .run(...keys.map(k => r.fields[k]), new Date(now).toISOString(), bannerId);
  return { ok: true, before, banner: officeView(getBanner(db, bannerId), now) };
}

export function setBannerActive(db, bannerId, active, now = Date.now()) {
  const before = getBanner(db, bannerId);
  if (!before) return notFound();
  db.prepare('UPDATE promo_banners SET active = ?, updated_at = ? WHERE banner_id = ?').run(active ? 1 : 0, new Date(now).toISOString(), bannerId);
  return { ok: true, before, banner: officeView(getBanner(db, bannerId), now) };
}

export function deleteBanner(db, bannerId) {
  const before = getBanner(db, bannerId);
  if (!before) return notFound();
  db.prepare('DELETE FROM promo_banners WHERE banner_id = ?').run(bannerId);
  return { ok: true, before };
}
