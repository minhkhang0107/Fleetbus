/**
 * Cancellation and refund policy of a bus company (PAX-021, D184). The same object computes the refund and gives the
 * lines the passenger app shows before a cancellation, so what the passenger reads is what the server applies.
 * Stored in the company's service_config; a company without one uses the default below.
 */

export const DEFAULT_CANCELLATION_POLICY = Object.freeze({
  // Highest bound first; the last tier starts at 0 hours (cancelling just before the departure).
  tiers: [
    { min_hours_before: 12, refund_percent: 100 },
    { min_hours_before: 6, refund_percent: 80 },
    { min_hours_before: 0, refund_percent: 0 }
  ],
  // An official delay longer than this waives the fee (BR-DELAY-001); null: no waiver.
  delay_waiver_minutes: 30,
  notes: ['Vé đã hủy không khôi phục được, ghế được nhả ngay cho người khác.']
});

export function cancellationPolicyOf(config) {
  return config?.cancellation_policy || DEFAULT_CANCELLATION_POLICY;
}

function tierCode(percent) {
  if (percent >= 100) return 'FULL_REFUND';
  return percent <= 0 ? 'NO_REFUND' : 'PARTIAL_REFUND';
}

function tierMessage(tiers, i) {
  const { min_hours_before: from, refund_percent: percent } = tiers[i];
  const refund = percent >= 100 ? 'Hoàn tiền 100%' : percent <= 0 ? 'Không hoàn tiền' : `Hoàn tiền ${percent}% (Phí hủy ${100 - percent}%)`;
  if (i === 0) return from === 0 ? `Hủy trước giờ chạy: ${refund}` : `Hủy từ ${from} giờ trở lên trước giờ chạy: ${refund}`;
  const to = tiers[i - 1].min_hours_before;
  return from === 0 ? `Hủy dưới ${to} giờ trước giờ chạy: ${refund}` : `Hủy trước giờ chạy ${from}-${to} giờ: ${refund}`;
}

/** The refund for a fare cancelled at cancelDate, by the tier the hours before the departure fall in. */
export function refundByPolicy(policy, totalPrice, departureDate, cancelDate = new Date()) {
  const tiers = (policy || DEFAULT_CANCELLATION_POLICY).tiers;
  const hours = (new Date(departureDate).getTime() - new Date(cancelDate).getTime()) / 3600000;
  let i = tiers.findIndex(t => hours >= t.min_hours_before);
  if (i < 0) i = tiers.length - 1;
  const percentage = tiers[i].refund_percent;
  const refundAmount = Math.floor(totalPrice * percentage / 100);
  return {
    percentage,
    feePercentage: 100 - percentage,
    refundAmount,
    feeAmount: totalPrice - refundAmount,
    tier: tierCode(percentage),
    message: tierMessage(tiers, i)
  };
}

/** The lines the passenger reads before confirming a cancellation. */
export function policyRules(policy) {
  const p = policy || DEFAULT_CANCELLATION_POLICY;
  return [
    ...p.tiers.map((_, i) => tierMessage(p.tiers, i)),
    ...(p.delay_waiver_minutes != null ? [`Chuyến chậm hơn ${p.delay_waiver_minutes} phút so với giờ chạy: Hoàn tiền 100%, không thu phí hủy`] : []),
    'Nhà xe không nhận đón/trả tận nhà bạn đã đặt: Hoàn tiền 100%, không thu phí hủy',
    ...(p.notes || [])
  ];
}

export function publicCancellationPolicy(config) {
  const p = cancellationPolicyOf(config);
  return {
    tiers: p.tiers.map(t => ({ ...t })),
    delay_waiver_minutes: p.delay_waiver_minutes ?? null,
    rules: policyRules(p)
  };
}

/** Returns an error message, or null when the policy can be saved. */
export function validateCancellationPolicy(p) {
  if (!p || typeof p !== 'object') return 'Thiếu chính sách hủy vé';
  const { tiers, delay_waiver_minutes: waiver, notes } = p;
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 6) return 'Chính sách cần 1-6 mức hoàn';
  for (const [i, t] of tiers.entries()) {
    if (!Number.isInteger(t?.min_hours_before) || t.min_hours_before < 0 || t.min_hours_before > 720) return 'Số giờ trước giờ chạy là số nguyên 0-720';
    if (!Number.isInteger(t.refund_percent) || t.refund_percent < 0 || t.refund_percent > 100) return 'Phần trăm hoàn là số nguyên 0-100';
    if (i > 0 && t.min_hours_before >= tiers[i - 1].min_hours_before) return 'Các mức phải xếp theo số giờ giảm dần';
    if (i > 0 && t.refund_percent > tiers[i - 1].refund_percent) return 'Hủy càng sát giờ chạy không được hoàn nhiều hơn';
  }
  if (tiers[tiers.length - 1].min_hours_before !== 0) return 'Mức cuối phải bắt đầu từ 0 giờ (hủy sát giờ chạy)';
  if (waiver != null && (!Number.isInteger(waiver) || waiver < 1 || waiver > 600)) return 'Số phút chậm được miễn phí là số nguyên 1-600';
  if (notes != null && (!Array.isArray(notes) || notes.length > 5 || notes.some(n => typeof n !== 'string' || !n.trim() || n.length > 200))) return 'Ghi chú tối đa 5 dòng, mỗi dòng 1-200 ký tự';
  return null;
}

export function normalizeCancellationPolicy(p) {
  return {
    tiers: p.tiers.map(t => ({ min_hours_before: t.min_hours_before, refund_percent: t.refund_percent })),
    delay_waiver_minutes: p.delay_waiver_minutes ?? null,
    notes: (p.notes || []).map(n => n.trim())
  };
}
