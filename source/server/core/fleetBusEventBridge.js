/**
 * FleetBus Realtime Cross-Service Event Bridge
 * Interconnects Passenger Mobile App, Driver Tactical Cockpit, and Manager Operations Center.
 */

import EventEmitter from 'events';
import { operatorOfTrip } from './tenancy.js';
import { findOperatorById } from './operators.js';
import { homeConfirmed } from './serviceAreas.js';
import { expireHomeRequests } from './homeReview.js';
import { DEMO_DATE, addDays, parseRunId, serviceCalendar } from './serviceDate.js';

/** Puts issued tickets on the driver's manifest, once each. */
function addToManifest(driverTrip, tickets) {
  for (const tkt of tickets) {
    const exists = driverTrip.manifest.some(m => m.ticket_id === tkt.ticket_id || (m.pnr === tkt.pnr && m.seat_code === tkt.seat_code));
    if (exists) continue;
    driverTrip.manifest.push({
      ticket_id: tkt.ticket_id,
      pnr: tkt.pnr,
      passenger_name: tkt.passenger_name,
      passenger_phone: tkt.passenger_phone,
      seat_code: tkt.seat_code,
      pickup_stop: tkt.pickup_stop,
      dropoff_stop: tkt.dropoff_stop,
      pickup_stop_id: tkt.pickup_stop_id,
      dropoff_stop_id: tkt.dropoff_stop_id,
      // Only the driver of this trip sees the home address (spec 11).
      // A home request still under review (or refused) is not a stop of the bus (spec 7.3): the
      // passenger boards at the ticket's stop until the office confirms it.
      home_pickup: homeConfirmed(tkt.home_pickup) ? tkt.home_pickup : null,
      home_dropoff: homeConfirmed(tkt.home_dropoff) ? tkt.home_dropoff : null,
      boarding_status: tkt.status === 'BOARDED' ? 'BOARDED' : 'NOT_BOARDED',
      payment_method: 'PREPAID',
      cod_amount_vnd: 0,
      boarded_at: tkt.boarded_at || null
    });
  }
  driverTrip.booked_passengers_count = driverTrip.manifest.length;
}

export class FleetBusEventBridge extends EventEmitter {
  constructor() {
    super();
    this.services = null;
  }

  /**
   * Open a refund request in the manager ledger and return it (MGR-022).
   */
  requestRefund(request) {
    const { managerService } = this.services || {};
    request.operator_id = operatorOfTrip(this.services, request.trip_id);
    if (managerService && typeof managerService.createRefundRequest === 'function') {
      return managerService.createRefundRequest(request);
    }
    return { refund_id: `ref_${Date.now()}`, status: 'REFUND_REQUESTED', ...request };
  }

