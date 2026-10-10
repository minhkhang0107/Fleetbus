import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerSeatMapService } from '../../source/server/services/passenger/modules/seatMap.js';

describe('Seat price follows the trip fare', () => {
  const seatMap = new PassengerSeatMapService();
  const priceOf = (tripId) => seatMap.getSeatInfo(tripId, 'A01').price_vnd;

  it('a seat costs the base fare of its trip in the catalog', () => {
    assert.strictEqual(priceOf('trp_hn_th_01'), 220000);
    assert.strictEqual(priceOf('trp_hn_th_02'), 180000);
    assert.strictEqual(priceOf('trp_hn_th_03'), 250000);
    assert.strictEqual(priceOf('trp_xv_hn_th_01'), 200000);
  });

  it('trips only on the ops boards keep the default fare', () => {
    assert.strictEqual(priceOf('trp_991823'), 220000);
  });
});
