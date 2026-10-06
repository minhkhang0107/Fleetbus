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
 * "enforce": every non-public endpoint needs a valid Bearer token and the role it requires.
 * "off": identity fields in the request are trusted (development only, until the apps send tokens).
 * Production defaults to "enforce"; FLEETBUS_AUTH overrides it.
 */
export function getAuthMode() {
  const fromEnv = process.env.FLEETBUS_AUTH;
  if (fromEnv === 'enforce' || fromEnv === 'off') return fromEnv;
  return isProduction() ? 'enforce' : 'off';
}