  /**
   * Bind all active server service instances and setup cross-subsystem event listeners.
   */
  bindServices(services) {
    this.services = services;
    const {
      seatMapService,
      paymentService,
      trackingService,
      driverService,
      managerService
    } = services;

    // Attach event bridge reference to services for seamless emissions
    if (paymentService) paymentService.eventBridge = this;
    if (driverService) driverService.eventBridge = this;
    if (managerService) managerService.eventBridge = this;
    if (trackingService) trackingService.eventBridge = this;
    if (seatMapService) seatMapService.eventBridge = this;
    if (paymentService && seatMapService) paymentService.seatMapService = seatMapService;
    // The stops of a trip, in order: the passenger trip (PAX-008) is the authority, a driver-only trip uses its own
    if (seatMapService) {
      seatMapService.stopsProvider = (tripId) => {
        const passengerTrip = services.searchService?.getTripDetail?.(tripId);
        if (passengerTrip?.success) return passengerTrip.data.stops;
        return driverService?.activeTrips?.get(tripId)?.stops || null;
      };
    }
    // A schedule's run on another day gets its ops and driver trips the first time the office or a sale needs it.
    if (managerService) {
      managerService.runResolver = (tripId) => this.ensureRunOperations(tripId)?.managerTrip || null;
      managerService.runsForDate = (date, operatorId) => this.runsForDate(date, operatorId);
    }
    // PAX-025: the official delay of a trip is the one the manager declared (MGR-024)
    if (paymentService && managerService) {
      paymentService.getTripDelayMinutes = (tripId) => managerService.findTrip(tripId)?.delay_minutes || 0;
    }

    // PAX-017 reissue (D104): the driver manifest follows the QR version the passenger holds,
    // so a revoked QR or PIN no longer boards.
    this.on('TICKET_QR_REISSUED', ({ tripId, ticketId, version }) => {
      if (driverService && typeof driverService.setTicketQrVersion === 'function') {
        driverService.setTicketQrVersion(tripId, ticketId, version);
      }
    });

    // -------------------------------------------------------------------------
    // 1. TICKET_SETTLED: Passenger Booking & VietQR Payment -> Driver & Manager
    // -------------------------------------------------------------------------
    this.on('TICKET_SETTLED', ({ order, tickets }) => {
      const tripId = order.trip_id;
      // A ticket of a day's run must reach a driver and the office: set the run up if nobody has yet.
      this.ensureRunOperations(tripId);

      // A. Seat Map: Permanently lock seats as BOOKED
      if (seatMapService && typeof seatMapService.confirmBooking === 'function') {
        seatMapService.confirmBooking(tripId, order.seat_codes, order.pnr, { pickupStopId: order.pickup_stop_id, dropoffStopId: order.dropoff_stop_id });
      }

      // B. Driver Cockpit: Append newly issued tickets to Driver Manifest
      if (driverService && driverService.activeTrips) {
        const driverTrip = driverService.activeTrips.get(tripId);

        if (driverTrip) {
          addToManifest(driverTrip, tickets);
        }
      }

      // C. Manager Operations: Update Booked Seats, Load Factor & Gross Revenue
      if (managerService) {
        if (managerService.trips) {
          const mgrTrip = managerService.trips.find(t => t.trip_id === tripId);
          if (mgrTrip) {
            mgrTrip.booked_seats = (mgrTrip.booked_seats || 0) + tickets.length;
          }
        }

        if (managerService.bookings) {
          const alreadyLogged = managerService.bookings.some(b => b.pnr === order.pnr);
          if (!alreadyLogged) {
            managerService.bookings.push({
              pnr: order.pnr,
              trip_id: tripId,
              passenger_name: order.payer?.full_name || tickets[0]?.passenger_name || 'Khách Mobile',
              phone: order.payer?.phone || tickets[0]?.passenger_phone,
              seat_codes: order.seat_codes,
              total_fare_vnd: order.amount_vnd,
              payment_status: 'PAID',
              issued_at: new Date().toISOString(),
              channel: 'PASSENGER_APP',
              operator_id: operatorOfTrip(this.services, tripId)
            });
          }
        }
      }

      // D. Passenger Notification: Confirm payment & issue ticket alert
      if (trackingService && typeof trackingService.sendNotification === 'function') {
        const phone = order.payer?.phone || tickets[0]?.passenger_phone;
        if (phone) {
          trackingService.sendNotification(phone, { operatorId: operatorOfTrip(this.services, tripId),
            title: 'Thanh toán thành công & Xuất vé điện tử',
            body: `Mã vé ${order.pnr} cho chuyến xe ${order.route_name || tripId} đã sẵn sàng trong Ví vé!`,
            type: 'PAYMENT_SUCCESS',
            payload: { pnr: order.pnr, trip_id: tripId, ticket_ids: tickets.map(t => t.ticket_id) }
          });
        }
      }
    });

    // -------------------------------------------------------------------------
    // 2. PASSENGER_BOARDED: Driver QR Scan -> Passenger Ticket & Manager Boarded Count
    // -------------------------------------------------------------------------
    this.on('PASSENGER_BOARDED', ({ tripId, passenger, ticketId, pnr, now = Date.now() }) => {
      // Hoist ticket lookup so step B can use it
      let ticket = null;
      if (paymentService && paymentService.tickets) {
        ticket = paymentService.tickets.get(ticketId) || Array.from(paymentService.tickets.values()).find(t => t.pnr === pnr && t.seat_code === passenger?.seat_code);
        if (ticket) {
          ticket.status = 'BOARDED';
          ticket.boarded_at = new Date(now).toISOString();
        }
      }

      // B. Passenger Push Notification: Welcome aboard reminder
      if (trackingService && typeof trackingService.sendNotification === 'function') {
        const phone = passenger?.passenger_phone || passenger?.phone;
        if (phone) {
          let tripDesc = 'chuyến của bạn';
          if (ticket && typeof ticket.route_name === 'string' && ticket.route_name.trim() && ticket.departure_time) {
            const route = ticket.route_name.replace(/\s*\([^)]*\)\s*$/, '').trim();
            const depDate = new Date(ticket.departure_time);
            if (route && !isNaN(depDate.getTime())) {
              const vnDate = new Date(depDate.getTime() + 7 * 60 * 60 * 1000);
              const hh = String(vnDate.getUTCHours()).padStart(2, '0');
              const mm = String(vnDate.getUTCMinutes()).padStart(2, '0');
              const dd = String(vnDate.getUTCDate()).padStart(2, '0');
              const MM = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
              tripDesc = `chuyến ${route} khởi hành ${hh}:${mm} ngày ${dd}/${MM}`;
            }
          }
          const seat = passenger?.seat_code || ticket?.seat_code || 'đã đặt';

          trackingService.sendNotification(phone, { operatorId: operatorOfTrip(this.services, tripId),
            title: 'Chào mừng quý khách lên xe!',
            body: `Bạn đã lên xe ${tripDesc} (Ghế ${seat}). Chúc bạn thượng lộ bình an!`,
            type: 'BOARDING_REMINDER',
            payload: { trip_id: tripId, ticket_id: ticketId, seat_code: passenger?.seat_code }
          });
        }
      }

      // C. Manager Operations: Update boarded metric in trip
      if (managerService && managerService.trips) {
        const mgrTrip = managerService.trips.find(t => t.trip_id === tripId);
        if (mgrTrip) {
          mgrTrip.boarded_passengers = (mgrTrip.boarded_passengers || 0) + 1;
        }
      }
    });

    // -------------------------------------------------------------------------
    // 2b. PASSENGER_NO_SHOW: Driver marks absence -> Passenger ticket, Passenger push & Manager count (DRI-011)
    // -------------------------------------------------------------------------
    this.on('PASSENGER_NO_SHOW', ({ tripId, ticketId, pnr, seatCode, phone, currentStopId = null }) => {
      // OQ-028: the seat is free again from the stop the bus has reached; the part already driven stays sold
      if (seatMapService && seatCode && typeof seatMapService.releaseBooking === 'function') {
        seatMapService.releaseBooking(tripId, [seatCode], { pnr, fromStopId: currentStopId });
      }
      if (paymentService && paymentService.tickets) {
        const ticket = paymentService.tickets.get(ticketId)
          || Array.from(paymentService.tickets.values()).find(t => t.pnr === pnr && t.seat_code === seatCode);
        if (ticket && ticket.status === 'ACTIVE') {
          ticket.status = 'NO_SHOW';
          ticket.no_show_at = new Date().toISOString();
        }
      }
      const mgrTrip = managerService?.findTrip?.(tripId);
      if (mgrTrip) {
        mgrTrip.no_show_passengers = (mgrTrip.no_show_passengers || 0) + 1;
      }
      if (phone && trackingService && typeof trackingService.sendNotification === 'function') {
        trackingService.sendNotification(phone, { operatorId: operatorOfTrip(this.services, tripId),
          title: 'Vé được ghi nhận vắng mặt',
          body: `Tài xế đã ghi nhận bạn vắng mặt tại chuyến ${tripId} (Ghế ${seatCode}). Vui lòng liên hệ tổng đài nếu có nhầm lẫn.`,
          type: 'NO_SHOW',
          payload: { trip_id: tripId, ticket_id: ticketId, seat_code: seatCode }
        });
      }
    });

