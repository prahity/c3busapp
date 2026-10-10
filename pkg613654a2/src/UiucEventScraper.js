/**
 * Implementation of the non-abstract helpers on UiucEventScraper.
 * The abstract @rest method `getIcal` needs no implementation — the platform performs the
 * HTTP call. See UiucEventScraper.c3typ for the full contract.
 *
 * Both public entry points (`scrapeAndSave` and `scrapeRange`) resolve a [startYmd, endYmd]
 * calendar-day window plus a max-event cap, then delegate to the shared `_scrapeWindow`
 * worker below. Extra top-level `_`-prefixed functions are module-local helpers, not C3
 * methods (only names declared in the .c3typ are exposed as methods).
 */

// Map a free-text ICS CATEGORIES label onto the CampusEvent.category enum.
function _mapCategory(label) {
  if (!label) {
    return 'Other';
  }
  var l = ('' + label).toLowerCase();
  if (l.indexOf('sport') >= 0 || l.indexOf('athletic') >= 0 || l.indexOf('game') >= 0) {
    return 'Sports';
  }
  if (l.indexOf('concert') >= 0 || l.indexOf('music') >= 0) {
    return 'Concert';
  }
  if (l.indexOf('lecture') >= 0 || l.indexOf('academic') >= 0 || l.indexOf('class') >= 0 ||
      l.indexOf('seminar') >= 0 || l.indexOf('workshop') >= 0 || l.indexOf('course') >= 0) {
    return 'Academic';
  }
  if (l.indexOf('conference') >= 0 || l.indexOf('symposium') >= 0 || l.indexOf('meeting') >= 0) {
    return 'Conference';
  }
  if (l.indexOf('art') >= 0 || l.indexOf('theat') >= 0 || l.indexOf('performance') >= 0 ||
      l.indexOf('dance') >= 0 || l.indexOf('film') >= 0 || l.indexOf('exhibit') >= 0) {
    return 'Arts';
  }
  if (l.indexOf('social') >= 0 || l.indexOf('reception') >= 0 || l.indexOf('festival') >= 0) {
    return 'Social';
  }
  return 'Other';
}

// Convert an ICS datetime value (YYYYMMDD, YYYYMMDDTHHMMSS, YYYYMMDDTHHMMSSZ) to ISO 8601.
function _toIso(val) {
  if (!val) {
    return null;
  }
  var s = ('' + val).trim();
  var hasZ = false;
  if (s.charAt(s.length - 1) === 'Z') {
    hasZ = true;
    s = s.substring(0, s.length - 1);
  }
  if (s.length < 8) {
    return null;
  }
  var iso = s.substring(0, 4) + '-' + s.substring(4, 6) + '-' + s.substring(6, 8);
  if (s.length >= 15 && s.charAt(8) === 'T') {
    iso += 'T' + s.substring(9, 11) + ':' + s.substring(11, 13) + ':' + s.substring(13, 15);
  } else {
    iso += 'T00:00:00';
  }
  return hasZ ? iso + 'Z' : iso;
}

