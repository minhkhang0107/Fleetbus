/**
 * The company's fixed timetable, edited by its office (MGR-032, D128, D129): each schedule is a departure of a
 * route at a set time on set weekdays. Passengers book two weeks ahead; a new schedule or a change starts on the
 * first day not yet on sale, so no ticket sold ever changes time, fare or day.
 */
import { sendSuccess, sendError, parseJsonBody } from '../middleware/httpUtils.js';
import { MOCK_TRIPS_DATABASE, scheduleView } from '../services/passenger/modules/search.js';
import { parseRunId, scheduleChangeFrom, vnDate } from '../core/serviceDate.js';

const ONE_RE = /^\/api\/v1\/ops\/schedules\/([^/]+)$/;
const CHANGES_RE = /^\/api\/v1\/ops\/schedules\/([^/]+)\/changes$/;

/** Has anyone a seat, a hold or a started trip on this run? */
function inUse(services, tripId) {
  const { paymentService, seatMapService, managerService, driverService } = services;
  if ([...paymentService.tickets.values()].some(t => t.trip_id === tripId)) return true;
  if ([...paymentService.orders.values()].some(o => o.trip_id === tripId)) return true;
  if ([...seatMapService.seatHolds.values()].some(h => h.tripId === tripId)) return true;
  if (managerService.hotlineReservations.some(r => r.tripId === tripId)) return true;
  const ops = managerService.trips.find(t => t.trip_id === tripId);
  if (ops && (ops.status !== 'SCHEDULED' || ops.booked_seats > 0 || ops.held_seats > 0)) return true;
  const drv = driverService.activeTrips.get(tripId);
  return Boolean(drv && drv.status !== 'DISPATCHED');
}

/**
 * Trips already set up from `from` on (before the two-week window, days up to 30 ahead were set up) follow a
 * change: unsold ones are dropped and set up again from the new timetable; sold ones are kept and reported.
 */
function dropStaleRuns(services, scheduleId, from) {
  const kept = [];
  for (const run of MOCK_TRIPS_DATABASE.filter(t => t.schedule_id === scheduleId && (parseRunId(t.trip_id)?.date || '') >= from)) {
    if (inUse(services, run.trip_id)) {
      kept.push({ trip_id: run.trip_id, date: parseRunId(run.trip_id).date });
      continue;
    }
    MOCK_TRIPS_DATABASE.splice(MOCK_TRIPS_DATABASE.indexOf(run), 1);
    services.seatMapService.tripLayouts.delete(run.trip_id);
    const ops = services.managerService.trips.findIndex(t => t.trip_id === run.trip_id);
    if (ops >= 0) services.managerService.trips.splice(ops, 1);
    services.driverService.activeTrips.delete(run.trip_id);
  }
  return kept;
}

export function handleScheduleRoutes(req, res, pathname, parsedUrl, services) {
  if (!pathname.startsWith('/api/v1/ops/schedules')) return false;
  const { searchService, managerService } = services;
  const when = { today: vnDate(), changeFrom: scheduleChangeFrom() };
  const view = (schedule) => scheduleView(schedule, when);

  const audit = (action, resource, before, after) => managerService.recordAudit({
    actor: req.identity?.sub || 'anonymous',
    role: req.identity?.role || null,
    ip: req.socket?.remoteAddress || null,
    operator_id: req.operatorId,
    action,
    resource,
    before,
    after
  });
  const reply = (r, action, status = 200) => {
    if (!r.ok) {
      sendError(res, r.message, r.code, r.status);
      return;
    }
    const after = view(r.schedule);
    const from = r.effective_from ?? (action === 'SCHEDULE_CHANGE_CANCEL' ? when.changeFrom : null);
    const kept = from ? dropStaleRuns(services, after.schedule_id, from) : [];
    audit(action, after.schedule_id, r.before ? view(r.before) : null, after);
    sendSuccess(res, { ...after, effective_from: r.effective_from ?? null, kept_runs: kept }, status);
  };

  if (pathname === '/api/v1/ops/schedules' && req.method === 'GET') {
    const schedules = searchService.listSchedules(req.operatorId, when);
    // The routes a new schedule may run on: those the company already has a schedule for (stops, bus, road).
    const routes = new Map();
    for (const s of schedules) if (!routes.has(s.route_id)) routes.set(s.route_id, s.route_name);
    sendSuccess(res, {
      today: when.today,
      change_from: when.changeFrom,
      schedules,
      routes: [...routes].map(([route_id, name]) => ({ route_id, name }))
    });
    return true;
  }

  if (pathname === '/api/v1/ops/schedules' && req.method === 'POST') {
    parseJsonBody(req).then(body => reply(searchService.createSchedule(req.operatorId, body, when), 'SCHEDULE_CREATE', 201))
      .catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  const one = pathname.match(ONE_RE);
  if (one && req.method === 'PATCH') {
    parseJsonBody(req).then(body => reply(searchService.updateSchedule(req.operatorId, decodeURIComponent(one[1]), body, when), 'SCHEDULE_UPDATE'))
      .catch(err => sendError(res, err.message, 'BAD_REQUEST', 400));
    return true;
  }

  // DELETE /api/v1/ops/schedules/{id}/changes: drop the changes that start on a day not on sale yet.
  const changes = pathname.match(CHANGES_RE);
  if (changes && req.method === 'DELETE') {
    reply(searchService.cancelScheduleChanges(req.operatorId, decodeURIComponent(changes[1]), when), 'SCHEDULE_CHANGE_CANCEL');
    return true;
  }

  return false;
}