    // -------------------------------------------------------------------------
    // 2c. TRIP_STARTED: Driver starts the trip -> Manager trip & vehicle go in transit (DRI-005)
    // -------------------------------------------------------------------------
    this.on('TRIP_STARTED', ({ tripId, vehiclePlate }) => {
      // Home requests nobody reviewed before the bus left are refused, the fee refunded (D130).
      expireHomeRequests(this.services, tripId);
      const mgrTrip = managerService?.findTrip?.(tripId);
      if (mgrTrip) mgrTrip.status = 'IN_TRANSIT';
      const vehicle = managerService?.vehicles?.find(v => v.vehicle_id === mgrTrip?.vehicle_id)
        || managerService?.vehicles?.find(v => v.plate_number === vehiclePlate);
      if (vehicle) vehicle.status = 'IN_TRANSIT';
    });

    // -------------------------------------------------------------------------
    // 3. DRIVER_TELEMETRY: Driver GPS Stream -> Passenger Live Radar & Manager 60Hz Radar
    // -------------------------------------------------------------------------
    this.on('DRIVER_TELEMETRY', ({ tripId, telemetry }) => {
      const pingAt = Date.parse(telemetry.timestamp) || Date.now();

      // A. Passenger Live Radar HUD (the age of the position is the age of the ping, not of its arrival)
      if (trackingService && typeof trackingService.updateBusPosition === 'function') {
        trackingService.updateBusPosition(tripId, {
          lat: telemetry.lat,
          lng: telemetry.lng,
          speed_kmh: telemetry.speed_kmh,
          bearing_deg: telemetry.bearing_deg,
          plate_number: telemetry.vehicle_plate,
          seq: telemetry.seq,
          accuracy_m: telemetry.accuracy_m,
          recorded_at: telemetry.recorded_at,
          mockNow: pingAt
        });
        this._notifyApproaching(tripId, pingAt);
      }

      // B. Manager Fleet Radar: the vehicle of the trip, found through the manager trip first and the plate second
      if (managerService && managerService.vehicles) {
        const mgrTrip = managerService.findTrip?.(tripId);
        const vehicle = managerService.vehicles.find(v => v.vehicle_id === mgrTrip?.vehicle_id)
          || managerService.vehicles.find(v => v.plate_number === telemetry.vehicle_plate);
        if (vehicle && pingAt >= (vehicle.last_ping_at || 0)) {
          vehicle.lat = telemetry.lat;
          vehicle.lng = telemetry.lng;
          vehicle.speed_kmh = telemetry.speed_kmh;
          vehicle.heading = telemetry.bearing_deg !== undefined ? telemetry.bearing_deg : vehicle.heading;
          vehicle.last_ping_at = pingAt;
          // The vehicle status follows the trip (TRIP_STARTED, TRIP_COMPLETED), not the speed: a bus stopped at a
          // rest stop is still in transit and must not look like a standby vehicle free for a replacement.
        }
      }
    });

    // -------------------------------------------------------------------------
    // 4. INCIDENT_ALERT: Driver SOS/Incident -> Manager Alert Center & Passenger Push
    // -------------------------------------------------------------------------
    this.on('INCIDENT_ALERT', ({ tripId, incident }) => {
      // A. Manager Operations Alert Center
      if (managerService && managerService.alerts) {
        managerService.alerts.unshift({
          alert_id: incident.incident_id || `alt_${Date.now()}`,
          vehicle_plate: incident.vehicle_plate || '29B-882.19',
          type: incident.type || 'SOS_INCIDENT',
          severity: (incident.type === 'VEHICLE_BREAKDOWN' || incident.type === 'ACCIDENT') ? 'RED' : 'AMBER',
          message: `Chuyến ${tripId}: ${incident.description || 'Có sự cố'} (Dự kiến chậm +${incident.estimated_delay_minutes || 0} phút)`,
          created_at: incident.reported_at || new Date().toISOString(),
          operator_id: operatorOfTrip(this.services, tripId)
        });
      }

      // B. Passenger Radar Disruption Registration & Broadcast
      if (trackingService) {
        if (typeof trackingService.registerDisruption === 'function') {
          trackingService.registerDisruption(tripId, {
            type: incident.type,
            title: 'Cảnh báo tình trạng chuyến xe',
            message: incident.description,
            delay_minutes: incident.estimated_delay_minutes || 0
          });
        }

        // Broadcast notification to all passengers booked on this trip
        if (driverService && driverService.activeTrips) {
          const trip = driverService.activeTrips.get(tripId);
          if (trip && trip.manifest) {
            for (const p of trip.manifest) {
              if (p.passenger_phone) {
                trackingService.sendNotification(p.passenger_phone, { operatorId: operatorOfTrip(this.services, tripId),
                  title: 'Thông báo sự cố chuyến đi',
                  body: `Chuyến ${tripId} gặp sự cố: ${incident.description}. Dự kiến trễ khoảng ${incident.estimated_delay_minutes || 0} phút.`,
                  type: 'DELAY',
                  payload: { trip_id: tripId, incident_id: incident.incident_id }
                });
              }
            }
          }
        }
      }
    });

