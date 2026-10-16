/**
 * FleetBus Mobile Passenger Domain Entities
 * Covers PAX-001 through PAX-025 for Flutter Android & iOS Client.
 */

enum SeatState { available, selected, lockedByOther, booked, maintenance }
enum VehicleType { vipCabin, sleeper34, limousine }
enum TicketStatus { active, boarded, cancelled, refunded }

class PassengerTrip {
  final String tripId;
  final String routeName;
  final VehicleType vehicleType;
  final String vehicleTitle;
  final String plateNumber;
  final DateTime departureTime;
  final DateTime arrivalTime;
  final int durationMinutes;
  final int baseFareVnd;
  final int totalSeats;
  final int availableSeatsCount;
  final double rating;
  final List<String> amenities;
  final List<PassengerStop> stops;

  const PassengerTrip({
    required this.tripId,
    required this.routeName,
    required this.vehicleType,
    required this.vehicleTitle,
    required this.plateNumber,
    required this.departureTime,
    required this.arrivalTime,
    required this.durationMinutes,
    required this.baseFareVnd,
    required this.totalSeats,
    required this.availableSeatsCount,
    required this.rating,
    required this.amenities,
    required this.stops,
  });
}

class PassengerStop {
  final String stopId;
  final String name;
  final String city;
  final int order;
  final bool pickupAllowed;
  final bool dropoffAllowed;

  const PassengerStop({
    required this.stopId,
    required this.name,
    required this.city,
    required this.order,
    required this.pickupAllowed,
    required this.dropoffAllowed,
  });
}

class PassengerSeat {
  final String seatCode;
  final int deck;
  final int row;
  final int column;
  final int priceVnd;
  final SeatState state;

  const PassengerSeat({
    required this.seatCode,
    required this.deck,
    required this.row,
    required this.column,
    required this.priceVnd,
    required this.state,
  });
}

class PassengerTicket {
  final String ticketId;
  final String pnr;
  final String tripId;
  final String routeName;
  final DateTime departureTime;
  final String seatCode;
  final int deck;
  final String passengerName;
  final String passengerPhone;
  final String pickupStopName;
  final String dropoffStopName;
  final TicketStatus status;
  final String dynamicQrPayload;
  final DateTime? boardedAt;

  const PassengerTicket({
    required this.ticketId,
    required this.pnr,
    required this.tripId,
    required this.routeName,
    required this.departureTime,
    required this.seatCode,
    required this.deck,
    required this.passengerName,
    required this.passengerPhone,
    required this.pickupStopName,
    required this.dropoffStopName,
    required this.status,
    required this.dynamicQrPayload,
    this.boardedAt,
  });
}

class LiveBusTelemetry {
  final String tripId;
  final String plateNumber;
  final double lat;
  final double lng;
  final double speedKmh;
  final int bearingDeg;
  final int distanceMeters;
  final int etaMinutes;
  final bool isOnline;

  const LiveBusTelemetry({
    required this.tripId,
    required this.plateNumber,
    required this.lat,
    required this.lng,
    required this.speedKmh,
    required this.bearingDeg,
    required this.distanceMeters,
    required this.etaMinutes,
    required this.isOnline,
  });
}
