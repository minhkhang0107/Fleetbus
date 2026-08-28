import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerSearchService } from '../../source/passenger-app/modules/search.js';

describe('Phase 3: Discovery, Location Picker & Search Test Suite', () => {
  const searchService = new PassengerSearchService();

  it('TC-SEARCH-01: Should search stations by query with diacritics fuzzy matching', () => {
    // "giap bat" without accents should find "Bến xe Giáp Bát"
    const resultsNoAccents = searchService.searchStations('giap bat');
    assert.ok(resultsNoAccents.length > 0);
    assert.strictEqual(resultsNoAccents[0].station_id, 'stp_hn_gb');

    // "thanh hoa" should find both Thanh Hoa stations
    const thResults = searchService.searchStations('thanh hoa');
    assert.ok(thResults.length >= 2);
  });

  it('TC-SEARCH-02: Should search trips from Hanoi to Thanh Hoa and sort by departure time', () => {
    const searchRes = searchService.searchTrips({
      originCity: 'Hà Nội',
      destinationCity: 'Thanh Hóa',
      sortBy: 'DEPARTURE_ASC'
    });

    assert.strictEqual(searchRes.status, 'success');
    assert.ok(searchRes.total_count >= 2);
    // Earliest trip should be 07:00
    assert.strictEqual(searchRes.data[0].trip_id, 'trp_hn_th_01');
  });

  it('TC-SEARCH-03: Should filter trips by vehicle type (VIP_CABIN vs SLEEPER_34)', () => {
    const cabinTrips = searchService.searchTrips({
      originCity: 'Hà Nội',
      destinationCity: 'Thanh Hóa',
      vehicleType: 'VIP_CABIN'
    });

    assert.ok(cabinTrips.data.length > 0);
    cabinTrips.data.forEach(trip => {
      assert.strictEqual(trip.vehicle_type, 'VIP_CABIN');
    });

    const sleeperTrips = searchService.searchTrips({
      originCity: 'Hà Nội',
      destinationCity: 'Thanh Hóa',
      vehicleType: 'SLEEPER_34'
    });

    assert.ok(sleeperTrips.data.length > 0);
    sleeperTrips.data.forEach(trip => {
      assert.strictEqual(trip.vehicle_type, 'SLEEPER_34');
    });
  });

  it('TC-SEARCH-04: Should filter trips by departure time slot', () => {
    const morningTrips = searchService.searchTrips({
      originCity: 'Hà Nội',
      destinationCity: 'Thanh Hóa',
      timeSlot: 'MORNING'
    });

    assert.ok(morningTrips.data.length > 0);
    morningTrips.data.forEach(trip => {
      const h = new Date(trip.departure_time).getHours();
      assert.ok(h >= 5 && h < 12);
    });
  });

  it('TC-SEARCH-05: Should return detailed trip itinerary and amenities in PAX-007', () => {
    const detail = searchService.getTripDetail('trp_hn_th_01');
    assert.strictEqual(detail.success, true);
    assert.strictEqual(detail.data.plate_number, '29B-882.19');
    assert.ok(detail.data.amenities.includes('massage_seat'));
    assert.ok(detail.data.stops.length >= 3);
  });
});