    // -------------------------------------------------------------------------
    // 5. POS_BOOKING_CREATED: Manager Hotline/Counter POS -> SeatMap, Driver & Payment
    // -------------------------------------------------------------------------
    this.on('POS_BOOKING_CREATED', ({ booking, seatCodes }) => {
      const tripId = booking.trip_id;

      // A. Seat Map: Mark seats as BOOKED
      if (seatMapService && typeof seatMapService.confirmBooking === 'function') {
        seatMapService.confirmBooking(tripId, seatCodes, booking.pnr, { pickupStopId: booking.pickup_stop_id, dropoffStopId: booking.dropoff_stop_id });
      }

      // B. Driver Cockpit Manifest
      if (driverService && driverService.activeTrips) {
        const driverTrip = driverService.activeTrips.get(tripId);
        if (driverTrip) {
          for (const seatCode of seatCodes) {
            const ticketId = `tkt_pos_${booking.pnr.replace('-', '')}_${seatCode}`;
            driverTrip.manifest.push({
              ticket_id: ticketId,
              pnr: booking.pnr,
              passenger_name: booking.passenger_name,
              passenger_phone: booking.phone,
              seat_code: seatCode,
              pickup_stop: 'Bến xe trung tâm (POS)',
              dropoff_stop: 'Bến xe đích (POS)',
              pickup_stop_id: booking.pickup_stop_id,
              dropoff_stop_id: booking.dropoff_stop_id,
              boarding_status: 'NOT_BOARDED',
              payment_method: booking.payment_method || 'CASH_POS',
              cod_amount_vnd: 0,
              boarded_at: null
            });
          }
          driverTrip.booked_passengers_count = driverTrip.manifest.length;
        }
      }

      // C. Payment Service: Record ticket in paymentService for dynamic QR lookup.
      // The ticket carries the real route, departure and fare so cancellation and refunds are computed correctly.
      if (paymentService && paymentService.tickets) {
        const mgrTrip = managerService?.findTrip?.(tripId);
        const route = managerService?.routes?.find(r => r.route_id === mgrTrip?.route_id);
        for (const seatCode of seatCodes) {
          const ticketId = `tkt_pos_${booking.pnr.replace('-', '')}_${seatCode}`;
          paymentService.tickets.set(ticketId, {
            ticket_id: ticketId,
            pnr: booking.pnr,
            order_id: `ord_pos_${booking.pnr}`,
            trip_id: tripId,
            route_name: route?.name || tripId,
            departure_time: mgrTrip?.departure_time || new Date().toISOString(),
            fare_vnd: Math.round(booking.total_fare_vnd / seatCodes.length),
            owner_phone: booking.phone,
            seat_code: seatCode,
            deck: seatMapService?.getSeatInfo?.(tripId, seatCode)?.deck ?? (seatCode.startsWith('A') ? 1 : 2),
            passenger_name: booking.passenger_name,
            passenger_phone: booking.phone,
            pickup_stop: 'Bến xe trung tâm',
            dropoff_stop: 'Bến xe đích',
            pickup_stop_id: booking.pickup_stop_id,
            dropoff_stop_id: booking.dropoff_stop_id,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            boarded_at: null
          });
        }
      }
    });

    this.on('HOTLINE_HOLD_CREATED', ({ tripId, reservation, farePerSeat, operator }) => {
      if (driverService && driverService.activeTrips) {
        const driverTrip = driverService.activeTrips.get(tripId);
        if (driverTrip) {
          for (const seatCode of reservation.seat_codes) {
            const ticketId = `hl_${reservation.reservation_id}_${seatCode}`;
            driverTrip.manifest.push({
              ticket_id: ticketId,
              pnr: reservation.pnr,
              passenger_name: reservation.passenger_name,
              passenger_phone: reservation.phone,
              seat_code: seatCode,
              pickup_stop: driverTrip.stops.find(s => s.stop_id === reservation.pickup_stop_id)?.name || driverTrip.stops[0]?.name || null,
              dropoff_stop: driverTrip.stops.find(s => s.stop_id === reservation.dropoff_stop_id)?.name || driverTrip.stops.at(-1)?.name || null,
              pickup_stop_id: reservation.pickup_stop_id,
              dropoff_stop_id: reservation.dropoff_stop_id,
              boarding_status: 'ISSUED',
              payment_method: 'COD',
              cod_amount_vnd: farePerSeat,
              source: 'HOTLINE',
              reservation_id: reservation.reservation_id,
              boarded_at: null
            });
          }
          driverTrip.booked_passengers_count = driverTrip.manifest.length;
        }
      }
    });

    this.on('HOTLINE_HOLD_RELEASED', ({ tripId, reservationId }) => {
      if (driverService && driverService.activeTrips) {
        const driverTrip = driverService.activeTrips.get(tripId);
        if (driverTrip) {
          driverTrip.manifest = driverTrip.manifest.filter(m => m.reservation_id !== reservationId || m.boarding_status === 'BOARDED');
          driverTrip.booked_passengers_count = driverTrip.manifest.length;
        }
      }
    });

    this.on('HOTLINE_HOLD_CONVERTED', ({ tripId, reservationId, seatCode }) => {
      if (managerService && managerService.hotlineReservations) {
        const rsv = managerService.hotlineReservations.find(r => r.reservation_id === reservationId);
        if (rsv && rsv.hold_status === 'HELD_HOTLINE') {
          // Initialize tracking of converted seats
          if (!rsv.converted_seats) rsv.converted_seats = [];
          if (!rsv.converted_seats.includes(seatCode)) rsv.converted_seats.push(seatCode);

          if (rsv.converted_seats.length === rsv.seat_codes.length) {
            rsv.hold_status = 'CONVERTED';
            rsv.converted_at = new Date().toISOString();
            
            // Move from held to booked
            const trip = managerService.findTrip(tripId);
            if (trip) {
              trip.held_seats = Math.max(0, (trip.held_seats || 0) - rsv.seat_codes.length);
              trip.booked_seats = (trip.booked_seats || 0) + rsv.seat_codes.length;
            }
          }
        }
      }
    });

    // A phone hold whose pickup stop the bus has left is released (the passenger did not board).
    this.on('STOP_ARRIVED', ({ tripId, stopId }) => {
      managerService?.releaseExpiredHotlineHolds?.();
      // Spec 9: "the bus is at your pickup", once per ticket.
      const trip = driverService?.activeTrips?.get(tripId);
      const stop = trip?.stops?.find(s => s.stop_id === stopId);
      for (const p of this._waitingAtStops(trip)) {
        if (p.pickup_stop_id !== stopId) continue;
        trackingService?.sendNotificationOnce?.(`${p.ticket_id}:PICKUP_ARRIVED`, p.passenger_phone, {
          operatorId: operatorOfTrip(this.services, tripId),
          title: 'Xe đã tới điểm đón',
          body: `Xe ${trip.vehicle_plate} đã tới ${stop?.name || 'điểm đón'}. Mời bạn lên xe, ghế ${p.seat_code}.`,
          type: 'PICKUP_ARRIVED',
          payload: { trip_id: tripId, ticket_id: p.ticket_id, stop_id: stopId }
        });
      }
    });

