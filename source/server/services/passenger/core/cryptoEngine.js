/**
 * FleetBus Passenger Crypto & Telemetry Utilities
 * Implements the signed static boarding QR (versioned, revocable) and the VietQR Napas247 payload generator.
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
 * Boarding QR of one ticket (PAX-017, design review D104).
 * Static: it does not depend on the clock, so it works offline, as a screenshot or on paper.
 * The version is bumped when the passenger reissues the QR, which revokes every older copy.
 * Format: BUSGO|pnr|ticket_id|v<version>|hmac16
 */
export function generateBoardingQR(ticketData, secretKey) {
  const version = ticketData.qr_version || 1;
  const hmac = signCanonical(secretKey, `QR|${ticketData.pnr}|${ticketData.ticket_id}|v${version}`);
  return {
    qr_code_value: `BUSGO|${ticketData.pnr}|${ticketData.ticket_id}|v${version}|${hmac}`,
    version,
    hmac_signature: hmac
  };
}

/**
 * Checks the signature of a boarding QR. Whether its version is still the current one
 * is for the caller, which holds the ticket.
 */
export function verifyBoardingQR(qrString, secretKey) {
  if (!qrString || !qrString.startsWith('BUSGO|')) {
    return { isValid: false, reason: 'INVALID_FORMAT' };
  }
  const parts = qrString.split('|');
  if (parts.length !== 5 || !/^v\d+$/.test(parts[3])) return { isValid: false, reason: 'MALFORMED_PAYLOAD' };

  const [, pnr, ticket_id, versionStr, scannedHmac] = parts;
  const expectedHmac = signCanonical(secretKey, `QR|${pnr}|${ticket_id}|${versionStr}`);
  if (!safeEqualHex(expectedHmac, scannedHmac)) {
    return { isValid: false, reason: 'INVALID_SIGNATURE' };
  }
  return { isValid: true, pnr, ticket_id, version: parseInt(versionStr.slice(1), 10) };
}

/**
 * Group boarding QR for a multi-seat booking (PAX-017 / REV-01), static like the single QR.
 * It lists each ticket with its QR version, so reissuing one ticket revokes that member only.
 * Format: BUSGO_GRP|pnr|order_id|count|tkt1:v1,tkt2:v1|hmac16
 */
export function generateGroupBoardingQR(tickets, secretKey) {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error('Tickets array cannot be empty for group boarding QR');
  }
  const pnr = tickets[0].pnr;
  const orderId = tickets[0].order_id || pnr;
  const members = tickets.map(t => `${t.ticket_id}:v${t.qr_version || 1}`).join(',');
  const hmac = signCanonical(secretKey, `GRP|${pnr}|${orderId}|${tickets.length}|${members}`);

  return {
    qr_code_value: `BUSGO_GRP|${pnr}|${orderId}|${tickets.length}|${members}|${hmac}`,
    pnr,
    order_id: orderId,
    ticket_count: tickets.length,
    ticket_ids: tickets.map(t => t.ticket_id),
    hmac_signature: hmac
  };
}

export function verifyGroupBoardingQR(qrString, secretKey) {
  if (!qrString || !qrString.startsWith('BUSGO_GRP|')) {
    return { isValid: false, reason: 'INVALID_GROUP_FORMAT' };
  }
  const parts = qrString.split('|');
  if (parts.length !== 6) return { isValid: false, reason: 'MALFORMED_GROUP_PAYLOAD' };

  const [, pnr, orderId, countStr, membersStr, scannedHmac] = parts;
  const expectedHmac = signCanonical(secretKey, `GRP|${pnr}|${orderId}|${countStr}|${membersStr}`);
  if (!safeEqualHex(expectedHmac, scannedHmac)) {
    return { isValid: false, reason: 'INVALID_SIGNATURE' };
  }
  const members = membersStr.split(',').filter(Boolean).map((m) => {
    const [ticket_id, v] = m.split(':');
    return { ticket_id, version: parseInt(String(v).slice(1), 10) || 1 };
  });
  return {
    isValid: true,
    isGroup: true,
    pnr,
    order_id: orderId,
    ticket_count: parseInt(countStr, 10),
    ticket_ids: members.map(m => m.ticket_id),
    members
  };
}

/**
 * 6-digit backup PIN of a ticket (REV-01), tied to the QR version so a reissue revokes it too.
 */
export function generateTicketPin(ticketId, secretKey, version = 1) {
  const hash = crypto
    .createHmac('sha256', secretKey || getTicketSecret())
    .update(`PIN|${ticketId}|v${version}`)
    .digest('hex');
  return (parseInt(hash.slice(0, 8), 16) % 900000 + 100000).toString();
}

export function verifyTicketPin(ticketId, pin, secretKey, version = 1) {
  const expectedPin = generateTicketPin(ticketId, secretKey, version);
  const isValid = safeEqualHex(expectedPin, (pin || '').toString().trim());
  return { isValid, ticket_id: ticketId, reason: isValid ? null : 'INVALID_PIN' };
}

/**
 * Opaque token for a share link: the link never carries the ticket id or the PIN.
 */
export function createShareToken() {
  return crypto.randomBytes(16).toString('base64url');
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
