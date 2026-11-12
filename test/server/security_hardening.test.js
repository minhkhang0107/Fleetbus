/**
 * Security hardening (D198): production fails closed, and demo accounts with public secrets never stay usable.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isProduction } from '../../source/server/config.js';
import { hashSecret, verifySecret } from '../../source/server/core/passwords.js';
import { secureDemoAccounts, DEMO_STAFF_PASSWORDS, DEMO_DRIVER_PINS } from '../../source/server/core/demoAccounts.js';
import { MOCK_MANAGERS_DB } from '../../source/server/services/manager/modules/managerService.js';
import { MOCK_DRIVERS_DB } from '../../source/server/services/driver/modules/driverService.js';

describe('Production detection fails closed', () => {
  it('only NODE_ENV=development or test turn dev behaviour on', () => {
    assert.strictEqual(isProduction({ NODE_ENV: 'development' }), false);
    assert.strictEqual(isProduction({ NODE_ENV: 'test' }), false);
    assert.strictEqual(isProduction({}), true, 'an unset NODE_ENV is production');
    assert.strictEqual(isProduction({ NODE_ENV: 'production' }), true);
    assert.strictEqual(isProduction({ NODE_ENV: 'staging' }), true);
    assert.strictEqual(isProduction({ NODE_ENV: 'prod' }), true, 'a typo is production too');
  });
});

describe('Demo accounts in production', () => {
  const copy = (list) => list.map(a => ({ ...a }));

  it('the demo secret table matches the seeded accounts', () => {
    for (const [id, pw] of Object.entries(DEMO_STAFF_PASSWORDS)) {
      const user = MOCK_MANAGERS_DB.find(u => u.user_id === id);
      assert.ok(user && verifySecret(pw, user.password_hash), id);
    }
    for (const [id, pin] of Object.entries(DEMO_DRIVER_PINS)) {
      const driver = MOCK_DRIVERS_DB.find(d => d.driver_id === id);
      assert.ok(driver && verifySecret(pin, driver.pin), id);
    }
  });

  it('locks staff without a second factor and drivers; TOTP accounts must change their password', () => {
    const staff = copy(MOCK_MANAGERS_DB.filter(u => DEMO_STAFF_PASSWORDS[u.user_id]));
    const drivers = copy(MOCK_DRIVERS_DB.filter(d => DEMO_DRIVER_PINS[d.driver_id]));
    secureDemoAccounts({ staff, drivers, log: {} });

    const byId = Object.fromEntries(staff.map(u => [u.user_id, u]));
    assert.strictEqual(byId.mgr_02.active, false, 'dispatcher (no TOTP) is locked');
    assert.strictEqual(byId.mgr_02.token_version, (MOCK_MANAGERS_DB.find(u => u.user_id === 'mgr_02').token_version || 0) + 1);
    assert.notStrictEqual(byId.mgr_01.active, false, 'director (TOTP) keeps working');
    assert.strictEqual(byId.mgr_01.must_change_password, true);
    assert.strictEqual(byId.plat_01.must_change_password, true);
    assert.ok(drivers.every(d => d.status === 'LOCKED'));
  });

  it('leaves an account alone once its secret was changed', () => {
    const staff = copy(MOCK_MANAGERS_DB.filter(u => u.user_id === 'mgr_02')).map(u => ({ ...u, password_hash: hashSecret('a-new-strong-password') }));
    const drivers = copy(MOCK_DRIVERS_DB.filter(d => d.driver_id === 'drv_8821a')).map(d => ({ ...d, pin: hashSecret('908172') }));
    const changed = secureDemoAccounts({ staff, drivers, log: {} });
    assert.deepStrictEqual(changed, []);
    assert.notStrictEqual(staff[0].active, false);
    assert.notStrictEqual(drivers[0].status, 'LOCKED');
  });
});