    // Spec A9: a home pickup the bus cannot reach. The passenger is told once, the ticket keeps the note, and the
    // office gets an alert to arrange the pickup (call the passenger, send a smaller vehicle).
    // D143: the driver set off to collect the home pickups; each passenger waiting at home can now follow the bus.
    this.on('HOME_RUN_STARTED', ({ tripId, vehiclePlate, passengers, now = Date.now() }) => {
      const operatorId = operatorOfTrip(this.services, tripId);
      for (const p of passengers) {
        if (!p.phone) continue;
        trackingService?.sendNotificationOnce?.(`${p.ticket_id}:HOME_RUN_STARTED`, p.phone, {
          operatorId,
          title: 'Tài xế đã lên đường đón bạn',
          body: `Xe ${vehiclePlate} đang đi đón khách tận nhà. Mở "Theo dõi xe" để xem xe đang ở đâu và khi nào tới ${p.address}.`,
          type: 'HOME_RUN_STARTED',
          payload: { trip_id: tripId, ticket_id: p.ticket_id, at: new Date(now).toISOString() }
        });
      }
    });

    this.on('HOME_PICKUP_INACCESSIBLE', ({ tripId, ticketId, seatCode, phone, address, reason, meetingPoint, vehiclePlate, now = Date.now() }) => {
      const operatorId = operatorOfTrip(this.services, tripId);
      const ticket = paymentService?.tickets?.get(ticketId);
      if (ticket?.home_pickup) ticket.home_pickup = { ...ticket.home_pickup, inaccessible_at: new Date(now).toISOString(), inaccessible_reason: reason, meeting_point: meetingPoint };
      trackingService?.sendNotificationOnce?.(`${ticketId}:HOME_PICKUP_INACCESSIBLE`, phone || ticket?.passenger_phone, {
        operatorId,
        title: 'Xe không vào được địa chỉ đón',
        body: meetingPoint
          ? `Tài xế xe ${vehiclePlate} không vào được ${address} (${reason}). Mời bạn ra ${meetingPoint}; tài xế sẽ gọi cho bạn.`
          : `Tài xế xe ${vehiclePlate} không vào được ${address} (${reason}). Tài xế hoặc nhà xe sẽ gọi để hẹn điểm đón.`,
        type: 'HOME_PICKUP_INACCESSIBLE',
        payload: { trip_id: tripId, ticket_id: ticketId, meeting_point: meetingPoint }
      });
      managerService?.alerts?.unshift?.({
        alert_id: `alt_inacc_${ticketId}`,
        vehicle_plate: vehiclePlate,
        type: 'HOME_PICKUP_INACCESSIBLE',
        severity: 'AMBER',
        message: `Ghế ${seatCode}: xe không vào được ${address} (${reason})${meetingPoint ? `, hẹn khách ở ${meetingPoint}` : ''}`,
        created_at: new Date(now).toISOString(),
        operator_id: operatorId,
        trip_id: tripId
      });
    });

    // MGR-017: the office gave a trip its bus and driver. The driver trip follows; passengers who already have a
    // ticket are told once per new pair when the bus or the driver changed (spec 9).
    this.on('TRIP_ASSIGNED', ({ tripId, vehiclePlate, vehicleModel, capacity, driverId, driverName, previous }) => {
      const detail = services.searchService?.getTripDetail?.(tripId);
      const catalogTrip = detail?.success ? detail.data : null;
      const driverTrip = driverService?.applyAssignment?.(tripId, { driverId, vehiclePlate, vehicleModel, capacity }, catalogTrip, parseRunId(tripId)?.templateId || null);
      // Tickets sold before the office gave the trip a driver must reach that driver too.
      if (driverTrip && paymentService?.tickets) {
        addToManifest(driverTrip, [...paymentService.tickets.values()].filter(t => t.trip_id === tripId && ['ACTIVE', 'BOARDED'].includes(t.status)));
      }
      const changed = (previous?.vehicle_plate && previous.vehicle_plate !== vehiclePlate) || (previous?.driver_id && previous.driver_id !== driverId);
      if (!changed || !paymentService?.tickets || !trackingService?.sendNotificationOnce) return;
      const at = catalogTrip?.departure_time ? new Date(Date.parse(catalogTrip.departure_time) + 7 * 3600000).toISOString() : null;
      const when = at ? `${at.slice(11, 16)} ngày ${at.slice(8, 10)}/${at.slice(5, 7)}` : tripId;
      for (const ticket of paymentService.tickets.values()) {
        if (ticket.trip_id !== tripId || !['ACTIVE', 'BOARDED'].includes(ticket.status)) continue;
        trackingService.sendNotificationOnce(`${ticket.ticket_id}:ASSIGNED:${vehiclePlate}:${driverId}`, ticket.passenger_phone, {
          operatorId: operatorOfTrip(this.services, tripId),
          title: 'Nhà xe đổi xe hoặc tài xế',
          body: `Chuyến ${when} của bạn chạy xe ${vehiclePlate}, tài xế ${driverName}. Vé và ghế ${ticket.seat_code} giữ nguyên.`,
          type: 'TRIP_REASSIGNED',
          payload: { trip_id: tripId, ticket_id: ticket.ticket_id, vehicle_plate: vehiclePlate }
        });
      }
    });

