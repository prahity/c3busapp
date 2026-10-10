# Workspace Summary — pkg613654a2

**App:** Data-collection + resolution interface for UIUC **bus-route optimization**. Collects campus events (timing,
location, approximate attendance) that drive transit demand via two paths — **manual entry** and an **automated UIUC
scraper** — then **deduplicates, merges, scores, and locates** them for the route optimizer.

## Backend (`src/`)

- **`CampusVenue`** (entity) — UIUC venues. `name!`, `latitude!`, `longitude!`, `address`, `capacity`, `venueType`
  enum(Stadium/Arena/Auditorium/Hall/Classroom/Outdoor/Other), `events: [CampusEvent](venue)` inverse.
- **`CampusEvent`** (entity, `@db(index=['venue, startTime'])`) — a raw event **observation**. `name!`, `description`,
  `startTime!`, `endTime`, `venue: CampusVenue`, `locationName`, `latitude`, `longitude`, `expectedAttendance`,
  `category` enum(Sports/Concert/Academic/Conference/Social/Arts/Other), `source!` enum(Manual/Scraped),
  `sourceUrl`, `externalId`, `status` enum(Scheduled/Cancelled/Completed). Resolver-written: `reputationScore`,
  `credibilityBasis`, `mergedEvent: MergedEvent` (inverse of `MergedEvent#contributingEvents`).
- **`UiucEventScraper`** (`mixes REST`) — scrapes the UIUC General Events iCalendar feed.
  - `getIcal(): HttpResponse` — abstract `@rest(uri='icalGmail/7.ics', ...)` against `https://calendars.illinois.edu/`.
  - `scrapeAndSave(days: int): json` — forward-window convenience scrape (now-1d → now+days, cap 300).
  - `scrapeRange(startDate: string, endDate: string, limit: int): json` — inclusive `yyyy-MM-dd` window, `limit` =
    "show K" cap (default 300, hard-capped 1000). Both delegate to `_scrapeWindow(startYmd, endYmd, maxEvents)`:
    parse VEVENTs (unfold folded lines), filter by `yyyyMMdd` string compare, dedupe by UID → `CampusEvent`
    (`source='Scraped'`, `externalId=UID`, `id='scraped_'+sanitizedUID`), `mergeBatch`. Returns
    `{scraped, saved, skipped, errors}`. Feed ~2.6MB / ~1867 VEVENTs — multi-second; one scrape per `runJsCode` call.
- **`EventFeed`** (entity, schema `EVENT_FEED`) — one row per logical source + its dynamic reliability.
  `sourceType!` enum(Scraped/Manual), `label!`, `baseReliability!`, `eventsObserved`, `corroboratedCount`,
  `lastObservedAt`, `reliabilityScore`, `reliabilityBasis`. (Named `EventFeed` — **`EventSource` is a reserved base
  platform type**; do not use that name.)
- **`TransitStop`** (entity, schema `TRANSIT_STOP`) — routing origins/destinations. `name!`, `latitude!`,
  `longitude!`, `stopType!` enum(BusStop/ParkAndRide/ParkingArea/PopulationCenter), `routes`, `weight`.
- **`MergedEvent`** (entity, schema `MERGED_EVENT`, `@db(index=['startTime'])`) — canonical deduplicated event.
  Merged scalar fields (name/startTime/venue/category/...) + `reputationScore`, `reputationBasis`,
  `estimatedPopulation`, `populationBasis`, `sourceCount`, `fieldProvenance: json`, `startStopCandidates: json`,
  `endStopCandidates: json`, `clusterKey`, `lastResolvedAt`, `contributingEvents: [CampusEvent](mergedEvent)`.
