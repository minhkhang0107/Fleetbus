/**
 * FleetBus Passenger Crypto & Telemetry Utilities
 * Implements HMAC-SHA256 rotating dynamic ticket QR and VietQR Napas247 payload generator.
 */

import crypto from 'crypto';
import { getTicketSecret } from '../../../config.js';

function signCanonical(secretKey, canonical) {
  return crypto
    .createHmac('sha256', secretKey || getTicketSecret())
    .update(canonical)
    .digest('hex')
    .slice(0, 16);
}

function safeEqualHex(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string' || expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

/**
 * Generates a dynamic rotating QR payload with 30s HMAC-SHA256 signature
 * strictly meeting PAX-017 spec.
 */
export function generateDynamicTicketQR(ticketData, secretKey, timestampMs = Date.now()) {
  const window30s = Math.floor(timestampMs / 30000);
  const secondsRemaining = 30 - Math.floor((timestampMs % 30000) / 1000);

  const hmac = signCanonical(secretKey, `QR|${ticketData.pnr}|${ticketData.ticket_id}|${window30s}`);

  return {
    qr_code_value: `BUSGO|${ticketData.pnr}|${ticketData.ticket_id}|${window30s}|${hmac}`,
    window: window30s,
    seconds_remaining: secondsRemaining,
    hmac_signature: hmac,
    expires_at: new Date((window30s + 1) * 30000).toISOString()
  };
}

/**
 * Validates a scanned QR code with tolerance window (+-2 windows = 60s drift allowance - REV-03)
 */
export function verifyDynamicTicketQR(qrString, secretKey, currentTimestampMs = Date.now()) {
  if (!qrString || !qrString.startsWith('BUSGO|')) {
    return { isValid: false, reason: 'INVALID_FORMAT' };
  }

  const parts = qrString.split('|');
  if (parts.length < 5) return { isValid: false, reason: 'MALFORMED_PAYLOAD' };

  const [, pnr, ticket_id, windowStr, scannedHmac] = parts;
  const scannedWindow = parseInt(windowStr, 10);
  const currentWindow = Math.floor(currentTimestampMs / 30000);

  const expectedHmac = signCanonical(secretKey, `QR|${pnr}|${ticket_id}|${windowStr}`);
  if (!safeEqualHex(expectedHmac, scannedHmac)) {
    return { isValid: false, reason: 'INVALID_SIGNATURE' };
  }

  // Allow current window and +-2 windows (60s drift allowance for camera scan/passenger screen lag - REV-03)
  const isWindowValid = Math.abs(currentWindow - scannedWindow) <= 2;
  if (!isWindowValid) {
    return { isValid: false, reason: 'QR_EXPIRED', scannedWindow, currentWindow };
  }

  return {
    isValid: true,
    pnr,
    ticket_id,
    window: scannedWindow,
    isCurrentWindow: scannedWindow === currentWindow
  };
}

/**
 * Generates an aggregate Group Boarding QR payload for multi-seat bookings (PAX-017 / REV-01)
 * Format: BUSGO_GRP|pnr|order_id|ticket_count|ticket_ids_comma_separated|w|hmac
 */
export function generateGroupBoardingQR(tickets, secretKey, timestampMs = Date.now()) {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error('Tickets array cannot be empty for group boarding QR');
  }
  const window30s = Math.floor(timestampMs / 30000);
  const secondsRemaining = 30 - Math.floor((timestampMs % 30000) / 1000);
  const pnr = tickets[0].pnr;
  const orderId = tickets[0].order_id || pnr;
  const ticketIds = tickets.map(t => t.ticket_id).join(',');

  const hmac = signCanonical(secretKey, `GRP|${pnr}|${orderId}|${tickets.length}|${ticketIds}|${window30s}`);

  return {
    qr_code_value: `BUSGO_GRP|${pnr}|${orderId}|${tickets.length}|${ticketIds}|${window30s}|${hmac}`,
    pnr,
    order_id: orderId,
    ticket_count: tickets.length,
    ticket_ids: tickets.map(t => t.ticket_id),
    window: window30s,
    seconds_remaining: secondsRemaining,
    hmac_signature: hmac,
    expires_at: new Date((window30s + 1) * 30000).toISOString()
  };
}

/**
 * Validates an aggregate Group Boarding QR with +-2 windows tolerance (REV-01 / REV-03)
 */
export function verifyGroupBoardingQR(qrString, secretKey, currentTimestampMs = Date.now()) {
  if (!qrString || !qrString.startsWith('BUSGO_GRP|')) {
    return { isValid: false, reason: 'INVALID_GROUP_FORMAT' };
  }
  const parts = qrString.split('|');
  if (parts.length < 7) return { isValid: false, reason: 'MALFORMED_GROUP_PAYLOAD' };

  const [, pnr, orderId, countStr, ticketIdsStr, windowStr, scannedHmac] = parts;
  const scannedWindow = parseInt(windowStr, 10);
  const currentWindow = Math.floor(currentTimestampMs / 30000);

  const expectedHmac = signCanonical(secretKey, `GRP|${pnr}|${orderId}|${countStr}|${ticketIdsStr}|${windowStr}`);
  if (!safeEqualHex(expectedHmac, scannedHmac)) {
    return { isValid: false, reason: 'INVALID_SIGNATURE' };
  }

  const isWindowValid = Math.abs(currentWindow - scannedWindow) <= 2;
  if (!isWindowValid) {
    return { isValid: false, reason: 'QR_EXPIRED', scannedWindow, currentWindow };
  }

  const ticketIds = ticketIdsStr.split(',').filter(Boolean);

  return {
    isValid: true,
    isGroup: true,
    pnr,
    order_id: orderId,
    ticket_count: parseInt(countStr, 10),
    ticket_ids: ticketIds,
    window: scannedWindow,
    isCurrentWindow: scannedWindow === currentWindow
  };
}

