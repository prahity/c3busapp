/**
 * Implementation of the non-abstract helper on UiucEventScraper.
 * The abstract @rest method `getEvents` needs no implementation — the platform performs
 * the HTTP call. See UiucEventScraper.c3typ for the full contract.
 */

/**
 * Scrape the UIUC Localist calendar and upsert the results as CampusEvent records.
 */
function scrapeAndSave(days) {
  if (days == null || days <= 0) {
    days = 30;
  }

  // Map a free-text Localist event-type label onto the CampusEvent.category enum.
  var mapCategory = function (label) {
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
    if (l.indexOf('lecture') >= 0 || l.indexOf('academic') >= 0 || l.indexOf('class') >= 0 || l.indexOf('seminar') >= 0 || l.indexOf('workshop') >= 0) {
      return 'Academic';
    }
    if (l.indexOf('conference') >= 0 || l.indexOf('symposium') >= 0) {
      return 'Conference';
    }
    if (l.indexOf('art') >= 0 || l.indexOf('theat') >= 0 || l.indexOf('performance') >= 0 || l.indexOf('dance') >= 0 || l.indexOf('film') >= 0) {
      return 'Arts';
    }
    if (l.indexOf('social') >= 0 || l.indexOf('reception') >= 0 || l.indexOf('festival') >= 0) {
      return 'Social';
    }
    return 'Other';
  };

  var toNumber = function (v) {
    if (v == null || v === '') {
      return null;
    }
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  // Point the declarative REST client at the public Localist base URL (no auth required).
  UiucEventScraper.setApiUrlAndAuth('https://calendars.illinois.edu/', '');

  var scraped = 0;
  var skipped = 0;
  var errors = [];
  var byExternalId = {};

  try {
    var response = UiucEventScraper.getEvents(days, 100);
    var eventsArray = response && response.events ? response.events : [];
    scraped = eventsArray.length;

    for (var i = 0; i < eventsArray.length; i++) {
      var wrapper = eventsArray[i];
      var e = wrapper && wrapper.event ? wrapper.event : null;
      if (!e) {
        skipped++;
        continue;
      }

      try {
        var externalId = String(e.id || '');

        // Timing comes from the first event instance.
        var startTime = null;
        var endTime = null;
        if (e.event_instances && e.event_instances.length > 0) {
          var first = e.event_instances[0];
          var inst = first && first.event_instance ? first.event_instance : null;
          if (inst) {
            startTime = inst.start || null;
            endTime = inst.end || null;
          }
        }

        if (!e.title || !startTime || !externalId) {
          skipped++;
          continue;
        }

        var latitude = e.geo ? toNumber(e.geo.latitude) : null;
        var longitude = e.geo ? toNumber(e.geo.longitude) : null;

        var categoryLabel = null;
        if (e.filters && e.filters.event_types && e.filters.event_types.length > 0) {
          categoryLabel = e.filters.event_types[0].name || null;
        }

        var expectedAttendance = null;
        if (e.expected_attendance != null) {
          var ea = parseInt(e.expected_attendance, 10);
          expectedAttendance = isNaN(ea) ? null : ea;
        }

        byExternalId[externalId] = CampusEvent.make({
          id: 'scraped_' + externalId,
          name: e.title,
          description: e.description_text || null,
          startTime: startTime,
          endTime: endTime,
          locationName: e.location_name || e.location || null,
          latitude: latitude,
          longitude: longitude,
          expectedAttendance: expectedAttendance,
          category: mapCategory(categoryLabel),
          source: 'Scraped',
          sourceUrl: e.localist_url || e.url || null,
          externalId: externalId,
          status: 'Scheduled',
        });
      } catch (perEventErr) {
        errors.push({ externalId: String(e.id || ''), message: perEventErr.message });
      }
    }

    var deduped = [];
    for (var extId in byExternalId) {
      if (byExternalId.hasOwnProperty(extId)) {
        deduped.push(byExternalId[extId]);
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