    // -------------------------------------------------------------------------
    // 6. VEHICLE_SWAPPED: Manager Emergency Swap -> Driver Vehicle Plate & Passenger Disruption
    // -------------------------------------------------------------------------
    this.on('VEHICLE_SWAPPED', ({ tripId, oldPlate, newPlate, newDriverId = null, reason }) => {
      // A. Driver Cockpit: the trip moves to the new vehicle and, when named, to the new driver
      if (driverService && typeof driverService.reassignTrip === 'function') {
        driverService.reassignTrip(tripId, { vehiclePlate: newPlate, driverId: newDriverId });
      }

      // B. Passenger Radar: Register vehicle replacement disruption & notify passengers
      if (trackingService) {
        if (typeof trackingService.registerDisruption === 'function') {
          trackingService.registerDisruption(tripId, {
            type: 'VEHICLE_REPLACEMENT',
            title: 'Thông báo điều xe thay thế khẩn cấp',
            message: `Chuyến xe đã được chuyển sang xe biển số ${newPlate}. Lý do: ${reason}`,
            new_plate_number: newPlate
          });
        }

        if (driverService && driverService.activeTrips) {
          const trip = driverService.activeTrips.get(tripId);
          if (trip && trip.manifest) {
            for (const p of trip.manifest) {
              if (p.passenger_phone) {
                trackingService.sendNotification(p.passenger_phone, { operatorId: operatorOfTrip(this.services, tripId),
                  title: 'Đổi xe khẩn cấp',
                  body: `Chuyến xe của bạn được chuyển sang xe biển số mới ${newPlate} do: ${reason}. Vị trí ghế của bạn được giữ nguyên!`,
                  type: 'SWAP',
                  payload: { trip_id: tripId, old_plate: oldPlate, new_plate: newPlate }
                });
              }
            }
          }
        }
      }
    });

    // -------------------------------------------------------------------------
    // 7. TRIP_DELAYED: Manager Delay Broadcast -> Driver & Passenger
    // -------------------------------------------------------------------------
    this.on('TRIP_DELAYED', ({ tripId, delayMinutes, reason }) => {
      if (driverService && driverService.activeTrips) {
        const trip = driverService.activeTrips.get(tripId);
        if (trip) {
          trip.delay_minutes = delayMinutes;
        }
      }

      if (trackingService) {
        if (typeof trackingService.registerDisruption === 'function') {
          trackingService.registerDisruption(tripId, {
            type: 'TRIP_DELAY',
            title: 'Thông báo điều chỉnh giờ khởi hành',
            message: `Chuyến xe dự kiến khởi hành chậm ${delayMinutes} phút do ${reason}`,
            delay_minutes: delayMinutes
          });
        }

        if (driverService && driverService.activeTrips) {
          const trip = driverService.activeTrips.get(tripId);
          if (trip && trip.manifest) {
            for (const p of trip.manifest) {
              if (p.passenger_phone) {
                trackingService.sendNotification(p.passenger_phone, { operatorId: operatorOfTrip(this.services, tripId),
                  title: 'Thông báo trễ chuyến',
                  body: `Chuyến đi bị hoãn ${delayMinutes} phút do ${reason}. Quý khách vui lòng theo dõi trên Radar trực tiếp.`,
                  type: 'DELAY',
                  payload: { trip_id: tripId, delay_minutes: delayMinutes }
                });
              }
            }
          }
        }
      }
    });

    // -------------------------------------------------------------------------
    // 8. TICKET_CANCELLED: Passenger Cancel & Refund -> SeatMap, Driver & Manager
    // -------------------------------------------------------------------------
    this.on('TICKET_CANCELLED', ({ ticketId, pnr, tripId, seatCode }) => {
      let resolvedTripId = tripId;
      let resolvedSeatCode = seatCode;
      let resolvedPnr = pnr;

      // A. Payment Service: Update ticket status
      if (paymentService && paymentService.tickets) {
        const ticket = paymentService.tickets.get(ticketId) || Array.from(paymentService.tickets.values()).find(t => t.pnr === pnr);
        if (ticket) {
          ticket.status = 'CANCELLED';
          if (!resolvedTripId) resolvedTripId = ticket.trip_id;
          if (!resolvedSeatCode) resolvedSeatCode = ticket.seat_code;
          if (!resolvedPnr) resolvedPnr = ticket.pnr;
        }
      }

      // B. Seat Map: Release seat back to AVAILABLE
      if (seatMapService && resolvedTripId && resolvedSeatCode && typeof seatMapService.releaseBooking === 'function') {
        seatMapService.releaseBooking(resolvedTripId, [resolvedSeatCode], { pnr: resolvedPnr });
      }

      // B2. Manager: one seat less sold on the trip
      if (managerService && managerService.trips && resolvedTripId) {
        const mgrTrip = managerService.trips.find(t => t.trip_id === resolvedTripId);
        if (mgrTrip) {
          mgrTrip.booked_seats = Math.max(0, (mgrTrip.booked_seats || 0) - 1);
        }
      }

      // C. Driver Manifest: Update status to CANCELLED
      if (driverService && driverService.activeTrips) {
        const trip = driverService.activeTrips.get(resolvedTripId);
        if (trip && trip.manifest) {
          const item = trip.manifest.find(m => m.ticket_id === ticketId || (m.pnr === resolvedPnr && m.seat_code === resolvedSeatCode));
          if (item) {
            item.boarding_status = 'CANCELLED';
          }
        }
      }

      // The refund request is opened by the cancellation itself and waits for manager approval (MGR-022).
    });

