/**
 * A passenger deletes their account with one company (PAX-022, B-12; required by Google Play and the App Store).
 * Personal data goes: sessions, push device, notifications, OTP. Orders and tickets stay for the company's
 * accounts, with the name replaced and the phone masked, so they no longer belong to the number: logging in
 * again with it starts an empty account.
 */
import { validateVietnamPhone } from '../core/formatters.js';
import { DEFAULT_OPERATOR_ID } from '../../../core/operators.js';

export const DELETED_NAME = 'Khách đã xóa tài khoản';

const ownCompany = (record, operatorId) => (record.operator_id || DEFAULT_OPERATOR_ID) === operatorId;

/** `0912345678` -> `09******78`. */
export function maskDeletedPhone(phone) {
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

export function deletePassengerAccount(services, { operatorId, phone, now = Date.now() }) {
  const { authService, paymentService, managerService, trackingService, messenger } = services;
  const check = validateVietnamPhone(phone);
  if (!check.isValid) return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Cần đăng nhập để thực hiện thao tác này' };
  const normalized = check.normalized;
  const same = (value) => Boolean(value) && (validateVietnamPhone(value).normalized || value) === normalized;

  // A trip still to make or money still to come back keeps the account until it is settled.
  const upcoming = paymentService.getTicketsByPhone(normalized, 'UPCOMING', operatorId, now);
  const ticketIds = new Set([...paymentService.tickets.values()].filter(t => ownCompany(t, operatorId) && (same(t.passenger_phone) || same(t.owner_phone))).map(t => t.ticket_id));
  const pendingRefund = managerService.refundRequests.some(r => r.status === 'REFUND_REQUESTED' && ownCompany(r, operatorId) && ticketIds.has(r.ticket_id));
  if ((upcoming.success && upcoming.total_count > 0) || pendingRefund) {
    return { ok: false, status: 409, code: 'HAS_UPCOMING_TICKETS', message: 'Bạn còn vé chưa đi. Hãy hủy vé hoặc đợi chuyến kết thúc rồi xóa tài khoản.' };
  }

  const masked = maskDeletedPhone(normalized);
  for (const t of paymentService.tickets.values()) {
    if (!ownCompany(t, operatorId)) continue;
    if (same(t.passenger_phone) || same(t.owner_phone)) {
      t.passenger_name = DELETED_NAME;
      if (same(t.passenger_phone)) t.passenger_phone = masked;
      if (same(t.owner_phone)) t.owner_phone = masked;
    }
    if (same(t.delegated_to?.phone)) t.delegated_to = { ...t.delegated_to, name: DELETED_NAME, phone: masked };
  }
  for (const o of paymentService.orders.values()) {
    if (!ownCompany(o, operatorId)) continue;
    if (o.payer && same(o.payer.phone)) Object.assign(o.payer, { full_name: DELETED_NAME, name: DELETED_NAME, phone: masked });
    for (const p of o.passengers || []) if (same(p.phone)) Object.assign(p, { full_name: DELETED_NAME, name: DELETED_NAME, phone: masked });
  }

  authService.revokePhone(operatorId, normalized, now);
  if (messenger?.devices.get(normalized)?.operator_id === operatorId) messenger.devices.delete(normalized);
  const notes = trackingService.notifications.get(normalized);
  if (notes) {
    const others = notes.filter(n => !ownCompany(n, operatorId));
    if (others.length) trackingService.notifications.set(normalized, others);
    else trackingService.notifications.delete(normalized);
  }
  return { ok: true, masked_phone: masked };
}
