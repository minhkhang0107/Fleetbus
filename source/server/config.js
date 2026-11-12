/**
 * FleetBus server configuration.
 * Secrets come from the environment; development defaults exist only outside production.
 */

const DEV_TICKET_SECRET = 'fleetbus_dev_only_ticket_secret';

/**
 * Dev-only behaviour (default secrets, FLEETBUS_AUTH=off, client clock, mock OTP, VIP phone) is on only when
 * NODE_ENV is "development" or "test". Anything else, an unset NODE_ENV included, counts as production, so a
 * deploy that forgets the variable fails closed instead of signing tokens with the secrets in this public repo.
 */
const NON_PRODUCTION_ENVS = new Set(['development', 'test']);

export function isProduction(env = process.env) {
  return !NON_PRODUCTION_ENVS.has(env?.NODE_ENV);
}

/** Secrets a production server cannot start without; checked once at start so every gap is named together. */
export function missingProductionSecrets(env = process.env) {
  const missing = ['FLEETBUS_TOKEN_SECRET', 'FLEETBUS_TICKET_SECRET', 'FLEETBUS_WEBHOOK_SECRET', 'FLEETBUS_DB_KEY'].filter(k => !env[k]);
  if (env.FLEETBUS_WEBHOOK_SECRET === 'off') missing.push('FLEETBUS_WEBHOOK_SECRET (không được là "off")');
  for (const k of ['FLEETBUS_TOKEN_SECRET', 'FLEETBUS_TICKET_SECRET']) {
    if (env[k] && env[k].length < 32) missing.push(`${k} (cần ít nhất 32 ký tự)`);
  }
  return missing;
}

/**
 * Returns the server clock in production; outside production accepts a caller-supplied timestamp (ms or ISO string).
 */
export function clientNow(source) {
  if (isProduction() || !source) return Date.now();
  const raw = typeof source?.get === 'function'
    ? source.get('now')
    : (typeof source === 'object' ? source.now : source);
  if (raw === undefined || raw === null || raw === '' || raw === false) return Date.now();
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) return num;
  const parsed = typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function getTicketSecret() {
  const fromEnv = process.env.FLEETBUS_TICKET_SECRET;
  if (fromEnv) return fromEnv;
  if (isProduction()) {
    throw new Error('FLEETBUS_TICKET_SECRET must be set in production');
  }
  return DEV_TICKET_SECRET;
}

export function getWebhookSecret() {
  const fromEnv = process.env.FLEETBUS_WEBHOOK_SECRET;
  if (isProduction()) {
    if (fromEnv === 'off') {
      throw new Error('FLEETBUS_WEBHOOK_SECRET cannot be "off" in production');
    }
    if (!fromEnv) {
      throw new Error('FLEETBUS_WEBHOOK_SECRET must be set in production');
    }
    return fromEnv;
  }
  return fromEnv || null;
}

const DEV_TOKEN_SECRET = 'fleetbus_dev_only_token_secret';

export function getTokenSecret() {
  const fromEnv = process.env.FLEETBUS_TOKEN_SECRET;
  if (fromEnv) return fromEnv;
  if (isProduction()) {
    throw new Error('FLEETBUS_TOKEN_SECRET must be set in production');
  }
  return DEV_TOKEN_SECRET;
}

/**
 * "enforce" (the default everywhere): every non-public endpoint needs a valid Bearer token and the role it requires.
 * "off": identity fields in the request are trusted. For local experiments only: FLEETBUS_AUTH=off.
 */
export function getAuthMode() {
  const fromEnv = process.env.FLEETBUS_AUTH;
  if (fromEnv === 'off' && !isProduction()) return 'off';
  return 'enforce';
}

/**
 * TOTP secret of a staff member (MGR-001, OQ-027). Production reads FLEETBUS_TOTP_SECRET_<USER_ID> (base32, for
 * example FLEETBUS_TOTP_SECRET_MGR_01); with none set, 2FA roles cannot sign in. Outside production a fixed dev
 * secret is used so the demo accounts work.
 */
export const DEV_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export function getStaffTotpSecret(userId, account = null) {
  if (account?.totp_enrolled && account?.totp_secret) {
    return account.totp_secret;
  }
  const fromEnv = userId ? process.env[`FLEETBUS_TOTP_SECRET_${String(userId).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] : null;
  if (fromEnv) return fromEnv;
  return isProduction() ? null : DEV_TOTP_SECRET;
}

/**
 * VIP / review passenger account: rides free across all bus companies, dev/staging only. Never active in production.
 */
export const VIP_PASSENGER_PHONE = '0999888777';
export const VIP_PASSENGER_OTP = '888777';

export function isVipPassengerPhone(phone) {
  return !isProduction() && phone === VIP_PASSENGER_PHONE;
}