- **`EventResolver`** (plain `type`, impl `EventResolver.js`, js-server) — the dedup/merge/score pipeline. Transparent
  mathematical heuristics (LLM swappable without changing the flow).
  - `recomputeSourceReliability(): json` — `reliabilityScore = baseReliability · freshness · corroboration`, scraped
    clamped `[0.6, 0.95]`.
  - `resolveAll(windowDays: int): json` (default 30) — over `[now-1d, now+windowDays]`: recompute reliability → block
    by calendar day → pairwise **similarity** `0.5·nameTrigramDice + 0.3·timeDecay + 0.2·haversineLoc` (≥ **0.72** =
    same) → **union-find** clustering → merge each cluster (union of fields; conflict → highest-reputation source wins,
    description = longest; `fieldProvenance[field]={value,source,sourceEventId,reputation,alternatives[]}`) → combined
    reputation = **noisy-OR** over sources − conflict penalty → **reputation-weighted population**
    `Σ(rᵢaᵢ)/Σrᵢ` (else venue.capacity × category load factor, else category prior) → haversine **start/end stop**
    candidates. Rebuilds `MergedEvent`s in-window and links/scores contributing `CampusEvent`s. Updates `EventFeed`
    observation snapshot. Returns `{rawEvents, clusters, merged, scrapedObserved, scrapedCorroborated, windowDays}`.
  - `scoreManualEvent(eventId: string): json` — incremental between scrapes: scores one manual entry's credibility
    (`0.30·completeness + 0.30·consistency + 0.20·plausibility + 0.20·corroboration`), clusters it against same-day
    events, merges into (or creates) a `MergedEvent`. Returns `{eventId, reputationScore, credibilityBasis,
    mergedEventId, matched}`. Fully re-evaluated at the next `resolveAll`.
- **`MtdApiConfig`** (`@config … mixes Config, Singleton`) — `@config baseUrl: !string =
  "https://developer.cumtd.com/api/v2.2/json/"`, `@config(secret=true) apiKey: string`. The CUMTD key is read from the
  platform **secret store** at runtime — never hardcoded or entered in the UI.
- **`GoogleMapsConfig`** (`@config … mixes Config, Singleton`) — `@config baseUrl: !string =
  "https://maps.googleapis.com/maps/api/"`, `@config(secret=true) apiKey: string`. Google key from the secret store.
- **`MtdRoutesClient`** (`mixes REST`, impl `MtdRoutesClient.js`, js-server helpers) — live CUMTD baseline-route
  integration. Abstract `@rest` endpoints: `getDeparturesByStop(stop_id,key)` (`getdeparturesbystop`),
  `getStopTimesByTrip(trip_id,key)` (`getstoptimesbytrip`), `searchStops(query,count,key)` (`getstopsbysearch`).
  Helpers: `initialize()`, `baselineRoutes(stopId, maxTrips): json`, `baselineRoutesForStops([stopId], maxTrips): json`,
  `findStops(query): json`. `baselineRoutes` returns the requested nested shape
  `{ [startStopId]: { departure_times:[iso…], destinations:[{ stop_id, name, arrival_times:[iso…] }] } }` — fetches
  departures for the stop, then stop_times per unique trip, collapsing stop-point ids (`"IT:1"→"IT"`). Throws a clear
  error (no silent fallback) when `MtdApiConfig.apiKey` is unset.
- **`GoogleDirectionsClient`** (`mixes REST`, abstract only — **no impl file**) — `getDirections(origin, destination,
  waypoints, mode, key): json` → `@rest(uri='directions/json', method='GET')`. `origin`/`destination` are `"lat,lng"`,
  `waypoints` is `"lat,lng|lat,lng"`; response `routes[0].legs[].duration.value` (s) / `.distance.value` (m).
