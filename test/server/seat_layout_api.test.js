import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('Seat layout and vehicle office API', () => {
  let server;
  let services;
  let baseUrl;
  let dispatcher;
  let cashier;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce' }));
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    dispatcher = (await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    })).body.data.token;
    cashier = (await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'cashier@busgo.vn', password: 'cash123' }
    })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('list returns the 4 built-ins with seat counts', async () => {
    const res = await request('/api/v1/ops/seat-layouts', { token: dispatcher });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    const builtins = res.body.data.filter(l => l.builtin === true);
    assert.strictEqual(builtins.length, 4);

    const ids = builtins.map(l => l.layout_id);
    assert.ok(ids.includes('CABIN_22'));
    assert.ok(ids.includes('CABIN_34'));
    assert.ok(ids.includes('SLEEPER_34'));
    assert.ok(ids.includes('SEAT_45'));

    const c22 = builtins.find(l => l.layout_id === 'CABIN_22');
    assert.strictEqual(c22.total_seats, 22);
    const c34 = builtins.find(l => l.layout_id === 'CABIN_34');
    assert.strictEqual(c34.total_seats, 34);
    const s34 = builtins.find(l => l.layout_id === 'SLEEPER_34');
    assert.strictEqual(s34.total_seats, 34);
    const s45 = builtins.find(l => l.layout_id === 'SEAT_45');
    assert.strictEqual(s45.total_seats, 45);
    assert.ok(Array.isArray(c22.used_by));
  });

  it('a cashier gets 403 on seat layout endpoints', async () => {
    const res = await request('/api/v1/ops/seat-layouts', { token: cashier });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'FORBIDDEN');
  });

  let customLayoutId;
  it('create a valid custom layout (1 deck, 2 columns, 4 seats) and an invalid one (duplicate code → 400)', async () => {
    const invalid = await request('/api/v1/ops/seat-layouts', {
      method: 'POST',
      token: dispatcher,
      body: {
        name: 'Trùng mã ghế',
        total_decks: 1,
        columns: 2,
        seats: [
          { seat_code: 'A1', deck: 1, row: 1, column: 1, type: 'SEAT' },
          { seat_code: 'A1', deck: 1, row: 1, column: 2, type: 'SEAT' },
          { seat_code: 'B1', deck: 1, row: 2, column: 1, type: 'SEAT' },
          { seat_code: 'B2', deck: 1, row: 2, column: 2, type: 'SEAT' }
        ]
      }
    });
    assert.strictEqual(invalid.status, 400);
    assert.strictEqual(invalid.body.code, 'VALIDATION_ERROR');

    const valid = await request('/api/v1/ops/seat-layouts', {
      method: 'POST',
      token: dispatcher,
      body: {
        name: 'Limousine Mini 4 Chỗ',
        total_decks: 1,
        columns: 2,
        seats: [
          { seat_code: 'A1', deck: 1, row: 1, column: 1, type: 'SEAT' },
          { seat_code: 'A2', deck: 1, row: 1, column: 2, type: 'SEAT' },
          { seat_code: 'B1', deck: 1, row: 2, column: 1, type: 'SEAT' },
          { seat_code: 'B2', deck: 1, row: 2, column: 2, type: 'SEAT' }
        ]
      }
    });
    assert.strictEqual(valid.status, 201);
    assert.ok(valid.body.data.layout_id.startsWith('custom_'));
    assert.strictEqual(valid.body.data.total_seats, 4);
    assert.strictEqual(valid.body.data.builtin, false);
    customLayoutId = valid.body.data.layout_id;

    const auditEntry = services.managerService.auditLog.find(a => a.action === 'SEAT_LAYOUT_CREATE' && a.resource === customLayoutId);
    assert.ok(auditEntry);
  });

  let createdVehicleId;
  it('add a vehicle with the custom layout (total_seats 4) and a duplicate plate (409)', async () => {
    const addRes = await request('/api/v1/ops/vehicles', {
      method: 'POST',
      token: dispatcher,
      body: {
        plate_number: '29B-777.88',
        model: 'Ford Transit Mini',
        layout_id: customLayoutId
      }
    });
    assert.strictEqual(addRes.status, 201);
    assert.strictEqual(addRes.body.data.total_seats, 4);
    assert.strictEqual(addRes.body.data.layout_id, customLayoutId);
    createdVehicleId = addRes.body.data.vehicle_id;

    const dupRes = await request('/api/v1/ops/vehicles', {
      method: 'POST',
      token: dispatcher,
      body: {
        plate_number: '29B-777.88',
        model: 'Ford Transit Mini 2',
        layout_id: customLayoutId
      }
    });
    assert.strictEqual(dupRes.status, 409);
    assert.strictEqual(dupRes.body.code, 'VEHICLE_EXISTS');
  });

  it('the vehicle list shows layout_name', async () => {
    const res = await request('/api/v1/ops/vehicles', { token: dispatcher });
    assert.strictEqual(res.status, 200);
    const vehicle = res.body.data.find(v => v.plate_number === '29B-777.88');
    assert.ok(vehicle);
    assert.strictEqual(vehicle.layout_id, customLayoutId);
    assert.strictEqual(vehicle.layout_name, 'Limousine Mini 4 Chỗ');
    assert.strictEqual(vehicle.total_seats, 4);

    // Also verify open to cashier
    const cashierRes = await request('/api/v1/ops/vehicles', { token: cashier });
    assert.strictEqual(cashierRes.status, 200);
  });

  it('deleting a used layout is 409, an unused custom one 200', async () => {
    // customLayoutId is in use by 29B-777.88
    const delUsed = await request(`/api/v1/ops/seat-layouts/${customLayoutId}`, {
      method: 'DELETE',
      token: dispatcher
    });
    assert.strictEqual(delUsed.status, 409);
    assert.strictEqual(delUsed.body.code, 'LAYOUT_IN_USE');

    // Create an unused custom layout
    const unusedRes = await request('/api/v1/ops/seat-layouts', {
      method: 'POST',
      token: dispatcher,
      body: {
        name: 'Sơ đồ tạm thời',
        total_decks: 1,
        columns: 1,
        seats: [{ seat_code: 'S1', deck: 1, row: 1, column: 1, type: 'SEAT' }]
      }
    });
    const unusedId = unusedRes.body.data.layout_id;

    const delUnused = await request(`/api/v1/ops/seat-layouts/${unusedId}`, {
      method: 'DELETE',
      token: dispatcher
    });
    assert.strictEqual(delUnused.status, 200);
    assert.strictEqual(delUnused.body.data.deleted, true);
    assert.ok(services.managerService.auditLog.some(a => a.action === 'SEAT_LAYOUT_DELETE' && a.resource === unusedId));
  });

  it('patching a built-in is 409', async () => {
    const patchRes = await request('/api/v1/ops/seat-layouts/CABIN_22', {
      method: 'PATCH',
      token: dispatcher,
      body: { name: 'Thử đổi tên builtin' }
    });
    assert.strictEqual(patchRes.status, 409);
    assert.strictEqual(patchRes.body.code, 'LAYOUT_BUILTIN');
  });

  it('changing a vehicle layout updates total_seats', async () => {
    const updateRes = await request(`/api/v1/ops/vehicles/${createdVehicleId}`, {
      method: 'PATCH',
      token: dispatcher,
      body: { layout_id: 'CABIN_22' }
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.data.layout_id, 'CABIN_22');
    assert.strictEqual(updateRes.body.data.total_seats, 22);

    const listRes = await request('/api/v1/ops/vehicles', { token: dispatcher });
    const vehicle = listRes.body.data.find(v => v.vehicle_id === createdVehicleId);
    assert.strictEqual(vehicle.layout_id, 'CABIN_22');
    assert.strictEqual(vehicle.total_seats, 22);
    assert.strictEqual(vehicle.layout_name, 'Limousine 22 phòng (2 tầng)');

    // Now customLayoutId is no longer used, deleting it succeeds
    const delNow = await request(`/api/v1/ops/seat-layouts/${customLayoutId}`, {
      method: 'DELETE',
      token: dispatcher
    });
    assert.strictEqual(delNow.status, 200);
  });

  it('changing a vehicle layout is refused with 409 LAYOUT_MISSING_SOLD_SEATS when assigned trip has booked seats', async () => {
    // trp_991823 has booked seats A01, A02, B01 on veh_01 (CABIN_34)
    // Create a custom layout that only has A01, A02 (missing B01)
    const custom = await request('/api/v1/ops/seat-layouts', {
      method: 'POST',
      token: dispatcher,
      body: {
        name: 'Thiếu ghế B01',
        total_decks: 1,
        columns: 2,
        seats: [
          { seat_code: 'A01', deck: 1, row: 1, column: 1, type: 'VIP_CABIN' },
          { seat_code: 'A02', deck: 1, row: 1, column: 2, type: 'VIP_CABIN' }
        ]
      }
    });
    assert.strictEqual(custom.status, 201);
    const layoutId = custom.body.data.layout_id;

    // Try to update veh_01 to layoutId: should be refused with 409 LAYOUT_MISSING_SOLD_SEATS
    const patchVeh = await request('/api/v1/ops/vehicles/veh_01', {
      method: 'PATCH',
      token: dispatcher,
      body: { layout_id: layoutId }
    });
    assert.strictEqual(patchVeh.status, 409);
    assert.strictEqual(patchVeh.body.code, 'LAYOUT_MISSING_SOLD_SEATS');

    // Clean up
    await request(`/api/v1/ops/seat-layouts/${layoutId}`, { method: 'DELETE', token: dispatcher });
  });

  it('updating a custom layout in use by a trip with booked seats is refused with 409 LAYOUT_IN_USE', async () => {
    // Create a custom layout with 20 seats
    const seats = [];
    let idx = 1;
    for (let r = 1; r <= 10; r++) {
      for (let c = 1; c <= 2; c++) {
        seats.push({ seat_code: `S${String(idx++).padStart(2, '0')}`, deck: 1, row: r, column: c, type: 'SEAT' });
      }
    }
    const createRes = await request('/api/v1/ops/seat-layouts', {
      method: 'POST',
      token: dispatcher,
      body: { name: 'Custom Full', total_decks: 1, columns: 2, seats }
    });
    assert.strictEqual(createRes.status, 201);
    const layoutId = createRes.body.data.layout_id;

    // Add a vehicle using this layout
    const veh = await request('/api/v1/ops/vehicles', {
      method: 'POST',
      token: dispatcher,
      body: { plate_number: '29B-555.66', model: 'Xe Khách', layout_id: layoutId }
    });
    const vehicleId = veh.body.data.vehicle_id;

    // Assign to a trip with booked_seats > 0
    services.managerService.trips.push({
      trip_id: 'trp_test_layout_in_use',
      vehicle_id: vehicleId,
      vehicle_plate: '29B-555.66',
      departure_time: '2026-08-28T14:00:00+07:00',
      status: 'SCHEDULED',
      booked_seats: 5,
      total_seats: 34,
      operator_id: 'op_saomai'
    });

    // Patch the layout
    const patchLayout = await request(`/api/v1/ops/seat-layouts/${layoutId}`, {
      method: 'PATCH',
      token: dispatcher,
      body: { name: 'Custom Đổi Tên' }
    });
    assert.strictEqual(patchLayout.status, 409);
    assert.strictEqual(patchLayout.body.code, 'LAYOUT_IN_USE');

    // Remove trip and delete
    services.managerService.trips = services.managerService.trips.filter(t => t.trip_id !== 'trp_test_layout_in_use');
    services.managerService.vehicles = services.managerService.vehicles.filter(v => v.vehicle_id !== vehicleId);
    const delRes = await request(`/api/v1/ops/seat-layouts/${layoutId}`, { method: 'DELETE', token: dispatcher });
    assert.strictEqual(delRes.status, 200);
  });

  it('a trip given a 45-seat bus shows that bus to passengers: model, seats, 1-deck 5-column map', async () => {
    const added = await request('/api/v1/ops/vehicles', {
      method: 'POST',
      token: dispatcher,
      body: { plate_number: '29B-450.45', model: 'Thaco 45 chỗ', layout_id: 'SEAT_45' }
    });
    assert.strictEqual(added.status, 201);
    const trips = (await request('/api/v1/ops/trips', { token: dispatcher })).body.data;
    const open = (trips.items || trips.trips || trips).find(t => !t.vehicle_id && t.status === 'SCHEDULED' && !t.booked_seats);
    assert.ok(open, 'an unassigned trip with no sales');
    const assigned = await request(`/api/v1/ops/trips/${open.trip_id}/assign`, {
      method: 'POST',
      token: dispatcher,
      body: { vehicle_id: added.body.data.vehicle_id, driver_id: 'drv_9912b' }
    });
    assert.strictEqual(assigned.status, 200);

    const detail = (await request(`/api/v1/trips/${open.trip_id}`)).body.data;
    assert.strictEqual(detail.plate_number, '29B-450.45');
    assert.strictEqual(detail.vehicle_title, 'Thaco 45 chỗ');
    assert.strictEqual(detail.total_seats, 45);
    assert.strictEqual(detail.available_seats_count, 45);
    const map = (await request(`/api/v1/trips/${open.trip_id}/seat-map`)).body.data;
    assert.strictEqual(map.layout_id, 'SEAT_45');
    assert.strictEqual(map.total_decks, 1);
    assert.strictEqual(map.columns, 5);
  });
});
