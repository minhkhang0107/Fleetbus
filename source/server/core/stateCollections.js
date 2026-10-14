/**
 * Every piece of working data the server keeps, and whose it is (D127). A record goes to the database of
 * its bus company; the company registry, shared stations, platform staff and security counters that are
 * keyed by a login name (no company known yet) go to the platform database.
 *
 * Data that is code, not records (API catalog, map geometry, rest stops, voucher rules) stays in the code.
 */
import { DEFAULT_OPERATOR_ID, OPERATORS } from './operators.js';
import { PLATFORM_SCOPE } from './tenantDb.js';
import { parseRunId } from './serviceDate.js';
import { groupedCollection, listCollection, mapCollection, objectCollection, setCollection } from './stateStore.js';
import { MOCK_TRIPS_DATABASE, STATIONS_DATABASE, reloadScheduleTemplates } from '../services/passenger/modules/search.js';
import { MOCK_MANAGERS_DB } from '../services/manager/modules/managerService.js';
import { MOCK_DRIVERS_DB } from '../services/driver/modules/driverService.js';

export function stateCollections(services, { idempotency } = {}) {
  const { authService, seatMapService, paymentService, trackingService, driverService, managerService } = services;

  // Read-only lookups: storing must never create or change data (getTripDetail may create a day's run).
  const tripOwner = (tripId) => {
    const run = parseRunId(tripId);
    const id = run ? run.templateId : tripId;
    return MOCK_TRIPS_DATABASE.find(t => t.trip_id === tripId || t.trip_id === id)?.operator_id
      || driverService.activeTrips.get(tripId)?.operator_id
      || managerService.trips.find(t => t.trip_id === tripId)?.operator_id
      || DEFAULT_OPERATOR_ID;
  };
  const own = (v) => v?.operator_id || DEFAULT_OPERATOR_ID;
  const ticketOwner = (ticketId) => paymentService.tickets.get(ticketId)?.operator_id || DEFAULT_OPERATOR_ID;
  const platform = () => PLATFORM_SCOPE;
  // A company id taken from a key (not from a record) must name a registered company, never create a database.
  const registered = (id) => (OPERATORS.some(o => o.operator_id === id) ? id : PLATFORM_SCOPE);

  const collections = [
    // Platform
    listCollection('operators', () => OPERATORS, platform, { platformFirst: true }),
    listCollection('stations', () => STATIONS_DATABASE, platform),
    // Staff accounts: a company's staff in its database, platform admins (no company) in the platform's.
    listCollection('staff_accounts', () => MOCK_MANAGERS_DB, (u) => u.operator_id || PLATFORM_SCOPE),
    mapCollection('staff_login_guard', () => managerService.loginGuard.entries, platform),
    mapCollection('driver_login_guard', () => driverService.loginGuard.entries, platform),

    // Catalog and operations of each company
    listCollection('trips_catalog', () => MOCK_TRIPS_DATABASE, own, { afterRestore: reloadScheduleTemplates }),
    listCollection('driver_accounts', () => MOCK_DRIVERS_DB, own),
    listCollection('ops_vehicles', () => managerService.vehicles, own),
    listCollection('ops_drivers', () => managerService.drivers, own),
    listCollection('ops_routes', () => managerService.routes, own),
    listCollection('ops_trips', () => managerService.trips, own),
    listCollection('ops_bookings', () => managerService.bookings, own),
    listCollection('ops_alerts', () => managerService.alerts, own),
    listCollection('hotline_reservations', () => managerService.hotlineReservations, own),
    listCollection('refund_requests', () => managerService.refundRequests, own),
    listCollection('audit_log', () => managerService.auditLog, own, { freeze: true }),
    // Seat layout templates a company drew for its own buses (D147).
    listCollection('custom_seat_layouts', () => managerService.seatLayouts, own),
    objectCollection('schedule_assignments', () => managerService.scheduleAssignments, (o) => { managerService.scheduleAssignments = o; }, (_, key) => tripOwner(key)),

    // Passengers
    mapCollection('passenger_sessions', () => authService.sessions, (u) => u.operator_id || u.operator?.operator_id || DEFAULT_OPERATOR_ID),
    mapCollection('passenger_otp', () => authService.otpStore, (_, key) => registered(key.split(':')[0])),
    mapCollection('seat_holds', () => seatMapService.seatHolds, (h) => tripOwner(h.tripId)),
    mapCollection('seat_layouts', () => seatMapService.tripLayouts, (_, tripId) => tripOwner(tripId)),
    mapCollection('orders', () => paymentService.orders, own),
    mapCollection('tickets', () => paymentService.tickets, own),
    mapCollection('pnr_index', () => paymentService.pnrIndex, (orderId) => own(paymentService.orders.get(orderId))),
    listCollection('wallet_credits', () => paymentService.walletCredits, own),
    groupedCollection('notifications', () => trackingService.notifications, own),
    listCollection('message_outbox', () => services.messenger?.outbox || [], own),
    mapCollection('passenger_devices', () => services.messenger?.devices || new Map(), own),
    setCollection('notification_keys', () => trackingService.sentNotificationKeys, (s) => { trackingService.sentNotificationKeys = s; }, (key) => ticketOwner(key.split(':')[0])),

    // Trips on the road
    mapCollection('bus_positions', () => trackingService.busPositions, (_, tripId) => tripOwner(tripId)),
    mapCollection('disruptions', () => trackingService.disruptions, (_, tripId) => tripOwner(tripId)),
    mapCollection('rest_stop_watch', () => trackingService.stillSince, (_, tripId) => tripOwner(tripId)),
    mapCollection('driver_trips', () => driverService.activeTrips, own),
    mapCollection('driver_trip_templates', () => driverService.tripTemplates, own),
    listCollection('telemetry_queue', () => driverService.offlineQueue, (p) => tripOwner(p.trip_id)),
    listCollection('incidents', () => driverService.incidents, (i) => tripOwner(i.trip_id))
  ];
  // Replayed answers of mutations: keyed "<operator>:<identity>:...", kept with the company.
  if (idempotency) collections.push(mapCollection('idempotency', () => idempotency.entries, (_, key) => registered(key.split(':')[0])));
  return collections;
}

/** Companies whose databases may hold data. */
export const knownOperatorIds = () => OPERATORS.map(o => o.operator_id);