// Unescape ICS TEXT values (\n, \, , \; , \\).
function _unescapeText(val) {
  if (val == null) {
    return null;
  }
  return ('' + val)
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

// Make a safe, stable C3 id from an ICS UID.
function _safeId(uid) {
  return 'scraped_' + ('' + uid).replace(/[^a-zA-Z0-9]/g, '_');
}

// First 8 chars (yyyyMMdd) of an ICS DTSTART value.
function _ymdOf(dtstart) {
  if (!dtstart) {
    return null;
  }
  var s = ('' + dtstart).trim();
  return s.length >= 8 ? s.substring(0, 8) : null;
}

// Reduce an ISO calendar date / datetime string ('yyyy-MM-dd' or full ISO) to a bare
// yyyyMMdd token; returns null when fewer than 8 digits are present.
function _ymdFromDate(dateStr) {
  if (!dateStr) {
    return null;
  }
  var digits = ('' + dateStr).replace(/[^0-9]/g, '');
  return digits.length >= 8 ? digits.substring(0, 8) : null;
}

/**
 * Shared worker: download the feed and upsert every VEVENT whose DTSTART calendar day falls
 * within [startYmd, endYmd] (inclusive), up to `maxEvents` records.
 * @return { scraped, saved, skipped, errors }
 */
function _scrapeWindow(startYmd, endYmd, maxEvents) {
  UiucEventScraper.setApiUrlAndAuth('https://calendars.illinois.edu/', '');

  var scraped = 0;
  var skipped = 0;
  var errors = [];
  var byExternalId = {};

  try {
    var resp = UiucEventScraper.getIcal();
    if (resp == null) {
      return { scraped: 0, saved: 0, skipped: 0, errors: [{ message: 'No HTTP response' }] };
    }
    if (resp.statusCode != null && resp.statusCode >= 400) {
      return { scraped: 0, saved: 0, skipped: 0, errors: [{ message: 'Feed returned HTTP ' + resp.statusCode }] };
    }
    var content = resp.body();
    var ics = content != null ? ('' + content.readString()) : '';
    if (ics.length === 0) {
      return { scraped: 0, saved: 0, skipped: 0, errors: [{ message: 'Empty ICS body' }] };
    }

    // Normalize line endings and unfold folded lines (continuation lines start with space/tab).
    var rawLines = ics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var lines = [];
    for (var li = 0; li < rawLines.length; li++) {
      var line = rawLines[li];
      if (line.length > 0 && (line.charAt(0) === ' ' || line.charAt(0) === '\t') && lines.length > 0) {
        lines[lines.length - 1] += line.substring(1);
      } else {
        lines.push(line);
      }
    }

    var collected = 0;
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln === 'BEGIN:VEVENT') {
        current = {};
        continue;
      }
      if (ln === 'END:VEVENT') {
        if (current) {
          scraped++;
          try {
            var ymd = _ymdOf(current.DTSTART);
            if (!current.SUMMARY || !ymd || !current.UID) {
              skipped++;
            } else if (ymd < startYmd || ymd > endYmd) {
              skipped++;
            } else {
              var extId = current.UID;
              if (byExternalId[extId] == null) {
                if (collected >= maxEvents) {
                  skipped++;
                } else {
                  byExternalId[extId] = CampusEvent.make({
                    id: _safeId(extId),
                    name: _unescapeText(current.SUMMARY),
                    description: _unescapeText(current.DESCRIPTION),
                    startTime: _toIso(current.DTSTART),
                    endTime: _toIso(current.DTEND),
                    locationName: _unescapeText(current.LOCATION) || null,
                    expectedAttendance: null,
                    category: _mapCategory(current.CATEGORIES),
                    source: 'Scraped',
                    sourceUrl: current.URL || null,
                    externalId: extId,
                    status: 'Scheduled',
                  });
                  collected++;
                }
              }
            }
          } catch (perEventErr) {
            errors.push({ uid: '' + (current.UID || ''), message: perEventErr.message });
          }
        }
        current = null;
        continue;
      }
      if (current) {
        // Split "NAME;params:value" into property name (before ';' or ':') and value (after first ':').
        var colon = ln.indexOf(':');
        if (colon > 0) {
          var namePart = ln.substring(0, colon);
          var value = ln.substring(colon + 1);
          var semi = namePart.indexOf(';');
          var name = (semi >= 0 ? namePart.substring(0, semi) : namePart).toUpperCase();
          // Only keep the first occurrence of single-valued props we care about.
          if (current[name] == null) {
            current[name] = value;
          }
        }
      }
    }

    var deduped = [];
    for (var k in byExternalId) {
      if (byExternalId.hasOwnProperty(k)) {
        deduped.push(byExternalId[k]);
      }
    }

    var saved = 0;
    if (deduped.length > 0) {
      CampusEvent.mergeBatch(deduped);
      saved = deduped.length;
    }

    return { scraped: scraped, saved: saved, skipped: skipped, errors: errors };
  } catch (err) {
    return { scraped: scraped, saved: 0, skipped: skipped, errors: [{ message: err.message }] };
  }
}

/**
 * Scrape the UIUC campus events iCalendar feed for the next `days` days and upsert the results.
 */
function scrapeAndSave(days) {
  if (days == null || days <= 0) {
    days = 30;
  }
  var startYmd = DateTime.now().minusDays(1).format('yyyyMMdd'); // small grace for in-progress events
  var endYmd = DateTime.now().plusDays(days).format('yyyyMMdd');
  return _scrapeWindow(startYmd, endYmd, 300);
}

/**
 * Scrape the UIUC campus events iCalendar feed for an explicit [startDate, endDate] calendar
 * window (inclusive) and upsert up to `limit` results.
 */
function scrapeRange(startDate, endDate, limit) {
  var startYmd = _ymdFromDate(startDate) || DateTime.now().format('yyyyMMdd');
  var endYmd = _ymdFromDate(endDate) || DateTime.now().plusDays(30).format('yyyyMMdd');
  if (endYmd < startYmd) {
    var tmp = startYmd;
    startYmd = endYmd;
    endYmd = tmp;
  }
  var maxEvents = (limit == null || limit <= 0) ? 300 : Math.min(limit, 1000);
  return _scrapeWindow(startYmd, endYmd, maxEvents);
}
