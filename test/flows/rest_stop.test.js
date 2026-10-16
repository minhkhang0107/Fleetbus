/**
 * OQ-030: the rest-stop badge is derived from the pings (PAX-018 BR-TRACK-004, FLOW-06).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const MIN = 60 * 1000;
const TRIP = 'trp_hn_th_01';
const NINH_BINH = { lat: 20.2503, lng: 105.9741 };

describe('Rest-stop detection (BR-TRACK-004)', () => {
  function bus() {
    const { services } = createFleetBusServer();
    const t0 = Date.now();
    const ping = (minutes, extra) => services.driverService.recordTelemetry(TRIP, { ...extra, mockNow: t0 + minutes * MIN });
    const view = (minutes) => services.trackingService.getLiveTrackingHUD(TRIP, undefined, undefined, t0 + minutes * MIN).data;
    services.driverService.activeTrips.get(TRIP).status = 'IN_TRANSIT';
    return { ping, view };
  }

  it('TC-REST-01: still for over 5 minutes inside a geofence shows the rest-stop status with its name and planned minutes', () => {
    const { ping, view } = bus();
    ping(0, { ...NINH_BINH, speed_kmh: 0 });
    ping(4, { ...NINH_BINH, speed_kmh: 0 });
    assert.strictEqual(view(4).is_at_rest_stop, false, '4 minutes is not enough');
    ping(6, { ...NINH_BINH, speed_kmh: 0 });
    const hud = view(6);
    assert.strictEqual(hud.is_at_rest_stop, true);
    assert.strictEqual(hud.rest_stop_name, 'Trạm dừng nghỉ Ninh Bình');
    assert.strictEqual(hud.estimated_rest_minutes, 20);
    assert.match(hud.hud_status_text, /dừng nghỉ tại Trạm dừng nghỉ Ninh Bình/);
  });

  it('TC-REST-02: moving again, or being still outside any geofence, clears or never sets it', () => {
    const { ping, view } = bus();
    ping(0, { ...NINH_BINH, speed_kmh: 0 });
    ping(7, { ...NINH_BINH, speed_kmh: 0 });
    assert.strictEqual(view(7).is_at_rest_stop, true);
    ping(8, { ...NINH_BINH, speed_kmh: 40 });
    assert.strictEqual(view(8).is_at_rest_stop, false);
    ping(9, { ...NINH_BINH, speed_kmh: 0 });
    ping(12, { ...NINH_BINH, speed_kmh: 0 });
    assert.strictEqual(view(12).is_at_rest_stop, false, 'the 5 minutes start again after the bus moved');

    const roadside = bus();
    roadside.ping(0, { lat: 20.40, lng: 105.95, speed_kmh: 0 });
    roadside.ping(10, { lat: 20.40, lng: 105.95, speed_kmh: 0 });
    assert.strictEqual(roadside.view(10).is_at_rest_stop, false, 'a bus stopped in a traffic jam is not at a rest stop');
  });
});
