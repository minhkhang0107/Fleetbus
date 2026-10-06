/**
 * FleetBus Realtime Cross-Service Event Bridge
 * Interconnects Passenger Mobile App, Driver Tactical Cockpit, and Manager Operations Center.
 */

import EventEmitter from 'events';

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

    // -------------------------------------------------------------------------
    // 1. TICKET_SETTLED: Passenger Booking & VietQR Payment -> Driver & Manager
    // -------------------------------------------------------------------------
    this.on('TICKET_SETTLED', ({ order, tickets }) => {
      const tripId = order.trip_id;

      // A. Seat Map: Permanently lock seats as BOOKED
      if (seatMapService && typeof seatMapService.confirmBooking === 'function') {
        seatMapService.confirmBooking(tripId, order.seat_codes);
      }

      // B. Driver Cockpit: Append newly issued tickets to Driver Manifest
      if (driverService && driverService.activeTrips) {
        const driverTrip = driverService.activeTrips.get(tripId);

        if (driverTrip) {
          for (const tkt of tickets) {
            const exists = driverTrip.manifest.some(m => m.ticket_id === tkt.ticket_id || (m.pnr === tkt.pnr && m.seat_code === tkt.seat_code));
            if (!exists) {
              driverTrip.manifest.push({
                ticket_id: tkt.ticket_id,
                pnr: tkt.pnr,
                passenger_name: tkt.passenger_name,
                passenger_phone: tkt.passenger_phone,
                seat_code: tkt.seat_code,
                pickup_stop: tkt.pickup_stop,
                dropoff_stop: tkt.dropoff_stop,
                boarding_status: 'NOT_BOARDED',
                payment_method: 'PREPAID',
                cod_amount_vnd: 0,
                boarded_at: null
              });
            }
          }
          driverTrip.booked_passengers_count = driverTrip.manifest.length;
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
              channel: 'PASSENGER_APP'
            });
          }
        }
      }

      // D. Passenger Notification: Confirm payment & issue ticket alert
      if (trackingService && typeof trackingService.sendNotification === 'function') {
        const phone = order.payer?.phone || tickets[0]?.passenger_phone;
        if (phone) {
          trackingService.sendNotification(phone, {
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
      // A. Passenger Wallet: Mark ticket as BOARDED in payment service
      if (paymentService && paymentService.tickets) {
        const ticket = paymentService.tickets.get(ticketId) || Array.from(paymentService.tickets.values()).find(t => t.pnr === pnr && t.seat_code === passenger?.seat_code);
        if (ticket) {
          ticket.status = 'BOARDED';
          ticket.boarded_at = new Date(now).toISOString();
        }
      }

      // B. Passenger Push Notification: Welcome aboard reminder
      if (trackingService && typeof trackingService.sendNotification === 'function') {
        const phone = passenger?.passenger_phone || passenger?.phone;
        if (phone) {
          trackingService.sendNotification(phone, {
            title: 'Chào mừng quý khách lên xe!',
            body: `Bạn đã hoàn tất soát vé lên xe chuyến ${tripId} (Ghế ${passenger?.seat_code || 'đã đặt'}). Chúc bạn chuyến đi thượng lộ bình an!`,
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
    // 3. DRIVER_TELEMETRY: Driver GPS Stream -> Passenger Live Radar & Manager 60Hz Radar
    // -------------------------------------------------------------------------
    this.on('DRIVER_TELEMETRY', ({ tripId, telemetry }) => {
      // A. Passenger Live Radar HUD
      if (trackingService && typeof trackingService.updateBusPosition === 'function') {
        trackingService.updateBusPosition(tripId, {
          lat: telemetry.lat,
          lng: telemetry.lng,
          speed_kmh: telemetry.speed_kmh,
          bearing_deg: telemetry.bearing_deg,
          plate_number: telemetry.vehicle_plate
        });
      }

      // B. Manager 60Hz Fleet Radar Map
      if (managerService && managerService.vehicles) {
        const vehicle = managerService.vehicles.find(v => v.plate_number === telemetry.vehicle_plate || v.vehicle_id === telemetry.vehicle_id);
        if (vehicle) {
          vehicle.lat = telemetry.lat;
          vehicle.lng = telemetry.lng;
          vehicle.speed_kmh = telemetry.speed_kmh;
          vehicle.heading = telemetry.bearing_deg !== undefined ? telemetry.bearing_deg : vehicle.heading;
          vehicle.status = telemetry.speed_kmh > 0 ? 'IN_TRANSIT' : 'STANDBY';
          vehicle.gps_status = 'LIVE';
          vehicle.gps_health = 'LIVE';
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
          created_at: incident.reported_at || new Date().toISOString()
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
                trackingService.sendNotification(p.passenger_phone, {
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
        seatMapService.confirmBooking(tripId, seatCodes);
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
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            boarded_at: null
          });
        }
      }
    });

    // -------------------------------------------------------------------------
    // 6. VEHICLE_SWAPPED: Manager Emergency Swap -> Driver Vehicle Plate & Passenger Disruption
    // -------------------------------------------------------------------------
    this.on('VEHICLE_SWAPPED', ({ tripId, oldPlate, newPlate, reason }) => {
      // A. Driver Cockpit: Update assigned vehicle plate
      if (driverService && driverService.activeTrips) {
        const trip = driverService.activeTrips.get(tripId);
        if (trip) {
          trip.vehicle_plate = newPlate;
        }
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
                trackingService.sendNotification(p.passenger_phone, {
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
                trackingService.sendNotification(p.passenger_phone, {
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
        seatMapService.releaseBooking(resolvedTripId, [resolvedSeatCode]);
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
          created_at: new Date().toISOString()
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
          created_at: new Date().toISOString()
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
        seatMapService.confirmBooking(tripId, [passenger.seat_code]);
      }
      if (!managerService) return;
      const mgrTrip = managerService.trips?.find(t => t.trip_id === tripId);
      if (mgrTrip) {
        mgrTrip.booked_seats = (mgrTrip.booked_seats || 0) + 1;
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
          channel: 'DRIVER_HAIL'
        });
      }
    });

    this.on('WALLET_CREDIT_REQUESTED', ({ ticketId, phone, amountVnd }) => {
      if (paymentService && typeof paymentService.creditWallet === 'function') {
        paymentService.creditWallet(phone, amountVnd, ticketId, 'Tiền thừa khi lên xe');
      }
    });

    // -------------------------------------------------------------------------
    // 9. TRIP_COMPLETED: Driver End Trip -> Manager Status
    // -------------------------------------------------------------------------
    this.on('TRIP_COMPLETED', ({ tripId, summary }) => {
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
}

export const globalEventBridge = new FleetBusEventBridge();
