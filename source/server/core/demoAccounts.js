/**
 * The demo accounts seeded into a new database have passwords and PINs printed in the README of a public repo.
 * In production none of them may stay usable with those secrets:
 * - an account without a second factor (office staff, drivers) is locked; the director resets it;
 * - an account behind TOTP (director, platform admin) keeps working, but must change its password on next sign-in.
 * An account whose secret was already changed is left alone.
 */
import { verifySecret } from './passwords.js';
import { TOTP_ROLES } from '../services/manager/modules/managerService.js';

/** user_id / driver_id -> the secret it was seeded with (see managerService.js and driverService.js). */
export const DEMO_STAFF_PASSWORDS = {
  mgr_01: 'admin123',
  mgr_02: 'disp123',
  mgr_03: 'cash123',
  mgr_xv_01: 'xv123',
  mgr_xv_02: 'xv123',
  plat_01: 'root123'
};

export const DEMO_DRIVER_PINS = {
  drv_8821a: '123456',
  drv_9902b: '654321',
  drv_9912b: '112233',
  drv_xv_7701: '246810'
};

/** Returns what was changed: [{ id, action }]. */
export function secureDemoAccounts({ staff, drivers, log = console }) {
  const changed = [];
  for (const user of staff) {
    const demo = DEMO_STAFF_PASSWORDS[user.user_id];
    if (!demo || user.active === false || !verifySecret(demo, user.password_hash)) continue;
    const secondFactor = TOTP_ROLES.includes(user.role) || Boolean(user.totp_required);
    if (secondFactor) {
      if (user.must_change_password) continue;
      user.must_change_password = true;
      changed.push({ id: user.user_id, action: 'MUST_CHANGE_PASSWORD' });
    } else {
      user.active = false;
      user.token_version = (user.token_version || 0) + 1;
      changed.push({ id: user.user_id, action: 'LOCKED' });
    }
  }
  for (const driver of drivers) {
    const demo = DEMO_DRIVER_PINS[driver.driver_id];
    if (!demo || driver.status === 'LOCKED' || !verifySecret(demo, driver.pin)) continue;
    driver.status = 'LOCKED';
    driver.token_version = (driver.token_version || 0) + 1;
    changed.push({ id: driver.driver_id, action: 'LOCKED' });
  }
  for (const c of changed) {
    log.warn?.(`[security] Tài khoản mẫu ${c.id} còn dùng mật khẩu/PIN công khai: ${c.action === 'LOCKED' ? 'đã khóa' : 'bắt buộc đổi mật khẩu'}`);
  }
  return changed;
}
