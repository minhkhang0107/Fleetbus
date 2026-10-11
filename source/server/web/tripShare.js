export function renderTripSharePage(token, tripId, operatorCode) {
  const safeToken = JSON.stringify(token).replace(/</g, '\\u003c');
  const safeTripId = JSON.stringify(tripId).replace(/</g, '\\u003c');
  const safeOperatorCode = JSON.stringify(operatorCode).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Theo dõi chuyến xe</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; height: 100vh; background-color: #f5f5f5; }
    #map { flex: 1; width: 100%; z-index: 1; }
    .hud { padding: 16px; background: white; border-top-left-radius: 16px; border-top-right-radius: 16px; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); z-index: 2; position: relative; }
    .hud-title { margin: 0 0 8px 0; font-size: 18px; color: #333; font-weight: 600; }
    .hud-status { font-size: 15px; color: #555; margin-bottom: 8px; line-height: 1.4; }
    .hud-warning { font-size: 13px; color: #d97706; background: #fef3c7; padding: 8px; border-radius: 6px; margin-top: 8px; display: none; }
    .ended-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); z-index: 1000; display: none; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 20px; }
    .ended-overlay h2 { color: #333; margin-bottom: 8px; }
    .ended-overlay p { color: #666; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="hud" id="hud">
    <h1 class="hud-title">Chuyến đi của bạn</h1>
    <div class="hud-status" id="status-text">Đang tải vị trí...</div>
    <div class="hud-warning" id="warning-text"></div>
  </div>
  <div class="ended-overlay" id="ended-overlay">
    <h2>Chuyến đi đã kết thúc</h2>
    <p>Chuyến xe đã hoàn thành hoặc bị hủy. Không thể theo dõi vị trí.</p>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script>
    (function() {
      const token = ${safeToken};
      const tripId = ${safeTripId};
      const operatorCode = ${safeOperatorCode};
      
      const map = L.map('map').setView([21.0285, 105.8542], 12); // Hanoi default
      L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      let busMarker = null;
      let routeLine = null;
      const stopMarkers = [];

      const statusEl = document.getElementById('status-text');
      const warningEl = document.getElementById('warning-text');
      const endedOverlay = document.getElementById('ended-overlay');

      function updateMap(data) {
        if (data.tracking_ended) {
          endedOverlay.style.display = 'flex';
          return;
        }

        if (data.route_shape && data.route_shape.length > 0 && !routeLine) {
          routeLine = L.polyline(data.route_shape, { color: '#3b82f6', weight: 4 }).addTo(map);
          map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
        }

        if (data.stops && data.stops.length > 0 && stopMarkers.length === 0) {
          data.stops.forEach(stop => {
            const marker = L.circleMarker([stop.lat, stop.lng], {
              radius: 6,
              fillColor: '#ffffff',
              color: '#3b82f6',
              weight: 2,
              opacity: 1,
              fillOpacity: 1
            }).addTo(map);
            if (stop.name) {
              marker.bindTooltip(stop.name);
            }
            stopMarkers.push(marker);
          });
        }

        if (data.has_position && data.bus_position && !data.position_hidden) {
          const latlng = [data.bus_position.lat, data.bus_position.lng];
          if (!busMarker) {
            busMarker = L.circleMarker(latlng, {
              radius: 8,
              fillColor: '#ef4444',
              color: '#ffffff',
              weight: 2,
              opacity: 1,
              fillOpacity: 1
            }).addTo(map);
            busMarker.bindTooltip('Vị trí xe', { permanent: true, direction: 'right' }).openTooltip();
          } else {
            busMarker.setLatLng(latlng);
          }
        } else if (busMarker && data.position_hidden) {
          map.removeLayer(busMarker);
          busMarker = null;
        }

        if (data.hud_status_text) {
          statusEl.textContent = data.hud_status_text;
        }

        if (data.freshness && data.freshness.warning) {
          warningEl.textContent = data.freshness.warning;
          warningEl.style.display = 'block';
        } else {
          warningEl.style.display = 'none';
        }
      }

      function fetchTracking() {
        fetch('/api/v1/trips/' + encodeURIComponent(tripId) + '/tracking?share=' + encodeURIComponent(token), {
          headers: {
            'X-Operator-Code': operatorCode
          }
        })
        .then(res => res.json())
        .then(body => {
          if (body.status === 'success' && body.data) {
            updateMap(body.data);
          } else if (body.status === 'error') {
            statusEl.textContent = 'Lỗi: ' + (body.error || 'Không thể tải dữ liệu');
          }
        })
        .catch(err => {
          console.error(err);
          // don't overwrite status, let it retry
        });
      }

      fetchTracking();
      setInterval(fetchTracking, 10000);
    })();
  </script>
</body>
</html>`;
}
