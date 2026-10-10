/*
 * GtfsClient — downloads CUMTD static GTFS and extracts per-route street-following polylines.
 * Rhino-safe (explicit intermediate vars). The abstract `download` @rest method is platform-handled.
 */

var GTFS_BASE = 'https://developer.cumtd.com/';

function initialize() {
  GtfsClient.setApiUrlAndAuth(GTFS_BASE, '');
}

/* Split CSV text into array of rows (array of fields). Handles simple quoted fields. */
function _parseCsv(text) {
  var rows = [];
  var lines = ('' + text).split(/\r?\n/);
  var i;
  for (i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.length === 0) {
      continue;
    }
    rows.push(line.split(','));
  }
  return rows;
}

/* Build a header-name -> column-index map from a header row. */
function _headerIndex(headerRow) {
  var idx = {};
  var i;
  for (i = 0; i < headerRow.length; i++) {
    var name = ('' + headerRow[i]).replace(/"/g, '').replace(/^﻿/, '');
    idx[name] = i;
  }
  return idx;
}

/* Read a named file out of an opened ZipFile as a string. */
function _readEntry(zip, name) {
  var entry = zip.getEntry(name);
  if (!entry) {
    return null;
  }
  return zip.readString(name);
}

function existingRoutes(maxRoutes, every) {
  initialize();
  var cap = maxRoutes && maxRoutes > 0 ? maxRoutes : 12;
  var step = every && every > 0 ? every : 4;

  var resp = GtfsClient.download();
  var status = resp ? resp.statusCode : null;
  if (status !== 200) {
    throw new Error('GTFS download failed, status ' + status);
  }

  // Persist the zip bytes to a temp file, then open with ZipFile.
  var bytes = resp.bodyAsBytes ? resp.bodyAsBytes() : resp.content;
  var tmpUrl = 'file:///tmp/cumtd_gtfs_' + Date.now() + '.zip';
  var f = File.make({ url: tmpUrl });
  f.writeBytes(bytes);
  var zip = ZipFile.open ? ZipFile.open(f) : ZipFile.make({ file: f });

  var routesTxt = _readEntry(zip, 'routes.txt');
  var tripsTxt = _readEntry(zip, 'trips.txt');
  var shapesTxt = _readEntry(zip, 'shapes.txt');
  if (!routesTxt || !tripsTxt || !shapesTxt) {
    throw new Error('GTFS missing required files');
  }

  // routes.txt -> {route_id: {shortName, color}}
  var rRows = _parseCsv(routesTxt);
  var rHdr = _headerIndex(rRows[0]);
  var routeMeta = {};
  var i;
  for (i = 1; i < rRows.length; i++) {
    var rr = rRows[i];
    var rid = ('' + rr[rHdr.route_id]).replace(/"/g, '');
    routeMeta[rid] = {
      shortName: rHdr.route_short_name !== undefined ? ('' + rr[rHdr.route_short_name]).replace(/"/g, '') : rid,
      color: rHdr.route_color !== undefined ? ('' + rr[rHdr.route_color]).replace(/"/g, '') : null,
    };
  }

  // trips.txt -> pick one shape_id per route_id
  var tRows = _parseCsv(tripsTxt);
  var tHdr = _headerIndex(tRows[0]);
  var routeShape = {};
  for (i = 1; i < tRows.length; i++) {
    var tr = tRows[i];
    var trRid = ('' + tr[tHdr.route_id]).replace(/"/g, '');
    var shp = tHdr.shape_id !== undefined ? ('' + tr[tHdr.shape_id]).replace(/"/g, '') : null;
    if (shp && routeShape[trRid] === undefined) {
      routeShape[trRid] = shp;
    }
  }

  // Build the set of shapes we actually need.
  var neededShapes = {};
  var rids = Object.keys(routeShape);
  var k;
  for (k = 0; k < rids.length; k++) {
    neededShapes[routeShape[rids[k]]] = [];
  }

  // shapes.txt -> accumulate points per needed shape (decimated).
  var sRows = _parseCsv(shapesTxt);
  var sHdr = _headerIndex(sRows[0]);
  var seqCount = {};
  for (i = 1; i < sRows.length; i++) {
    var sr = sRows[i];
    var sid = ('' + sr[sHdr.shape_id]).replace(/"/g, '');
    if (neededShapes[sid] === undefined) {
      continue;
    }
    var c = seqCount[sid] ? seqCount[sid] : 0;
    seqCount[sid] = c + 1;
    if (c % step !== 0) {
      continue;
    }
    var lat = parseFloat(sr[sHdr.shape_pt_lat]);
    var lng = parseFloat(sr[sHdr.shape_pt_lon]);
    if (!isNaN(lat) && !isNaN(lng)) {
      neededShapes[sid].push([lat, lng]);
    }
  }

  // Assemble per-route result, biggest shapes first, capped.
  var out = [];
  for (k = 0; k < rids.length; k++) {
    var routeId = rids[k];
    var shapeId = routeShape[routeId];
    var pts = neededShapes[shapeId] ? neededShapes[shapeId] : [];
    if (pts.length < 2) {
      continue;
    }
    var meta = routeMeta[routeId] ? routeMeta[routeId] : {};
    out.push({
      routeId: routeId,
      shortName: meta.shortName ? meta.shortName : routeId,
      color: meta.color ? meta.color : null,
      path: pts,
    });
  }
  out.sort(function (a, b) {
    return b.path.length - a.path.length;
  });
  if (out.length > cap) {
    out = out.slice(0, cap);
  }
  return out;
}
