/*
 * OsrmClient — snaps an ordered list of real stop coordinates to the OSM street network so the
 * transit map can draw routes that follow actual streets. Rhino-safe (explicit intermediate vars).
 * The abstract `route` @rest method is handled by the platform; only the helpers live here.
 */

var OSRM_DEFAULT_BASE = 'https://router.project-osrm.org/';

function initialize() {
  OsrmClient.setApiUrlAndAuth(OSRM_DEFAULT_BASE, '');
}

/* Build the OSRM "lon,lat;lon,lat;..." path segment from a [[lat,lng],...] list. */
function _coordParam(coords) {
  var parts = [];
  var i;
  for (i = 0; i < coords.length; i++) {
    var pt = coords[i];
    var lat = pt[0];
    var lng = pt[1];
    parts.push('' + lng + ',' + lat);
  }
  return parts.join(';');
}

function snapPath(coords) {
  if (!coords || coords.length < 2) {
    return { ok: false, points: coords || [], distanceMeters: 0, durationSeconds: 0, note: 'need >=2 coordinates' };
  }
  initialize();
  var param = _coordParam(coords);
  var resp = OsrmClient.route(param, 'full', 'geojson', false);
  var code = resp && resp.code ? resp.code : null;
  var routes = resp && resp.routes ? resp.routes : [];
  if (code !== 'Ok' || routes.length === 0) {
    return { ok: false, points: coords, distanceMeters: 0, durationSeconds: 0, note: 'osrm code=' + code };
  }
  var r0 = routes[0];
  var geom = r0.geometry ? r0.geometry : {};
  var line = geom.coordinates ? geom.coordinates : [];
  var points = [];
  var i;
  for (i = 0; i < line.length; i++) {
    var c = line[i];
    // GeoJSON is [lon, lat]; Leaflet wants [lat, lng].
    points.push([c[1], c[0]]);
  }
  if (points.length === 0) {
    return { ok: false, points: coords, distanceMeters: 0, durationSeconds: 0, note: 'empty geometry' };
  }
  return {
    ok: true,
    points: points,
    distanceMeters: r0.distance ? r0.distance : 0,
    durationSeconds: r0.duration ? r0.duration : 0,
    note: 'osrm-snapped'
  };
}
