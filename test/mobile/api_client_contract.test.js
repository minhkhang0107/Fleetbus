/**
 * Contract between the Flutter API clients and the server (Phase B review).
 * There is no Dart toolchain here, so the clients are read as text: every call they make must be an
 * endpoint the server serves, mutations must carry an Idempotency-Key where the server requires one,
 * every endpoint of a client's kind must have a method, and no identity or price may be hard-coded.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_CATALOG } from '../../source/server/core/apiCatalog.js';
import { resolveAccess } from '../../source/server/core/gateway.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CLIENTS = {
  passenger: { file: 'source/passenger/data/lib/src/service/passenger_api_service.dart', prefix: '', screens: 'PAX-' },
  driver: { file: 'source/driver/app/lib/src/service/driver_api_service.dart', prefix: '', screens: 'DRI-' },
  manager: { file: 'source/manager/app/lib/src/service/manager_api_service.dart', prefix: '/api/v1', screens: 'MGR-' }
};

function read(client) {
  return fs.readFileSync(path.join(root, CLIENTS[client].file), 'utf8');
}

function normalize(template) {
  return template.replace(/\$\{[^}]+\}|\$[A-Za-z_]\w*/g, '{x}');
}

function calls(client) {
  const src = read(client);
  const found = [];
  const re = /\b_(get|post|put|delete)\(\s*'([^']+)'([^;]*);/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    found.push({
      method: match[1].toUpperCase(),
      path: normalize(CLIENTS[client].prefix + match[2]),
      idempotent: /idempotent:\s*true/.test(match[3]),
      text: match[0]
    });
  }
  return found;
}

function catalogMatch(method, clientPath) {
  return API_CATALOG.find((entry) => {
    if (entry.method !== method) return false;
    const re = new RegExp(`^${entry.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[^/]+')}$`);
    return re.test(clientPath.replace(/\{x\}/g, 'x'));
  });
}

describe('Flutter API clients follow the server contract', () => {
  for (const client of Object.keys(CLIENTS)) {
    describe(`${client} client`, () => {
      it(`TC-CLIENT-${client}-01: finds the calls it makes`, () => {
        assert.ok(calls(client).length >= 5, 'the client must route every request through _get, _post, _put or _delete');
      });

      it(`TC-CLIENT-${client}-02: every call is an endpoint the server serves, on its canonical path`, () => {
        for (const call of calls(client)) {
          assert.ok(catalogMatch(call.method, call.path), `${client}: ${call.method} ${call.path} is not served by the server`);
        }
      });

      it(`TC-CLIENT-${client}-03: sends an Idempotency-Key exactly where the server requires one`, () => {
        for (const call of calls(client)) {
          const expected = resolveAccess(call.method, call.path.replace(/\{x\}/g, 'x')).idempotent;
          assert.strictEqual(call.idempotent, expected, `${client}: ${call.method} ${call.path} idempotent flag must be ${expected}`);
        }
      });

      it(`TC-CLIENT-${client}-04: has a method for every endpoint of its kind`, () => {
        const have = new Set(calls(client).map((c) => `${c.method} ${catalogMatch(c.method, c.path)?.path}`));
        const wanted = API_CATALOG.filter((e) => e.screen.startsWith(CLIENTS[client].screens) && !e.path.startsWith('/api/v1/webhooks'));
        for (const entry of wanted) {
          assert.ok(have.has(`${entry.method} ${entry.path}`), `${client}: no method calls ${entry.method} ${entry.path} (${entry.screen})`);
        }
      });

      it(`TC-CLIENT-${client}-05: sends the session token and keeps no fixed identity`, () => {
        const src = read(client);
        assert.ok(/Authorization/.test(src) && /Bearer/.test(src), `${client}: requests must carry the Bearer token`);
        assert.ok(/Idempotency-Key/.test(src), `${client}: the client must be able to send Idempotency-Key`);
        assert.ok(!/'x-driver-id'\s*:\s*'/.test(src), `${client}: a fixed x-driver-id makes every driver the same person`);
        assert.ok(!src.includes("'0912345678'"), `${client}: no default phone number`);
        assert.ok(!src.includes('usr_default') && !src.includes('usr_guest'), `${client}: no default user`);
        assert.ok(!src.includes('unitPriceVnd'), `${client}: the server prices orders, the client sends no price`);
      });
    });
  }

  it('TC-CLIENT-06: bodies carry what the server needs', () => {
    const passenger = read('passenger');
    assert.ok(/'holdId'/.test(passenger), 'creating a booking needs the holdId of the live hold');
    assert.ok(/'trip_id'|'tripId'/.test(passenger));
    assert.ok(!/departureTime/.test(passenger), 'the server takes the departure from the ticket, not from the client');
    assert.ok(/holdSeats\(String tripId, List<String> seatCodes(, \{[^)]*\})?\)/.test(passenger), 'holding seats must not take a user id: the token says who the user is');

    const driver = read('driver');
    assert.ok(/'ticket_id'/.test(driver) && /'amount_collected_vnd'/.test(driver), 'COD collection sends the ticket and the cash received');
    assert.ok(/'change_settlement_method'/.test(driver));
    assert.ok(!/'pnr'\s*:/.test(driver), 'COD is collected per ticket, not per PNR');
  });

  it('TC-CLIENT-07: every client stores the token it receives at login', () => {
    assert.ok(/authToken\s*=/.test(read('passenger')), 'passenger client must keep the token from verifyOtp');
    assert.ok(/authToken\s*=/.test(read('driver')), 'driver client must keep the token from login');
    assert.ok(/authToken\s*=/.test(read('manager')), 'manager client must keep the token from login');
  });
});