    // -------------------------------------------------------------------------
    // 8b. PAYMENT_OVERDUE / PAYMENT_ANOMALY: money received but order cannot be fulfilled (OQ-008)
    // -------------------------------------------------------------------------
    this.on('PAYMENT_OVERDUE', ({ order, amountVnd }) => {
      this.requestRefund({
        pnr: order.pnr,
        trip_id: order.trip_id,
        amount_vnd: amountVnd,
        reason: 'Thanh toán đến sau khi hết hạn giữ chỗ (UNMATCHED_OVERDUE)',
        source: 'UNMATCHED_OVERDUE'
      });
      if (managerService && managerService.alerts) {
        managerService.alerts.unshift({
          alert_id: `alt_overdue_${Date.now()}`,
          vehicle_plate: null,
          type: 'PAYMENT_UNMATCHED_OVERDUE',
          severity: 'AMBER',
          message: `Đơn ${order.pnr} nhận ${amountVnd} đ sau khi hết hạn. Đã tạo yêu cầu hoàn tiền`,
          created_at: new Date().toISOString(),
          operator_id: operatorOfTrip(this.services, order.trip_id)
        });
      }
    });

    this.on('PAYMENT_ANOMALY', ({ order, receivedVnd }) => {
      if (managerService && managerService.alerts) {
        managerService.alerts.unshift({
          alert_id: `alt_amount_${Date.now()}`,
          vehicle_plate: null,
          type: 'PAYMENT_AMOUNT_MISMATCH',
          severity: 'AMBER',
          message: `Đơn ${order.pnr} nhận ${receivedVnd} đ, cần ${order.amount_vnd} đ. Chưa xuất vé`,
          created_at: new Date().toISOString(),
          operator_id: operatorOfTrip(this.services, order.trip_id)
        });
      }
    });

    // -------------------------------------------------------------------------
    // 8c. COD_COLLECTED / HAIL_BOARDED / WALLET_CREDIT_REQUESTED: driver cash events -> Manager & Passenger wallet
    // -------------------------------------------------------------------------
    this.on('COD_COLLECTED', ({ pnr, fareVnd }) => {
      const booking = managerService?.bookings?.find(b => b.pnr === pnr);
      if (booking) {
        booking.payment_status = 'PAID';
        booking.cod_collected_vnd = (booking.cod_collected_vnd || 0) + fareVnd;
      }
    });

    this.on('HAIL_BOARDED', ({ tripId, passenger, fareVnd }) => {
      // The seat is sold for good in the shared inventory (OQ-014)
      if (seatMapService && typeof seatMapService.confirmBooking === 'function') {
        seatMapService.confirmBooking(tripId, [passenger.seat_code], passenger.pnr, { pickupStopId: passenger.pickup_stop_id, dropoffStopId: passenger.dropoff_stop_id });
      }
      if (!managerService) return;
      const mgrTrip = managerService.trips?.find(t => t.trip_id === tripId);
      if (mgrTrip) {
        mgrTrip.booked_seats = (mgrTrip.booked_seats || 0) + 1;
        mgrTrip.boarded_passengers = (mgrTrip.boarded_passengers || 0) + 1;
        mgrTrip.on_board = (mgrTrip.boarded_passengers || 0) - (mgrTrip.alighted_passengers || 0);
        mgrTrip.on_board_count = mgrTrip.on_board;
      }
      if (managerService.bookings && !managerService.bookings.some(b => b.pnr === passenger.pnr)) {
        managerService.bookings.push({
          pnr: passenger.pnr,
          trip_id: tripId,
          passenger_name: passenger.passenger_name,
          phone: passenger.passenger_phone || null,
          seat_codes: [passenger.seat_code],
          total_fare_vnd: fareVnd,
          payment_status: 'PAID',
          issued_at: new Date().toISOString(),
          channel: 'DRIVER_HAIL',
          operator_id: operatorOfTrip(this.services, tripId)
        });
      }
    });

    this.on('PASSENGERS_ALIGHTED', ({ tripId, ticketIds }) => {
      if (!managerService) return;
      const mgrTrip = managerService.trips?.find(t => t.trip_id === tripId);
      if (mgrTrip) {
        mgrTrip.alighted_passengers = (mgrTrip.alighted_passengers || 0) + ticketIds.length;
        mgrTrip.on_board = (mgrTrip.boarded_passengers || 0) - mgrTrip.alighted_passengers;
        mgrTrip.on_board_count = mgrTrip.on_board;
      }
    });

    this.on('WALLET_CREDIT_REQUESTED', ({ tripId, ticketId, phone, amountVnd }) => {
      if (paymentService && typeof paymentService.creditWallet === 'function') {
        paymentService.creditWallet(phone, amountVnd, ticketId, 'Tiền thừa khi lên xe', operatorOfTrip(this.services, tripId));
      }
    });

