/**
 * FleetBus server configuration.
 * Secrets come from the environment; development defaults exist only outside production.
 */

const DEV_TICKET_SECRET = 'fleetbus_dev_only_ticket_secret';

export function isProduction() {
  return process.env.NODE_ENV === 'production';
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
  if (fromEnv) return fromEnv;
  if (isProduction()) {
    throw new Error('FLEETBUS_WEBHOOK_SECRET must be set in production');
  }
  return null;
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

export function getStaffTotpSecret(userId) {
  const fromEnv = process.env[`FLEETBUS_TOTP_SECRET_${String(userId).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
  if (fromEnv) return fromEnv;
  return isProduction() ? null : DEV_TOTP_SECRET;
}

