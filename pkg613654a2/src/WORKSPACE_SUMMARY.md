# Workspace Summary

> Work-to-date map of this workspace. Keep it concise and current.

## Current state

Building a **UIUC campus bus-route planning** app. Backend models campus events/venues; the
frontend surfaces them in the main dashboard under a **"Busplanning"** nav section.

## Packages

- `pkg613654a2` (main) — the whole app.

## Backend types (`src/`)

- **`CampusEvent`** (entity) — a campus event (demand driver): `name`, `startTime`/`endTime`,
  `venue` (→ `CampusVenue`) or free-text `locationName`+`latitude`/`longitude`,
  `expectedAttendance`, `category` enum, `source` enum (`Manual`/`Scraped`), `sourceUrl`,
  `externalId` (dedupe key), `status`. Indexed on `venue, startTime`.
- **`CampusVenue`** (entity) — `name`, `latitude`/`longitude`, `address`, `capacity`, `venueType`.
- **`UiucEventScraper`** (`mixes REST`) — **Status: WORKING.** `getIcal()` is an abstract
  `@rest(uri='icalGmail/7.ics', method='GET', acceptMislabeledContentType=true)` returning
  `HttpResponse` (raw body avoids JSON auto-parse; `acceptMislabeledContentType` tolerates the
  feed's `text/calendar`). Two JS entry points, both delegating to a shared `_scrapeWindow`
  worker that downloads the feed, unfolds ICS lines, filters VEVENTs by a cheap `yyyyMMdd`
  string window, dedups by UID, and persists via `CampusEvent.mergeBatch`:
  - `scrapeAndSave(days)` — forward window of `days` (default 30), cap 300.
  - `scrapeRange(startDate, endDate, limit)` — explicit inclusive `yyyy-MM-dd` window + K cap
    (default 300, hard max 1000); swaps bounds if reversed. Backs the UI scrape controls.
  Feed is ~1867 VEVENTs / 2.6 MB; verified `{scraped:1867}` with windowed `saved` honoring K.

## Transit planning & routing backend (`src/`)

- **`PlannerConfig`** (`@config … mixes Config, Singleton`) — the single tunable-settings type (the
  spec's "one config file for planner settings only"): scoring weights (`weightTime`/`weightBuffer`/
  `weightCrowd`), `transitShare`, `maxWalkSeconds`, `maxTransfers`, `minTransferSlackSeconds`,
  `minArrivalBufferSeconds`, `standingTimeLimitSeconds`, `costPerBusHour`, `planningHorizonSeconds`,
  `timezone`. No secrets here — API keys live on `MtdApiConfig`/`GoogleMapsConfig` (`@config(secret=true)`).
- **`TransitPlanner`** (`js-server`) — the event-transit day-planner engine from the planner spec,
  pure over a normalized `json` **segment-table + demand** contract (so it runs on live adapter data
  in prod and on fixed test networks offline). Methods:
  - `planDay(plan)` — 9-step algorithm: apply operational events (closures + travel-time increases
    within windows) → process demand in time order → RAPTOR-style bounded candidate search over
    segments + walking transfers (same-`block_id` continuation is NOT a transfer) → filter by
    deadline/slack → score `wTime·ttd − wBuffer·buffer + wCrowd·crowd` → capacity-aware assignment
    seeded at background ridership with a standing-time limit → supplemental extra buses for overflow
    (reused across intervals when the availability window allows) → unserved report → returns
    `{riderView, mtdView, unserved, assignments, supplemental, diagnostics}`.
  - `resolveSettings(overrides)` — PlannerConfig defaults overlaid with per-call overrides.
  - `exampleServiceDay()` — runnable one-day usage example (classes + game peaks, a transfer, a
    same-block continuation, a congestion delay, overflow→supplemental, a return trip).
  - Rhino-safe style throughout (explicit intermediate vars, `_list()` to copy json arrays before
    `sort`/`splice`, `.slice(0)` not `.slice()`).
  - **Tests:** `test/js-rhino/test_TransitPlanner.js` — 23 specs over the 7 named spec fixtures
    (direct, transfer, same-block, over-capacity, closed segment, supplemental, extra-bus reuse); all green.
- **`RoutePlanner.generateNetwork(windowDays, numBuses, busCapacity, meanTimeToServiceMin, baselineRoutes)`**
  — **reworked** to plan supplemental **demand corridors** (routes), then assign a fleet of vehicles to
  them (routes are NOT 1:1 with buses). Pipeline: audit per-event demand (`attendance × transitShare`,
  attendance = `estimatedPopulation` → venue `capacity` → **unknown**, never fabricated); split each
  event's demand across its `startStopCandidates` by score (no double-counting); record the event's
  actual venue as that demand's destination; consolidate origins at ~100 m into distinct named stops;
  partition into `round(#stops / targetStops)` corridors (`targetStops` = avg stop count of comparable
  baseline MTD routes, clamped [8,12], else 10) by farthest-point seeding; assign vehicles by demand
  (surplus greedy, zero-vehicle corridors report demand unserved); schedule back-to-back cycles (loaded
  run + dwell + turnaround + reposition) so no vehicle overlaps; Google Directions travel else haversine
  → flagged `preliminary`/unverified. Returns `{routes: [NetworkRoute...], plan}` where each route card
  carries aligned `departure_times[i]` ↔ `destinations[].arrival_times[i]`, `estimatedDemand =
  assignedRiders + unservedRiders`, `requiredRuns` vs `scheduledRuns`, vehicles+capacities, confidence.
  `plan.coverage` separates **passengerServicePct** (riders ÷ demand) from **locationCoveragePct**
  (stops served ÷ stops). Smoke-tested green: invariant holds, arrays aligned, honest ~2% service vs 100%
  location coverage. `generateRoute` (single-event tool) is unchanged.
- **`MtdRoutesClient.baselineRoutes`** — CUMTD baseline per start stop also emits a `lines[]`
  array bucketed by bus number (`busNumber`/`routeId`/`routeColor`/`tripCount`), ordered by
  scheduled-trip frequency (a verified feed metric), top 10.
- The **`src/simulator/`** subsystem (SimEngine/SimPlanner + per-source adapters: event feed, student
  location, event estimate/report, reputation, core service, bus availability) is peer-owned; the
  `TransitPlanner` engine consumes the same normalized contract those adapters produce rather than
  duplicating them.
- **`RouteNetworkSimBridge`** (`js-server`, `buildScenario` / `buildAndCompare`) — **integrates the
  bus planner with SurgePlanner (the `SimRunner` simulator UI).** The simulator is entirely
  scenario-scoped, so the bridge changes nothing in it: it **authors a `SimScenario` + scenario-scoped
  child records** the adapters read by `Filter.eq('scenarioId', …)`, then runs validate/compare.
  Mapping: calls `RoutePlanner.generateNetwork` for the authoritative plan → each coordinate-complete
  `MergedEvent` the planner used becomes one `SimEvent` (`eventSource='Scheduled'` ⇒ reliability
  weight exactly 1.0, `attendance`=estimatedPopulation, `busUseShare`=`transitShare`,
  `originDistribution`=scored `startStopCandidates`, `destinationDistribution`=venue) carrying a
  `SimDemandEffect`; origin candidates + venues become `SimStop`s in **separate `origin_*`/`dest_*`
  namespaces** (so no demand leg has origin==destination, which the generator silently drops); the
  **proposed fleet becomes the `SimExtraBus` pool** (`maxExtraBuses`=numBuses — the simulator's only
  decision variable); haversine `SimTravelLink`s per used origin↔dest; horizon spans the events.
  Reconciliation is **exact and inbound-only**: mapped `round(attendance×transitShare)` summed over
  events equals the planner's `estimatedDemand` and the demand the generator emits (verified
  44954/44954 at 30 days, 44880/44880 at 14 days; the comparability assertion confirms the simulator
  generated exactly that many passengers). **Known gap (reported, not fabricated):** existing MTD
  **core service is omitted** because `SimStop` requires lat/lng and the CUMTD feed exposes only
  stop_id/stop_name — so the baseline runs with zero core capacity and the comparison is "proposed
  supplemental vs. no supplemental service." `buildAndCompare` additionally runs
  `SimRunner.runComparison` and returns a compact cost curve. Smoke-tested green; `validatePkgs`
  clean (no critical issues).

