/**
 * Messages that reach a passenger whose app is closed, or who has no app (D144). The in-app notification stays
 * the record; the moments that make someone go out to the bus also leave by push (a phone that registered a push
 * token) or else by SMS, with the link to follow the bus.
 *
 * Providers are plugged by URL: FLEETBUS_SMS_WEBHOOK_URL and FLEETBUS_PUSH_WEBHOOK_URL receive
 * POST {to, text, title, type, link}, with `Authorization: Bearer` FLEETBUS_SMS_WEBHOOK_TOKEN / _PUSH_WEBHOOK_TOKEN when set (an SMS gateway, a Zalo ZNS bridge, a function calling Firebase). Push also
 * goes straight to Firebase Cloud Messaging with FLEETBUS_FCM_SERVICE_ACCOUNT (path to the project's service
 * account key, D145). Without a provider, a message is kept in the outbox as LOGGED, so the office sees what
 * would have gone out.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Firebase Cloud Messaging HTTP v1 with a service account: a signed JWT is exchanged for an access token
 * (kept until a minute before it expires), then one message per device token.
 */
export class FcmSender {
  constructor(account, fetchImpl = globalThis.fetch) {
    this.account = account;
    this.fetch = fetchImpl;
    this.token = null;
    this.tokenUntil = 0;
  }

  static fromEnv(env = process.env, fetchImpl) {
    const path = env.FLEETBUS_FCM_SERVICE_ACCOUNT;
    if (!path) return null;
    const account = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (!account.project_id || !account.client_email || !account.private_key) throw new Error('FLEETBUS_FCM_SERVICE_ACCOUNT không phải khóa service account của Firebase');
    return new FcmSender(account, fetchImpl);
  }

  _jwt(now) {
    const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const iat = Math.floor(now / 1000);
    const head = b64({ alg: 'RS256', typ: 'JWT' });
    const claims = b64({ iss: this.account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: this.account.token_uri || 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 });
    const signature = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(this.account.private_key).toString('base64url');
    return `${head}.${claims}.${signature}`;
  }

  async _accessToken(now = Date.now()) {
    if (this.token && now < this.tokenUntil) return this.token;
    const r = await this.fetch(this.account.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: this._jwt(now) }).toString()
    });
    if (!r.ok) throw new Error(`FCM token HTTP ${r.status}`);
    const body = await r.json();
    this.token = body.access_token;
    this.tokenUntil = now + Math.max(0, (body.expires_in || 3600) - 60) * 1000;
    return this.token;
  }

  /**
   * Sends one notification to a device; resolves to the fetch response. `data` carries what the app needs to open
   * the right screen when the notification is tapped (D192); FCM data values must be strings.
   */
  async send({ to, title, body, type, link, data = {} }) {
    const token = await this._accessToken();
    const strings = Object.fromEntries(Object.entries({ ...data, type: type || '', link: link || '' }).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]));
    return this.fetch(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: {
          token: to,
          notification: { title, body },
          data: strings,
          // The apps' "Chuyến đi" channel (heads-up with sound on Android) and the default sound on iPhone.
          android: { priority: 'HIGH', notification: { channel_id: PUSH_CHANNEL_ID, sound: 'default' } },
          apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } }
        }
      })
    });
  }
}

/** The Android notification channel both apps create (D192). */
export const PUSH_CHANNEL_ID = 'busgo_trip';

/** FCM answers 404, or 400 with UNREGISTERED / INVALID_ARGUMENT on the token, for a token that no longer works. */
async function deadToken(r) {
  if (r.status === 404) return true;
  if (r.status !== 400 || typeof r.json !== 'function') return false;
  const body = await r.json().catch(() => ({}));
  const code = body?.error?.details?.find?.(d => d.errorCode)?.errorCode || body?.error?.status;
  return code === 'UNREGISTERED' || (code === 'INVALID_ARGUMENT' && /registration token/i.test(body?.error?.message || ''));
}