    // -------------------------------------------------------------------------
    // 9. TRIP_COMPLETED: Driver End Trip -> Manager Status
    // -------------------------------------------------------------------------
    this.on('TRIP_COMPLETED', ({ tripId, summary }) => {
      // PAX-016: tickets of a finished trip belong to the history tab
      if (paymentService && paymentService.tickets) {
        for (const ticket of paymentService.tickets.values()) {
          if (ticket.trip_id === tripId) ticket.trip_completed = true;
        }
      }
      if (managerService) {
        if (managerService.trips) {
          const trip = managerService.findTrip(tripId);
          if (trip) {
            trip.status = 'COMPLETED';
          }
        }
        if (managerService.vehicles) {
          const veh = managerService.vehicles.find(v => v.plate_number === summary?.vehicle_plate);
          if (veh) {
            veh.status = 'STANDBY';
            veh.speed_kmh = 0;
          }
        }
      }
    });
  }

  /** Passengers still to be picked up at a stop (home pickups wait at home, not at the stop). */
  _waitingAtStops(trip) {
    // A home request still pending or refused rides from the stop, so that passenger waits there (D130).
    return (trip?.manifest || []).filter(p => p.passenger_phone && !homeConfirmed(p.home_pickup) && !['BOARDED', 'NO_SHOW', 'CANCELLED'].includes(p.boarding_status));
  }

  /**
   * Spec 9: "the bus is approaching your pickup" once per ticket, when the along-road ETA from a live position is
   * within the company's threshold (approaching_threshold_minutes), never from a stale position or by distance alone.
   */
  _notifyApproaching(tripId, now = Date.now()) {
    const { driverService, trackingService } = this.services;
    const trip = driverService?.activeTrips?.get(tripId);
    if (!trip || typeof trackingService?.getTripRadar !== 'function') return;
    const homeRun = Boolean(trip.home_run_started_at) && !['COMPLETED', 'CANCELLED'].includes(trip.status);
    if (trip.status !== 'IN_TRANSIT' && !homeRun) return;
    const operatorId = operatorOfTrip(this.services, tripId);
    const threshold = findOperatorById(operatorId)?.service_config?.approaching_threshold_minutes ?? 10;
    this._notifyHomeApproaching(trip, operatorId, threshold, now);
    if (trip.status !== 'IN_TRANSIT') return;
    const waiting = this._waitingAtStops(trip);
    const byStop = new Map();
    for (const p of waiting) byStop.set(p.pickup_stop_id, [...(byStop.get(p.pickup_stop_id) || []), p]);
    for (const [stopId, passengers] of byStop) {
      const stop = trip.stops?.find(s => s.stop_id === stopId);
      if (!stop || stop.status === 'ARRIVED') continue;
      const radar = trackingService.getTripRadar(tripId, { pickupStopId: stopId, stops: trip.stops, canSeeBus: true, view: 'TICKET', mockNow: now }).data;
      if (!radar?.has_position || radar.has_passed_target || radar.freshness?.state !== 'LIVE') continue;
      if (!Number.isFinite(radar.eta_minutes) || radar.eta_minutes > threshold) continue;
      for (const p of passengers) {
        trackingService.sendNotificationOnce(`${p.ticket_id}:PICKUP_APPROACHING`, p.passenger_phone, {
          operatorId,
          title: 'Xe sắp tới điểm đón',
          body: `Xe ${trip.vehicle_plate} còn khoảng ${radar.eta_minutes} phút nữa tới ${stop.name}. Bạn chuẩn bị ra điểm đón nhé.`,
          type: 'PICKUP_APPROACHING',
          payload: { trip_id: tripId, ticket_id: p.ticket_id, stop_id: stopId, eta_minutes: radar.eta_minutes }
        });
      }
    }
  }

  /**
   * D143: each passenger waiting at home hears once when the bus is within the threshold of the address, and once
   * when it is at the door, from a live position only.
   */
  _notifyHomeApproaching(trip, operatorId, threshold, now) {
    const { driverService, trackingService } = this.services;
    for (const p of driverService.homePickupsWaiting?.(trip) || []) {
      const home = p.home_pickup;
      if (!p.passenger_phone || !Number.isFinite(home.lat) || !Number.isFinite(home.lng)) continue;
      const radar = trackingService.getTripRadar(trip.trip_id, {
        pickupStopId: p.pickup_stop_id, stops: trip.stops, canSeeBus: true, view: 'TICKET', mockNow: now,
        homePickup: { lat: home.lat, lng: home.lng, address: home.address, window_from: home.window_from, window_to: home.window_to }
      }).data;
      if (!radar?.has_position || radar.freshness?.state !== 'LIVE' || !Number.isFinite(radar.eta_minutes)) continue;
      const payload = { trip_id: trip.trip_id, ticket_id: p.ticket_id, eta_minutes: radar.eta_minutes };
      if (radar.is_at_station) {
        trackingService.sendNotificationOnce(`${p.ticket_id}:HOME_PICKUP_ARRIVED`, p.passenger_phone, {
          operatorId,
          title: 'Xe đã tới gần chỗ đón',
          body: `Xe ${trip.vehicle_plate} đã tới gần ${home.address}. Mời bạn ra xe, ghế ${p.seat_code}.`,
          type: 'HOME_PICKUP_ARRIVED',
          payload
        });
      } else if (radar.eta_minutes <= threshold) {
        trackingService.sendNotificationOnce(`${p.ticket_id}:PICKUP_APPROACHING`, p.passenger_phone, {
          operatorId,
          title: 'Xe sắp tới đón bạn',
          body: `Xe ${trip.vehicle_plate} còn khoảng ${radar.eta_minutes} phút nữa tới ${home.address}. Bạn chuẩn bị ra xe nhé.`,
          type: 'PICKUP_APPROACHING',
          payload
        });
      }
    }
  }

  /**
   * Sets up the ops and driver trips of a schedule's run (`<schedule>_<YYYYMMDD>`) from the schedule: same route,
   * bus and driver, nothing sold. Returns { managerTrip, driverTrip } or null for anything else.
   */
  ensureRunOperations(tripId) {
    const { searchService, managerService, driverService } = this.services || {};
    const run = parseRunId(tripId);
    if (!run || !searchService) return null;
    const detail = searchService.getTripDetail(tripId);
    if (!detail?.success) return null;
    const trip = detail.data;
    const managerTrip = managerService?.trips?.find(t => t.trip_id === tripId) || managerService?.createRunTrip?.(run.templateId, tripId, trip) || null;
    const driverTrip = driverService?.createRunTrip?.(run.templateId, tripId, trip.departure_time) || null;
    return { managerTrip, driverTrip };
  }

  /** The runs of every schedule of a company on a day, set up for the office's board (days around the window only). */
  runsForDate(date, operatorId) {
    const { searchService } = this.services || {};
    if (!searchService?.materializeRun) return [];
    const { today, last_date: last } = serviceCalendar();
    if (date !== DEMO_DATE && (date < addDays(today, -1) || date > last)) return [];
    const scheduled = searchService.schedulesOf(operatorId)
      .map(id => searchService.materializeRun(id, date))
      .filter(Boolean);
    // A run already set up on a day its schedule no longer runs still carries its passengers (D128).
    const kept = searchService.existingRunsOn(date, operatorId).filter(t => !scheduled.includes(t));
    return [...scheduled, ...kept]
      .map(t => (parseRunId(t.trip_id) ? this.ensureRunOperations(t.trip_id)?.managerTrip?.trip_id : t.trip_id))
      .filter(Boolean);
  }
}

export const globalEventBridge = new FleetBusEventBridge();
