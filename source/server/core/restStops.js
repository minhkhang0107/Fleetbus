/**
 * Rest stops and depots with a geofence (PAX-018 BR-TRACK-004, OQ-030).
 * Demo data on the Hà Nội to Thanh Hóa corridor; a real list comes from the route builder (MGR-009).
 */
export const REST_STOPS = [
  { stop_id: 'rs_phu_ly', name: 'Trạm dừng nghỉ Phủ Lý', lat: 20.5410, lng: 105.9120, radius_m: 300, planned_rest_minutes: 15 },
  { stop_id: 'rs_ninh_binh', name: 'Trạm dừng nghỉ Ninh Bình', lat: 20.2500, lng: 105.9740, radius_m: 300, planned_rest_minutes: 20 },
  { stop_id: 'rs_thanh_hoa', name: 'Bến xe phía Bắc Thanh Hóa', lat: 19.8200, lng: 105.7700, radius_m: 300, planned_rest_minutes: 10 }
];

// BR-TRACK-004: still for longer than this inside the geofence
export const REST_STOP_AFTER_MS = 5 * 60 * 1000;
// Below this speed the bus counts as still (GPS jitter keeps a parked bus above 0)
export const STILL_SPEED_KMH = 1;
