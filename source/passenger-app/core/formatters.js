/**
 * FleetBus Passenger Core Formatters & Validators
 */

export function formatVND(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}

export function formatPNR(code) {
  if (!code) return '';
  const trimmed = code.trim().toUpperCase();
  if (trimmed.startsWith('BG-') || trimmed.startsWith('FB-')) {
    return trimmed;
  }
  const cleaned = trimmed.replace(/[^A-Z0-9]/g, '');
  return `BG-${cleaned.slice(0, 6)}`;
}

export function formatCountdown(secondsRemaining) {
  const safeSec = Math.max(0, Math.floor(secondsRemaining || 0));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function validateVietnamPhone(phone) {
  if (!phone) return { isValid: false, message: 'Số điện thoại không được để trống' };
  const cleaned = phone.replace(/[\s\-\.]/g, '');
  // Matches +84 or 0 followed by 3, 5, 7, 8, 9 and 8 digits
  const vnPhoneRegex = /^(?:\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
  if (!vnPhoneRegex.test(cleaned)) {
    return { isValid: false, message: 'Số điện thoại không hợp lệ (VD: 0912 345 678)' };
  }
  // Normalize to standard 09xxxxxxxx format
  let normalized = cleaned;
  if (normalized.startsWith('+84')) normalized = '0' + normalized.slice(3);
  else if (normalized.startsWith('84')) normalized = '0' + normalized.slice(2);
  return { isValid: true, normalized };
}

export function validateCCCD(cccd) {
  if (!cccd) return { isValid: false, message: 'Số CCCD/Định danh không được để trống' };
  const cleaned = cccd.replace(/\s/g, '');
  if (!/^[0-9]{12}$/.test(cleaned)) {
    return { isValid: false, message: 'CCCD phải gồm đúng 12 chữ số' };
  }
  return { isValid: true, normalized: cleaned };
}

export function formatSpeed(kmh) {
  const speed = typeof kmh === 'number' ? kmh : parseFloat(kmh) || 0;
  return `${speed.toFixed(1)} km/h`;
}

export function formatDistance(meters) {
  const m = typeof meters === 'number' ? meters : parseFloat(meters) || 0;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function calculateRefundAmount(totalPrice, departureDate, cancelDate = new Date()) {
  const depTime = new Date(departureDate).getTime();
  const cancelTime = new Date(cancelDate).getTime();
  const hoursUntilDeparture = (depTime - cancelTime) / (1000 * 60 * 60);

  if (hoursUntilDeparture >= 24) {
    return {
      percentage: 100,
      feePercentage: 0,
      refundAmount: totalPrice,
      feeAmount: 0,
      tier: 'FULL_REFUND',
      message: 'Hủy trước 24h: Hoàn tiền 100%'
    };
  } else if (hoursUntilDeparture >= 12) {
    const refund = Math.floor(totalPrice * 0.5);
    const fee = totalPrice - refund;
    return {
      percentage: 50,
      feePercentage: 50,
      refundAmount: refund,
      feeAmount: fee,
      tier: 'PARTIAL_REFUND',
      message: 'Hủy trước 12-24h: Hoàn tiền 50% (Phí hủy 50%)'
    };
  } else {
    return {
      percentage: 0,
      feePercentage: 100,
      refundAmount: 0,
      feeAmount: totalPrice,
      tier: 'NO_REFUND',
      message: 'Hủy dưới 12h: Không hoàn tiền theo quy chế vận tải'
    };
  }
}