- **`RoutePlanner`** (plain `type`, impl `RoutePlanner.js`, js-server) — the **new-route generation algorithm**. Two
  entry points:
  - `generateRoute(mergedEventId, meanTimeToServiceMin, busCapacity, baselineRoutes): json` — **single event, one
    route**. Fetch the `MergedEvent` (+ venue) → candidate **pickup** stops from `startStopCandidates` (weight = score)
    → **route convolution** (`_convolve`: order pickups farthest-first by distance-to-venue, merge consecutive stops
    within `CONVOLUTION_KERNEL_M=600 m` via weighted centroid) → per-leg **travel time** from **Google Directions**,
    haversine fallback (`AVG_BUS_SPEED_MPS=6.7`) → **demand** from `estimatedPopulation` (else venue.capacity, else
    500) → **headway** = `min(2·MTTS, serviceWindow/departuresNeeded)` clamped ≥2, schedule anchored to event start →
    baseline median-headway comparison. Returns `{ route, plan:{ event, service, travel, convolution, orderedStops,
    baselineComparison } }`.
  - `generateNetwork(windowDays, numBuses, busCapacity, meanTimeToServiceMin, baselineRoutes): json` — **all upcoming
    events, N buses → N routes**. Fetch all `MergedEvent`s with `startTime` in `[now-1d, now+windowDays]` → aggregate
    rider demand across them (each event's `startStopCandidates` weighted by `candidateScore/Σscore × eventDemand`,
    same-coord origins merged via `_coordKey` ~100 m) → demand-weighted **campus hub** (venue centroid) and
    **meanEventStart** → convolve origins toward the hub → **partition into `min(numBuses, #stops)` routes** via
    `_partitionIntoRoutes` (iterative **farthest-point seeding**: seed 0 = max-demand stop, each next seed = remaining
    stop farthest from all seeds; then every stop joins its nearest seed → spreads routes across distinct corridors,
    100 % coverage) → per route: Google/haversine travel, headway = `max(roundTrip, 2·MTTS)` clamped ≥2, a **bounded
    representative timetable** (`departures` = fit in `SCHEDULE_WINDOW_MIN=90` at that headway, capped by demand and
    `MAX_DEPARTURES_PER_ROUTE=24`) anchored so the last trip reaches the hub by meanEventStart, plus `tripsForDemand`
    (= ceil(riders/cap), informational). Returns `{ routes:{ [startStopId]:{departure_times,destinations} },
    plan:{ window, demand, hub, buses:{requested,used,…}, routes:[{…,departures,tripsForDemand,headwayMin,…}],
    coverage, convolution, baselineComparison } }`. Smoke-tested: 1→1, 3→3, 10→4 routes (4 demand stops), 100 %
    coverage, bounded 7-departure timetables.

## Data (`data/`)

- `CampusVenue/venues.json` — 6 real UIUC venues (`seed_venue_*`), real lat/lng + capacity.
- `CampusEvent/events.json` — manual sample events (`seed_event_*`, Oct 2026, `source='Manual'`).
- `EventFeed/sources.json` — `uiuc_calendar` (Scraped, base 0.9) + `manual` (Manual, base 0.5).
- `TransitStop/stops.json` — 13 stops/park-and-rides/population centers with coords near the venues.
- Load with `upsertSeedData`. A real scrape adds up to K `scraped_*` events; `resolveAll` builds `merged_*` rows.

## Frontend (`ui/react/src/`)

- **Routes** (`App.tsx`): `/` → `Dashboard`; `/busplanning` → `Busplanning`; `/events/new` → `ManualEntry`;
  `/surge-planner` → `SurgePlanner`; `/surge-planning` → `SurgePlanning` (standalone live-map prototype). (The
  standalone `/resolved` page was **removed** — resolution now lives on `/busplanning`. SurgePlanner was briefly
  disabled to green the build but has since been **re-enabled** by its owning session after its real-backend migration.)
- **Nav** (`config/navigation.ts`): Dashboard; "Campus Events" (`/busplanning`, Bus); "Add Event"
  (`/events/new`, CalendarPlus); "Surge Planner" (`/surge-planner`, Gauge); "Surge Planning (Map)"
  (`/surge-planning`, Map).
