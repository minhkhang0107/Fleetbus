import { DEFAULT_OPERATOR_ID } from './operators.js';

/**
 * Returns the operator_id of the given trip, or null if the trip is unknown.
 */
export function operatorOfTrip(services, tripId) {
  // Check search catalog
  const catalogRes = services.searchService.getTripDetail(tripId);
  if (catalogRes.success && catalogRes.data) {
    return catalogRes.data.operator_id || DEFAULT_OPERATOR_ID;
  }

  // Check driver active trips
  if (services.driverService && services.driverService.activeTrips) {
    const driverTrip = services.driverService.activeTrips.get(tripId);
    if (driverTrip) {
      return driverTrip.operator_id || DEFAULT_OPERATOR_ID;
    }
  }

  // Check manager schedule
  if (services.managerService && services.managerService.findTrip) {
    const managerTrip = services.managerService.findTrip(tripId);
    if (managerTrip) {
      return managerTrip.operator_id || DEFAULT_OPERATOR_ID;
    }
  }

  return null;
}

/**
 * Returns whether a trip is visible to the given operatorId.
 */
export function tripVisibleTo(services, tripId, operatorId) {
  const actualOperator = operatorOfTrip(services, tripId);
  if (!actualOperator) return false;
  
  if (!operatorId) {
    // If no operatorId requested, we assume default operator context or no filtering
    return actualOperator === DEFAULT_OPERATOR_ID;
  }
  
  return actualOperator === operatorId;
}