## UI pages / routes (`ui/react/src/`)

- `/` → `pages/Dashboard/Dashboard.tsx` (template placeholder, untouched).
- `/busplanning` → `pages/Busplanning/Busplanning.tsx` — **main deliverable**, a 3-tab container
  (Collection / Resolve / Transit) that holds the shared `baseline` RouteMap state. Header has an
  "Add event" `Link` to `/events/new`. Nav label is "Campus Events" (Bus icon).
  - **`CollectionPanel.tsx`** (Collection tab) — scrape controls ("Next day"/"This week" quick
    buttons, custom start/end date pickers, "Show K events" input bounding both scrape cap and fetch
    `limit`, hard-capped 500, "Scrape range" + "Refresh"; all call
    `UiucEventScraper.scrapeRange([start,end,K])` then re-fetch `CampusEvent`), 3 KPI MetricCards
    (Events shown, Expected attendance, Peak event), and the event-schedule `Table`. The old
    "Expected attendance by event" bar chart and the "Venues in play" card were **removed** per the
    route-planning rework.
  - **`TransitPanel.tsx`** (Transit tab) — **reworked** into two clearly separated sections.
    *Existing MTD routes*: stop search / `baselineRoutes` loader, each route rendered as a full
    ordered path (`FullRoute`) labelled by public bus number with a "N route(s) by scheduled trips"
    badge; empty state reads "Existing routes not loaded." (does not imply no service exists).
    *New supplemental routes (proposals)*: fleet/window/capacity/MTTS inputs call
    `RoutePlanner.generateNetwork`; a network summary (passenger service % vs pickup-location
    coverage %, fleet used/requested, preliminary-schedule warning), an expandable per-event demand
    audit table, and one `ProposedRouteCard` per route — pickup → real destination, estimated vs
    assigned vs unserved riders, scheduled/required runs, assigned vehicles+capacities, confidence,
    and an expandable full stop sequence + aligned departure/arrival timetable (no "(+N)" collapsing).
    After a network is generated, a **"Send to SurgePlanner"** card calls
    `RouteNetworkSimBridge.buildScenario` (deterministic id `sc_busplan_<days>d_<buses>x<cap>`, same
    fleet/window/capacity/MTTS inputs), then shows the reconciliation (planner demand vs mapped
    inbound riders, match badge), validation status, created-record counts, and a `Link` to
    `/surge-planner`. The generated `SimScenario` auto-appears in SurgePlanner's scenario list.
- `/events/new` → `pages/ManualEntry/ManualEntry.tsx` — **standalone manual-entry page**
  (replaced the old `AddEventModal`, which was deleted). Fetches `CampusVenue` for the venue
  dropdown; form fields (name*, start*, end, category, status, venue, locationName,
  expectedAttendance, description) persist a `CampusEvent` with `source='Manual'` via
  `c3CreateAction('CampusEvent','create', spec)`, then `navigate('/busplanning')`. Nav item
  "Add Event" (CalendarPlus icon).
- Interfaces `CampusEvent`/`CampusVenue` in `Interfaces.tsx` (incl. `CampusEventStatus`).

## Seed / data

- `data/CampusVenue/venues.json` — 6 venues (State Farm Center, Memorial Stadium, Krannert,
  Foellinger, Illini Union, ARC).
- `data/CampusEvent/events.json` — 6 events referencing those venues. Loaded via `upsertSeedData`.

## Key decisions

- Authored sample data lives in `data/` (plain entity types), loaded with `upsertSeedData`.
- UI verified: `npm run build` green; server-side `CampusEvent.fetch` returns the 6 events with
  the UI's exact include/order. (Headless Playwright shows empty because that session can't pass
  Okta auth — the authenticated preview renders the data.)