- **`pages/Busplanning/`** — now a **single page with three tabs** (`Busplanning.tsx` is a thin shell holding the
  shared `baseline: RouteMap | null` state and a "Add event" header link; tabs use `variant="bordered"`):
  - **`CollectionPanel.tsx`** (tab "Collection") — the original collection UI. KPI tiles + attendance bar chart +
    events table. Scrape controls: quick "Next day" / "This week", custom start/end date pickers, "Show K events",
    "Scrape range" (`c3Action('UiucEventScraper','scrapeRange',[start,end,k])`), "Refresh".
  - **`ResolvedPanel.tsx`** (tab "Resolve & plan", props `{baseline}`) — merged-event review **plus** per-event route
    generation. "Resolve events" button (`c3Action('EventResolver','resolveAll',[60])`); KPI tiles; table with
    expandable rows showing reputation/population basis, **field provenance**, **start/end stop candidates**, and an
    inline **`RouteGenerator`** (mtts default 7.5 min + bus capacity default 40 inputs → "Generate route" →
    `c3Action('RoutePlanner','generateRoute',[eventId, mtts, cap, baseline])`), rendering the returned route + plan
    inline. Fetches `MergedEvent` (`include: 'this, venue.id, venue.name, venue.capacity, venue.latitude,
    venue.longitude'`).
  - **`TransitPanel.tsx`** (tab "Transit routes", props `{baseline, onBaselineChange}`) — two sections sharing a
    reusable `FullRoute` renderer (ordered path: start stop → downstream stops with arrival clocks, connector line):
    - **Existing routes** — pulls **CUMTD baseline routes**. Stop-name search
      (`c3Action('MtdRoutesClient','findStops',[q])`), stop_id + maxTrips inputs, "Get baseline routes"
      (`c3Action('MtdRoutesClient','baselineRoutes',[id, maxTrips])`), merged into the shared `baseline` map and each
      rendered as a full route. Info note → configure `MtdApiConfig.apiKey` in the secret store.
    - **New routes** — number-of-buses + window-days + bus-capacity + mean-time-to-service inputs → "Generate new
      routes" (`c3Action('RoutePlanner','generateNetwork',[windowDays,numBuses,busCap,mtts,baseline])`). Renders a
      network summary line (buses used/requested, events aggregated, total demand, consolidated stops, coverage %,
      baseline median headway), a warning when `used < requested` (fewer demand corridors than buses), and each
      generated route via `FullRoute` with per-route metric badges (riders, headway) + metrics line (one-way,
      round-trip, trips-for-demand, travel basis).
- **`pages/ManualEntry/ManualEntry.tsx`** — standalone manual-entry page (replaced the old modal). Fetches
  `CampusVenue`; submits via `c3CreateAction('CampusEvent','create', spec)` with `source='Manual'`, then navigates to
  `/busplanning`.