/** The notices worth a push or an SMS: the home run, the bus in the area or coming, the bus at the door, a missed pickup, a phone booking. */
export const OUTSIDE_APP_TYPES = new Set([
  'HOME_RUN_STARTED',
  'HOME_PICKUP_NEAR_AREA',
  'PICKUP_APPROACHING',
  'PICKUP_ARRIVED',
  'HOME_PICKUP_ARRIVED',
  'HOME_PICKUP_DOOR',
  'HOME_PICKUP_MISSED',
  'HOME_PICKUP_INACCESSIBLE',
  'PHONE_BOOKING_CONFIRMED',
  'HOME_APPOINTMENT_CHANGED',
  'TRIP_CANCELLED',
  'TRIP_DELAY'
]);

const MAX_OUTBOX = 5000;
const SMS_MAX_CHARS = 320;

function stripDiacritics(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export class Messenger {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, fcm = undefined } = {}) {
    this.outbox = [];
    this.devices = new Map(); // phone -> { phone, operator_id, token, platform, registered_at }
    this.driverDevices = new Map(); // driver_id -> the same, for the driver app (D192)
    this.smsUrl = env.FLEETBUS_SMS_WEBHOOK_URL || null;
    this.pushUrl = env.FLEETBUS_PUSH_WEBHOOK_URL || null;
    // SMS gateways and Zalo ZNS bridges want a key: sent as a Bearer token when set.
    this.smsToken = env.FLEETBUS_SMS_WEBHOOK_TOKEN || null;
    this.pushToken = env.FLEETBUS_PUSH_WEBHOOK_TOKEN || null;
    this.fetch = fetchImpl;
    this.fcm = fcm === undefined ? FcmSender.fromEnv(env, fetchImpl) : fcm;
  }

  _headers(token) {
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  /** Whether a push can leave: straight to Firebase, or through a push webhook. */
  get pushReady() {
    return Boolean(this.fcm || this.pushUrl);
  }

  /** The passenger app tells which phone it runs on, with a push token once it has one. */
  registerDevice(phone, { token = null, platform = null, operatorId }) {
    const entry = { phone, operator_id: operatorId, token: token || null, platform: platform || null, registered_at: new Date().toISOString() };
    this.devices.set(phone, entry);
    return entry;
  }

  /**
   * Sends an OTP via the SMS webhook without diacritics and records a masked entry in the outbox.
   */
  sendOtp({ operatorId = null, phone, otp, brand = 'BusGo' } = {}) {
    if (!phone || !otp) return null;
    const prefix = stripDiacritics(brand || 'BusGo');
    const text = `${prefix}: Ma xac thuc cua ban la ${otp}, hieu luc 5 phut. Khong chia se ma nay.`;
    const maskedText = `${prefix}: Ma xac thuc cua ban la ******, hieu luc 5 phut. Khong chia se ma nay.`;
    const url = this.smsUrl;
    const entry = {
      id: `msg_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      operator_id: operatorId,
      trip_id: null,
      ticket_id: null,
      type: 'OTP',
      channel: 'SMS',
      to: phone,
      text: maskedText,
      link: null,
      status: url ? 'SENDING' : 'LOGGED',
      created_at: new Date().toISOString(),
      sent_at: null,
      error: null
    };
    this.outbox.push(entry);
    if (this.outbox.length > MAX_OUTBOX) this.outbox.shift();
    const sending = url && typeof this.fetch === 'function'
      ? this.fetch(url, {
        method: 'POST',
        headers: this._headers(this.smsToken),
        body: JSON.stringify({ to: phone, text, type: 'OTP' })
      })
      : null;
    if (sending) {
      Promise.resolve(sending)
        .then((r) => {
          entry.status = r?.ok ? 'SENT' : 'FAILED';
          entry.sent_at = new Date().toISOString();
          if (!r?.ok) entry.error = `HTTP ${r?.status}`;
        })
        .catch((err) => {
          entry.status = 'FAILED';
          entry.error = err.message;
        });
    }
    return entry;
  }

  /** The driver app's push token (D192); a driver signing out sends none. */
  registerDriverDevice(driverId, { token = null, platform = null, operatorId }) {
    const entry = { driver_id: driverId, operator_id: operatorId, token: token || null, platform: platform || null, registered_at: new Date().toISOString() };
    this.driverDevices.set(driverId, entry);
    return entry;
  }

  /**
   * Sends one notice outside the app. A phone with a push token gets every notice by push, since a push costs
   * nothing (D192); without one, only the notices that make someone go out to the bus leave by SMS.
   * Returns the outbox entry, or null when the notice stays in the app.
   */
  dispatch({ operatorId, phone, title, body, type, payload = {}, link = null, noticeId = null }) {
    if (!phone) return null;
    const device = this.devices.get(phone);
    const canPush = Boolean(device?.token && this.pushReady);
    if (!canPush && !OUTSIDE_APP_TYPES.has(type)) return null;
    const channel = canPush ? 'PUSH' : 'SMS';
    const viaFcm = channel === 'PUSH' && this.fcm;
    const url = channel === 'PUSH' ? this.pushUrl : this.smsUrl;
    const text = `${title}: ${body}${link ? ` ${link}` : ''}`.slice(0, SMS_MAX_CHARS);
    const entry = {
      id: `msg_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      operator_id: operatorId,
      trip_id: payload.trip_id || null,
      ticket_id: payload.ticket_id || null,
      type,
      channel,
      to: phone,
      text,
      link,
      status: url || viaFcm ? 'SENDING' : 'LOGGED',
      created_at: new Date().toISOString(),
      sent_at: null,
      error: null
    };
    // Appended, so the stored list only grows at its end (the store writes changed positions).
    this.outbox.push(entry);
    if (this.outbox.length > MAX_OUTBOX) this.outbox.shift();
    const data = { notice_id: noticeId, ticket_id: payload.ticket_id, pnr: payload.pnr, trip_id: payload.trip_id };
    return this._send(entry, { viaFcm, url, channel, to: channel === 'PUSH' ? device.token : phone, title, body, type, link, text, data, onDead: () => { if (this.devices.get(phone) === device) device.token = null; } });
  }

  /** A push to the driver's phone (D192): trips given, taken away or cancelled. Null when the driver has no token. */
  dispatchDriver({ operatorId, driverId, title, body, type, payload = {} }) {
    const device = this.driverDevices.get(driverId);
    if (!device?.token || !this.pushReady) return null;
    const entry = {
      id: `msg_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      operator_id: operatorId,
      trip_id: payload.trip_id || null,
      ticket_id: null,
      type,
      channel: 'PUSH',
      to: driverId,
      text: `${title}: ${body}`.slice(0, SMS_MAX_CHARS),
      link: null,
      status: 'SENDING',
      created_at: new Date().toISOString(),
      sent_at: null,
      error: null
    };
    this.outbox.push(entry);
    if (this.outbox.length > MAX_OUTBOX) this.outbox.shift();
    return this._send(entry, { viaFcm: Boolean(this.fcm), url: this.pushUrl, channel: 'PUSH', to: device.token, title, body, type, link: null, text: entry.text, data: { trip_id: payload.trip_id }, onDead: () => { device.token = null; } });
  }

  _send(entry, { viaFcm, url, channel, to, title, body, type, link, text, data, onDead }) {
    const sending = viaFcm
      ? this.fcm.send({ to, title, body, type, link, data })
      : url && typeof this.fetch === 'function'
        ? this.fetch(url, { method: 'POST', headers: this._headers(channel === 'PUSH' ? this.pushToken : this.smsToken), body: JSON.stringify({ to, text, title, body, type, link, data }) })
        : null;
    if (sending) {
      sending
        .then(async (r) => {
          entry.status = r.ok ? 'SENT' : 'FAILED';
          entry.sent_at = new Date().toISOString();
          if (!r.ok) entry.error = `HTTP ${r.status}`;
          // An uninstalled app's token is dropped, so the next notice goes by SMS instead of failing again.
          if (!r.ok && viaFcm && await deadToken(r)) onDead();
        })
        .catch((err) => {
          entry.status = 'FAILED';
          entry.error = err.message;
        });
    }
    return entry;
  }

  /** The messages of a company, newest first, optionally of one trip. */
  list(operatorId, { tripId = null, limit = 200 } = {}) {
    return this.outbox.filter(m => m.operator_id === operatorId && (!tripId || m.trip_id === tripId)).reverse().slice(0, limit);
  }
}

/** Public address of the tracking link sent in messages. */
export function publicBaseUrl(env = process.env) {
  return (env.FLEETBUS_PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, '');
}
