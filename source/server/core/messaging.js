/**
 * Messages that reach a passenger whose app is closed, or who has no app (D144). The in-app notification stays
 * the record; the moments that make someone go out to the bus also leave by push (a phone that registered a push
 * token) or else by SMS, with the link to follow the bus.
 *
 * Providers are plugged by URL: FLEETBUS_SMS_WEBHOOK_URL and FLEETBUS_PUSH_WEBHOOK_URL receive
 * POST {to, text, title, type, link} (an SMS gateway, a Zalo ZNS bridge, a function calling Firebase). Push also
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

  /** Sends one notification to a device; resolves to the fetch response. */
  async send({ to, title, body, type, link }) {
    const token = await this._accessToken();
    return this.fetch(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: {
          token: to,
          notification: { title, body },
          data: { type: type || '', link: link || '' },
          android: { priority: 'HIGH' }
        }
      })
    });
  }
}

/** The notices worth a push or an SMS: the home run, the bus coming, the bus at the door, a missed pickup, a phone booking. */
export const OUTSIDE_APP_TYPES = new Set([
  'HOME_RUN_STARTED',
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

export class Messenger {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, fcm = undefined } = {}) {
    this.outbox = [];
    this.devices = new Map(); // phone -> { phone, operator_id, token, platform, registered_at }
    this.smsUrl = env.FLEETBUS_SMS_WEBHOOK_URL || null;
    this.pushUrl = env.FLEETBUS_PUSH_WEBHOOK_URL || null;
    this.fetch = fetchImpl;
    this.fcm = fcm === undefined ? FcmSender.fromEnv(env, fetchImpl) : fcm;
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
   * Sends one notice outside the app when its type calls for it: a push when the phone has a push token and a push
   * provider is set, else an SMS. Returns the outbox entry, or null when the notice stays in the app.
   */
  dispatch({ operatorId, phone, title, body, type, payload = {}, link = null }) {
    if (!phone || !OUTSIDE_APP_TYPES.has(type)) return null;
    const device = this.devices.get(phone);
    const channel = device?.token && this.pushReady ? 'PUSH' : 'SMS';
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
    const sending = viaFcm
      ? this.fcm.send({ to: device.token, title, body, type, link })
      : url && typeof this.fetch === 'function'
        ? this.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: channel === 'PUSH' ? device.token : phone, text, title, body, type, link }) })
        : null;
    if (sending) {
      sending
        .then((r) => {
          entry.status = r.ok ? 'SENT' : 'FAILED';
          entry.sent_at = new Date().toISOString();
          if (!r.ok) entry.error = `HTTP ${r.status}`;
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