- **`pages/SurgePlanner/`** — real-backend `SimRunner` flow (setup → simulating → results), owned by another session;
  **routed + built** (`/surge-planner`, nav "Surge Planner" / Gauge). **Results step renders live Leaflet maps
  everywhere** (the abstract SVG `NetworkMap` has been **deleted**). Core map is **`components/SimRouteMap.tsx`** — an
  OpenStreetMap campus view that places `SimStop`s at their real lat/long, draws each `SimRouteDef` corridor (tinted by
  worst expected wait from `stopWindowDelays`), animates buses (core buses per corridor from `coreService.coreTrips` +
  the candidate's supplemental buses along their real `extraBusItineraries` legs), and — when passed `events` —
  **marks each demand event** at the centroid of its `affectedStopIds` with a ★ marker, a forecast-impact halo
  (`Circle`) and dashed impact lines to every stop it loads, ringing affected stops in the event colour. Props now
  include `events?`, `compact?`, `focusStopIds?`, `highlightStopIds?`. The hero comparison in `ResultsStep.tsx` passes
  `events={input.events}` to both maps; the "Where the plan intervenes" cards (`OpportunityCards.tsx`) now render
  **compact `SimRouteMap`s** (focused/zoomed on the targeted corridor via `focusStopIds`/`highlightStopIds`) instead of
  the old graph. A new **`components/PlanSummary.tsx`** sits at the top of the results and states the optimization in
  plain language: a before → after row (campus waiting, unserved, late) + waiting saved + the lead demand event
  (name/type/riders/time from the top `eventActivation`). A shared **`useReplayClock.ts`** (rAF clock) +
  **`components/ReplayControls.tsx`** drive every map (hero + cards) in lockstep. All map data comes from the loaded
  `SimComparison` — no mock constants. **3D note:** MapLibre GL JS is the recommended OSS 3D replacement for the
  Leaflet+OSM base (vector tiles, pitch, 3D building extrusion, keyless) — deferred as a focused engine swap; keep the
  many small card maps on Leaflet (DOM/raster, no WebGL-context limit).
- **`pages/SurgePlanning/`** — standalone **mock-data** live-map prototype (`/surge-planning`): side-by-side
  current-vs-optimized Leaflet maps of UIUC with animated buses, a shared replay slider, and optimization
  opportunities. All data flows through a `SurgeDataSource` interface (`surgeData.ts`) with a `mockSurgeDataSource`
  today and a `c3SurgeDataSource` scaffold for a one-line swap to a real backend. Kept independent of SurgePlanner.
- Interfaces (`Interfaces.tsx`): `CampusEvent`, `CampusVenue`, enums, plus `MergedEvent`, `FieldProvenance(Entry)`,
  `StopCandidate`, and the route-planning types `RouteDestination`, `RouteInfo`, `RouteMap`, `RoutePlanLeg`,
  `RoutePlanStop`, `RoutePlan`, `GeneratedRoute`, and the network types `NetworkRouteSummary`, `NetworkPlan`,
  `GeneratedNetwork`. No mock/dummy data files except the deliberate Surge Planner mockup.

## Status

**Build/lint/type-check green** (`VITE_C3_PKG=pkg613654a2 npm run build`, 2631 modules). No critical `Pkg.Issue`. The
Request #3 code (Busplanning tabs + `MtdRoutesClient`/`GoogleDirectionsClient`/`RoutePlanner`/`MtdApiConfig`/
`GoogleMapsConfig`) is type-clean. Backend smoke-tested via `runJsCode`: `resolveAll` (351 raw → 343 merged);
`RoutePlanner.generateRoute` (6 origins → 4 consolidated stops, haversine-fallback travel, demand-driven headway,
schedule anchored to event start, baseline comparison); `RoutePlanner.generateNetwork` (N buses → N routes:
1→1, 3→3, 10→4 for 4 demand stops, 100 % coverage, bounded representative timetables); config singletons resolve with
correct base URLs; `MtdRoutesClient` throws cleanly with no key. **Live CUMTD + Google calls cannot be exercised until
the user adds the two secrets** (see Notes).

## Notes / gotchas

- `EventSource` is a **reserved base platform type** — our feed type is `EventFeed`. (`fetchCount` missing / "not
  Persistable" on `data/` upsert ⇒ you collided with a base type.)
- Rhino (`js-server`) `VerifyError: Bad type on operand stack` is triggered by compound property ops like
  `obj[k] = (obj[k]||0)+1` / `obj[k]--`; rewrite with explicit intermediate vars (see `_trigramDice`).
- `runJsCode` has no top-level `return` (wrap in IIFE); server-side `create`/`remove` want objects —
  use `.make().merge()` and `removeAll({filter: Filter.eq(...)}, true)`. REST `c3CreateAction` from the UI is fine.
- `npm run build` needs env `VITE_C3_PKG=pkg613654a2` (harness sets it; set manually in a bare shell).
- `validatePkgs(["pkg613654a2"], workspaceId, synchronous=true)` forces re-provision after type/impl edits
  (workspaceId = `WORKSPACE_ID` env).
- **Secrets for live routing (user action required):** `MtdRoutesClient` needs a CUMTD key and `RoutePlanner`'s
  Google-Directions travel times need a Google Maps key. Set `MtdApiConfig.apiKey` and `GoogleMapsConfig.apiKey` in the
  platform **secret store** (Settings/Console) — never hardcode or paste keys into chat/UI. Without the Google key,
  `RoutePlanner` falls back to haversine travel-time estimates; without the CUMTD key, the Transit tab / baseline
  fetch throws a clear "key not configured" error.
- CUMTD v2.2 base `https://developer.cumtd.com/api/v2.2/json/`, key as `key=` query param. Rhino `js-server`
  `VerifyError` also fires on `x++`/compound updates in `MtdRoutesClient.js`/`RoutePlanner.js` — both use explicit
  intermediate vars + `x = x + 1`.