/**
 * Generates an offline 6-digit verification PIN for ticket delegation / offline fallback (REV-01)
 */
export function generateTicketPin(ticketId, secretKey) {
  const hash = crypto
    .createHmac('sha256', secretKey || getTicketSecret())
    .update(`PIN|${ticketId}`)
    .digest('hex');
  const numericPin = (parseInt(hash.slice(0, 8), 16) % 900000 + 100000).toString();
  return numericPin;
}

/**
 * Verifies a 6-digit offline ticket PIN (REV-01)
 */
export function verifyTicketPin(ticketId, pin, secretKey) {
  const expectedPin = generateTicketPin(ticketId, secretKey);
  const isValid = safeEqualHex(expectedPin, (pin || '').toString().trim());
  return {
    isValid,
    ticket_id: ticketId,
    reason: isValid ? null : 'INVALID_PIN'
  };
}

/**
 * Generates an offline signed JSON ticket payload valid for the departure date (REV-03)
 */
export function generateOfflineSignedTicket(ticket, secretKey) {
  const sig = signCanonical(secretKey, `${ticket.ticket_id}|${ticket.pnr}|${ticket.seat_code}|${ticket.trip_id}`);

  return {
    tkt: ticket.ticket_id,
    pnr: ticket.pnr,
    seat: ticket.seat_code,
    trip: ticket.trip_id,
    sig
  };
}

/**
 * Verifies an offline signed JSON ticket payload (REV-03)
 */
export function verifyOfflineSignedTicket(payload, secretKey) {
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      return { isValid: false, reason: 'INVALID_JSON' };
    }
  }
  if (!data || !data.tkt || !data.pnr || !data.sig) {
    return { isValid: false, reason: 'MALFORMED_OFFLINE_PAYLOAD' };
  }
  const expectedSig = signCanonical(secretKey, `${data.tkt}|${data.pnr}|${data.seat}|${data.trip}`);

  const isValid = safeEqualHex(expectedSig, String(data.sig));
  return {
    isValid,
    isOfflineSigned: true,
    ticket_id: data.tkt,
    pnr: data.pnr,
    seat_code: data.seat,
    trip_id: data.trip,
    reason: isValid ? null : 'SIGNATURE_MISMATCH'
  };
}

/**
 * CRC16-CCITT for Napas247 VietQR standard EMVCo compliance
 */
export function crc16Ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    crc ^= (c << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates VietQR EMVCo compliant Quick Response Payload
 */
export function generateVietQRPayload({ bankBin, accountNumber, amount, memo }) {
  const safeBankBin = bankBin || '970415'; // VietinBank default
  const safeAccount = accountNumber || '1088219999';
  const safeAmount = Math.round(amount || 0).toString();
  const safeMemo = (memo || 'BUSGO VETRUC').slice(0, 25);

  // Sub-tags for Tag 38 (Payment Network Specific)
  const guid = 'A000000727';
  const tag00 = `00${guid.length.toString().padStart(2, '0')}${guid}`;
  
  const bankAcctInfo = `00${safeBankBin.length.toString().padStart(2, '0')}${safeBankBin}01${safeAccount.length.toString().padStart(2, '0')}${safeAccount}`;
  const tag01 = `01${bankAcctInfo.length.toString().padStart(2, '0')}${bankAcctInfo}`;
  const serviceCode = 'QRIBFTTA';
  const tag02 = `02${serviceCode.length.toString().padStart(2, '0')}${serviceCode}`;
  
  const consumerAccountInfo = `${tag00}${tag01}${tag02}`;
  const tag38 = `38${consumerAccountInfo.length.toString().padStart(2, '0')}${consumerAccountInfo}`;

  const tag00Format = '000201'; // Payload format indicator
  const tag01Init = '010212';   // Dynamic QR (12)
  const tag53Currency = '5303704'; // VND (704)
  const tag54Amount = `54${safeAmount.length.toString().padStart(2, '0')}${safeAmount}`;
  const tag58Country = '5802VN';
  
  const tag08Memo = `08${safeMemo.length.toString().padStart(2, '0')}${safeMemo}`;
  const tag62Additional = `62${tag08Memo.length.toString().padStart(2, '0')}${tag08Memo}`;

  const rawPayloadWithoutCrc = `${tag00Format}${tag01Init}${tag38}${tag53Currency}${tag54Amount}${tag58Country}${tag62Additional}6304`;
  const checksum = crc16Ccitt(rawPayloadWithoutCrc);
  
  return `${rawPayloadWithoutCrc}${checksum}`;
}

/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in meters
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // distance in meters
}

/**
 * Computes estimated time of arrival (ETA in minutes) based on distance and vehicle speed
 */
export function calculateETA(distanceMeters, speedKmh = 45) {
  if (distanceMeters <= 0) return 0;
  const speedMs = Math.max(5, speedKmh) * (1000 / 3600); // minimum 5 km/h to prevent divide by zero
  const etaSeconds = distanceMeters / speedMs;
  return Math.max(1, Math.round(etaSeconds / 60)); // ETA in minutes
}
