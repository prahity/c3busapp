import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  Bus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Info,
  MapPin,
  Route as RouteIcon,
  Search,
  Sparkles,
  Waypoints,
} from 'lucide-react';

import { c3Action } from '@/c3Action';
import {
  BaselineRouteLine,
  GeneratedNetwork,
  NetworkEventContribution,
  NetworkRoute,
  RouteDestination,
  RouteMap,
  SimBridgeReport,
} from '@/Interfaces';
import TransitRouteMap from './TransitRouteMap';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const numberFmt = new Intl.NumberFormat('en-US');

interface TransitPanelProps {
  /** Current baseline-route map (shared with the Resolved tab's route planner). */
  baseline: RouteMap | null;
  /** Lift a freshly loaded/merged baseline map up to the page. */
  onBaselineChange: (routes: RouteMap) => void;
}

interface StopHit {
  stop_id: string;
  name: string;
}

function formatClock(iso?: string | number | null): string {
  if (iso === undefined || iso === null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Renders one EXISTING (scheduled) route as a full ordered path: a labelled header, the start stop
 * with its departure clocks, then every downstream stop in travel order with its first arrival clock.
 * Trip ids are retained internally in the backend; the rider-facing view shows readable stop names.
 */
const FullRoute: React.FC<{
  label: string;
  startName: string;
  startStopId: string;
  departureTimes: string[];
  destinations: RouteDestination[];
  badges?: React.ReactNode;
}> = ({ label, startName, startStopId, departureTimes, destinations, badges }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? departureTimes : departureTimes.slice(0, 6);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <RouteIcon className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
        <span className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">{label}</span>
        <Badge variant="soft" appearance="info">
          {departureTimes.length} departure(s)
        </Badge>
        {badges}
      </div>

      <div className="flex flex-col">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
          <div className="flex min-w-0 flex-col">
            <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">
              {startName} <code className="text-[0.7rem] text-[var(--c3-style-basic-fg-secondary)]">{startStopId}</code>
            </span>
            <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              Departs {shown.map((t) => formatClock(t)).join(', ') || '—'}
              {!open && departureTimes.length > 6 ? ` … (+${departureTimes.length - 6})` : ''}
            </span>
            {departureTimes.length > 6 && (
              <button
                type="button"
                className="mt-0.5 w-fit text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-accent)] underline"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? 'Show fewer departures' : `Show all ${departureTimes.length} departures`}
              </button>
            )}
          </div>
        </div>
        {destinations.map((d) => (
          <div key={d.stop_id} className="flex flex-col">
            <div className="ml-2 h-3 border-l border-[var(--c3-style-basic-border-weak)]" aria-hidden />
            <div className="flex items-start gap-2">
              <ArrowDown className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
              <div className="flex min-w-0 flex-col">
                <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                  {d.name ?? d.stop_id}
                </span>
                <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  First arrival {formatClock(d.arrival_times[0])} · {d.arrival_times.length} arrival(s) ·{' '}
                  <code className="text-[0.7rem]">{d.stop_id}</code>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** A proposed supplemental route card: metrics always visible, full schedule + stops expandable. */
const ProposedRouteCard: React.FC<{ route: NetworkRoute }> = ({ route }) => {
  const [open, setOpen] = useState(false);
  const demand = route.estimatedDemand;
  const servicePct = demand > 0 ? Math.round((route.assignedRiders / demand) * 100) : 0;
  const runsShort = route.scheduledRuns < route.requiredRuns;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <RouteIcon className="size-4 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
        <span className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">{route.routeName}</span>
        <Badge variant="soft" appearance="warning">
          Proposal
        </Badge>
        <Badge variant="soft" appearance="info">
          {route.stopCount} stop(s)
        </Badge>
        <Badge variant="soft" appearance={route.schedulePreliminary ? 'warning' : 'success'}>
          {route.schedulePreliminary ? 'Preliminary · unverified' : 'Verified travel times'}
        </Badge>
      </div>

      {/* Pickup → destination */}
      <div className="flex flex-wrap items-center gap-2 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">
        <MapPin className="size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
        <span>{route.pickupStop.name}</span>
        <ChevronRight className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
        <span className="font-medium">{route.destinationStop.name}</span>
        <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          (actual event destination)
        </span>
      </div>

      {/* Demand / assignment / runs */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3 lg:grid-cols-4 text-c3-regular-label-l3">
        <Metric label="Estimated demand" value={numberFmt.format(demand)} />
        <Metric label="Riders assigned" value={numberFmt.format(route.assignedRiders)} accent />
        <Metric label="Unserved" value={numberFmt.format(route.unservedRiders)} warn={route.unservedRiders > 0} />
        <Metric label="Passenger service" value={`${servicePct}%`} />
        <Metric
          label="Runs (scheduled / required)"
          value={`${numberFmt.format(route.scheduledRuns)} / ${numberFmt.format(route.requiredRuns)}`}
          warn={runsShort}
        />
        <Metric label="Vehicles assigned" value={numberFmt.format(route.vehicleCount)} />
        <Metric label="Headway" value={`${route.headwayMin} min`} />
        <Metric label="Round-trip" value={`${route.roundTripMin} min`} />
      </div>

      {/* Vehicles */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">Vehicles:</span>
        {route.vehicles.length === 0 ? (
          <Badge variant="soft" appearance="danger">
            None assigned — demand unserved
          </Badge>
        ) : (
          route.vehicles.map((v) => (
            <Badge key={v.vehicleId} variant="soft" appearance="secondary">
              {v.vehicleId} · cap {v.capacity}
            </Badge>
          ))
        )}
      </div>

      {/* Expandable schedule + ordered stops */}
      <button
        type="button"
        className="flex w-fit items-center gap-1 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-accent)]"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        {open ? 'Hide full schedule & stops' : 'Show full schedule & stops'}
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-[var(--c3-style-basic-border-weak)] pt-3">
          {/* Ordered stop sequence */}
          <div className="flex flex-col gap-1">
            <h4 className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
              Ordered stop sequence ({route.totalSequenceStops} stops incl. destination)
            </h4>
            <ol className="flex flex-col gap-0.5">
              {route.orderedStops.map((s, idx) => {
                const isDest = idx === route.orderedStops.length - 1;
                return (
                  <li key={s.stop_id} className="flex flex-wrap items-baseline gap-x-2 text-c3-regular-label-l3">
                    <span className="text-[var(--c3-style-basic-fg-primary)]">
                      {idx + 1}. {s.name}
                    </span>
                    <code className="text-[0.68rem] text-[var(--c3-style-basic-fg-secondary)]">{s.stop_id}</code>
                    {isDest ? (
                      <span className="text-[var(--c3-style-basic-fg-secondary)]">
                        · {numberFmt.format(s.assigned)} alighting (destination)
                      </span>
                    ) : (
                      <span className="text-[var(--c3-style-basic-fg-secondary)]">
                        · demand {numberFmt.format(s.demand)} · boarding {numberFmt.format(s.assigned)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Timetable: departures aligned with each downstream stop's arrival */}
          <div className="flex flex-col gap-1">
            <h4 className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
              Timetable ({route.departure_times.length} departure(s))
            </h4>
            {route.departure_times.length === 0 ? (
              <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-warning)]">
                No runs scheduled — no vehicle is assigned to this corridor.
              </p>
            ) : (
              <div className="max-h-72 w-full overflow-auto rounded border border-[var(--c3-style-basic-border-weak)]">
                <table className="w-full border-collapse text-c3-regular-label-l3">
                  <thead>
                    <tr className="bg-[var(--c3-style-basic-bg-hover)] text-left">
                      <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-secondary)]">#</th>
                      <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">
                        Depart {route.pickupStop.name}
                      </th>
                      {route.destinations.map((d) => (
                        <th key={d.stop_id} className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">
                          {d.name ?? d.stop_id}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {route.departure_times.map((dep, i) => (
                      <tr key={dep + i} className="border-t border-[var(--c3-style-basic-border-weak)]">
                        <td className="px-2 py-1 text-[var(--c3-style-basic-fg-secondary)]">{i + 1}</td>
                        <td className="px-2 py-1 tabular-nums text-[var(--c3-style-basic-fg-primary)]">
                          {formatClock(dep)}
                        </td>
                        {route.destinations.map((d) => (
                          <td
                            key={d.stop_id + i}
                            className="px-2 py-1 tabular-nums text-[var(--c3-style-basic-fg-secondary)]"
                          >
                            {formatClock(d.arrival_times[i] ?? null)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              Travel:{' '}
              {route.travelBasis === 'google_directions' ? 'Google Directions' : 'haversine estimate'} ·{' '}
              confidence {route.estimationConfidence}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; accent?: boolean; warn?: boolean }> = ({
  label,
  value,
  accent,
  warn,
}) => (
  <div className="flex flex-col">
    <span className="text-[var(--c3-style-basic-fg-secondary)]">{label}</span>
    <span
      className={
        warn
          ? 'font-medium text-[var(--c3-style-basic-fg-warning)]'
          : accent
            ? 'font-medium text-[var(--c3-style-basic-fg-accent)]'
            : 'font-medium text-[var(--c3-style-basic-fg-primary)]'
      }
    >
      {value}
    </span>
  </div>
);

const TransitPanel: React.FC<TransitPanelProps> = ({ baseline, onBaselineChange }) => {
  const { reportError } = useErrorBoundary();
  const [stopQuery, setStopQuery] = useState<string>('');
  const [stopId, setStopId] = useState<string>('');
  const [maxTrips, setMaxTrips] = useState<number>(20);
  const [hits, setHits] = useState<StopHit[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // New-routes generator state.
  const [numBuses, setNumBuses] = useState<number>(5);
  const [windowDays, setWindowDays] = useState<number>(14);
  const [busCapacity, setBusCapacity] = useState<number>(40);
  const [mtts, setMtts] = useState<number>(7.5);
  const [generating, setGenerating] = useState<boolean>(false);
  const [network, setNetwork] = useState<GeneratedNetwork | null>(null);
  const [showDemand, setShowDemand] = useState<boolean>(false);

  // "Send to SurgePlanner" — author a scenario-scoped SimRunner input from this plan.
  const [sending, setSending] = useState<boolean>(false);
  const [bridge, setBridge] = useState<SimBridgeReport | null>(null);

  const findStops = useCallback(async () => {
    if (!stopQuery.trim()) return;
    setSearching(true);
    setStatusMsg(null);
    try {
      const res = (await c3Action('MtdRoutesClient', 'findStops', [stopQuery.trim()])) as StopHit[];
      setHits(res ?? []);
      if (!res || res.length === 0) setStatusMsg('No stops matched that search.');
    } catch (err) {
      reportError(err);
    } finally {
      setSearching(false);
    }
  }, [stopQuery, reportError]);

  const loadRoutes = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      setStatusMsg(null);
      try {
        const safeTrips = Number.isFinite(maxTrips) && maxTrips > 0 ? Math.floor(maxTrips) : 20;
        const res = (await c3Action('MtdRoutesClient', 'baselineRoutes', [id, safeTrips])) as RouteMap;
        const next: RouteMap = { ...(baseline ?? {}), ...(res ?? {}) };
        onBaselineChange(next);
        const loadedKey = Object.keys(res ?? {})[0];
        const lineCount = loadedKey ? res[loadedKey].lines?.length ?? 0 : 0;
        setStatusMsg(`Loaded ${lineCount} scheduled route(s) serving ${loadedKey ?? id}.`);
      } catch (err) {
        reportError(err);
      } finally {
        setLoading(false);
      }
    },
    [maxTrips, baseline, onBaselineChange, reportError],
  );

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const nBuses = Number.isFinite(numBuses) && numBuses > 0 ? Math.floor(numBuses) : 1;
      const winDays = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : 14;
      const cap = Number.isFinite(busCapacity) && busCapacity > 0 ? Math.floor(busCapacity) : 40;
      const wait = Number.isFinite(mtts) && mtts > 0 ? mtts : 7.5;
      const res = (await c3Action('RoutePlanner', 'generateNetwork', [
        winDays,
        nBuses,
        cap,
        wait,
        baseline ?? null,
      ])) as GeneratedNetwork;
      setNetwork(res ?? null);
      setBridge(null);
    } catch (err) {
      reportError(err);
    } finally {
      setGenerating(false);
    }
  }, [numBuses, windowDays, busCapacity, mtts, baseline, reportError]);

  const sendToSurgePlanner = useCallback(async () => {
    setSending(true);
    try {
      const nBuses = Number.isFinite(numBuses) && numBuses > 0 ? Math.floor(numBuses) : 1;
      const winDays = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : 14;
      const cap = Number.isFinite(busCapacity) && busCapacity > 0 ? Math.floor(busCapacity) : 40;
      const wait = Number.isFinite(mtts) && mtts > 0 ? mtts : 7.5;
      // Deterministic scenario id so re-sending overwrites rather than piling up scenarios.
      const scenarioId = `sc_busplan_${winDays}d_${nBuses}x${cap}`;
      const res = (await c3Action('RouteNetworkSimBridge', 'buildScenario', [
        scenarioId,
        winDays,
        nBuses,
        cap,
        wait,
        true,
      ])) as SimBridgeReport;
      setBridge(res ?? null);
    } catch (err) {
      reportError(err);
    } finally {
      setSending(false);
    }
  }, [numBuses, windowDays, busCapacity, mtts, reportError]);

  const busy = searching || loading;
  const baselineKeys = baseline ? Object.keys(baseline) : [];
  const perEvent: NetworkEventContribution[] = network ? network.plan.demand.perEvent : [];

  return (
    <div className="flex flex-col gap-8">
      {/* ============================ Existing routes ============================ */}
      <section className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-info)]" aria-hidden />
          <div className="flex flex-col gap-1">
            <h2 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">
              Existing MTD routes (scheduled service)
            </h2>
            <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              Live scheduled service from the Champaign-Urbana Mass Transit District API. Each route serving a start
              stop is identified by its public <span className="font-medium">route name / bus number</span>; the 10 with
              the most scheduled trips are shown (ranked by trip frequency — a verified feed metric, not estimated
              ridership). Requires a CUMTD API key in the platform secret store; no key is entered here.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stop-query">Find a stop by name</Label>
              <Input
                id="stop-query"
                type="text"
                placeholder="e.g. Illini Union"
                value={stopQuery}
                disabled={busy}
                className="w-[16rem]"
                onChange={(e) => setStopQuery(e.target.value)}
              />
            </div>
            <Button
              variant="soft"
              appearance="accent"
              disabled={busy}
              loading={searching}
              leadingIcon={<Search />}
              onClick={() => void findStops()}
            >
              Find stops
            </Button>
          </div>

          {hits.length > 0 && (
            <ul className="flex flex-col gap-1">
              {hits.map((h) => (
                <li
                  key={h.stop_id}
                  className="flex items-center justify-between gap-3 rounded border border-[var(--c3-style-basic-border-weak)] px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                      {h.name}
                    </span>
                    <code className="text-[0.72rem] text-[var(--c3-style-basic-fg-secondary)]">{h.stop_id}</code>
                  </div>
                  <Button
                    variant="outline"
                    appearance="secondary"
                    disabled={busy}
                    onClick={() => {
                      setStopId(h.stop_id);
                      void loadRoutes(h.stop_id);
                    }}
                  >
                    Load routes
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-4 border-t border-[var(--c3-style-basic-border-weak)] pt-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stop-id">…or enter a CUMTD stop_id</Label>
              <Input
                id="stop-id"
                type="text"
                placeholder="e.g. IT"
                value={stopId}
                disabled={busy}
                className="w-[12rem]"
                onChange={(e) => setStopId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="max-trips">Max trips sampled</Label>
              <Input
                id="max-trips"
                type="number"
                min={1}
                max={60}
                value={maxTrips}
                disabled={busy}
                className="w-[8rem]"
                onChange={(e) => setMaxTrips(Number(e.target.value))}
              />
            </div>
            <Button
              appearance="accent"
              disabled={busy || !stopId.trim()}
              loading={loading}
              leadingIcon={<Download />}
              onClick={() => void loadRoutes(stopId.trim())}
            >
              Get scheduled routes
            </Button>
          </div>

          {statusMsg && <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-success)]">{statusMsg}</p>}
        </div>

        <div className="flex flex-col gap-5">
          {baselineKeys.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-[var(--c3-style-basic-border-weak)] p-4">
              <Info className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">Existing routes not loaded.</span>{' '}
                Find a stop above and load its scheduled MTD service to display it here. This does not mean no service
                exists — scheduled CUMTD service runs regardless.
              </p>
            </div>
          ) : (
            baselineKeys.map((startStopId) => {
              const info = (baseline as RouteMap)[startStopId];
              const lines: BaselineRouteLine[] = info.lines ?? [];
              return (
                <div key={startStopId} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-c3-bold-label-l1 text-[var(--c3-style-basic-fg-primary)]">
                      Starting point{' '}
                      <code className="rounded bg-[var(--c3-style-basic-bg-hover)] px-1 py-0.5 text-[0.8rem]">
                        {startStopId}
                      </code>
                    </h3>
                    <Badge variant="soft" appearance="success">
                      {Math.min(lines.length || 1, 10)} route(s) by scheduled trips
                    </Badge>
                  </div>
                  {lines.length === 0 ? (
                    <FullRoute
                      label="Route"
                      startName={startStopId}
                      startStopId={startStopId}
                      departureTimes={info.departure_times}
                      destinations={info.destinations}
                    />
                  ) : (
                    lines.map((ln) => (
                      <FullRoute
                        key={ln.routeId}
                        label={`Route ${ln.busNumber}`}
                        startName={startStopId}
                        startStopId={startStopId}
                        departureTimes={ln.departure_times}
                        destinations={ln.destinations}
                        badges={
                          <>
                            <Badge variant="soft" appearance="secondary">
                              {ln.tripCount} scheduled trip(s)
                            </Badge>
                            <Badge variant="outline" appearance="secondary">
                              {ln.routeId}
                            </Badge>
                          </>
                        }
                      />
                    ))
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ============================ New (proposed) routes ============================ */}
      <section className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
          <div className="flex flex-col gap-1">
            <h2 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">
              New supplemental routes (proposals)
            </h2>
            <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              Proposed <span className="font-medium">additional</span> service built from aggregated event demand.
              Routes are demand corridors (targeting ~10 stops each) connecting rider origins to the actual event
              destinations; the <span className="font-medium">fleet of buses</span> is then assigned to those routes —
              buses do not map one-to-one to routes. Each attendee is counted once; demand uses the configured transit
              share. Any loaded scheduled routes are used for cadence comparison and stop-count targeting.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="num-buses">Fleet size (buses)</Label>
            <Input
              id="num-buses"
              type="number"
              min={1}
              max={50}
              value={numBuses}
              disabled={generating}
              className="w-[8rem]"
              onChange={(e) => setNumBuses(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="window-days">Window (days)</Label>
            <Input
              id="window-days"
              type="number"
              min={1}
              max={60}
              value={windowDays}
              disabled={generating}
              className="w-[8rem]"
              onChange={(e) => setWindowDays(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bus-cap">Bus capacity</Label>
            <Input
              id="bus-cap"
              type="number"
              min={1}
              max={200}
              value={busCapacity}
              disabled={generating}
              className="w-[8rem]"
              onChange={(e) => setBusCapacity(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mtts">Mean time to service (min)</Label>
            <Input
              id="mtts"
              type="number"
              min={1}
              max={60}
              step={0.5}
              value={mtts}
              disabled={generating}
              className="w-[11rem]"
              onChange={(e) => setMtts(Number(e.target.value))}
            />
          </div>
          <Button
            appearance="accent"
            disabled={generating}
            loading={generating}
            leadingIcon={<Bus />}
            onClick={() => void generate()}
          >
            Generate proposed routes
          </Button>
        </div>

        {network && (
          <div className="flex flex-col gap-4">
            {/* Live route map — proposed routes on a real OSM street basemap with moving buses */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-c3-bold-label-l2">
                <MapPin className="size-4" aria-hidden />
                Proposed route network — live map
              </div>
              <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                {"Each proposed route is drawn through its real stop coordinates on the OpenStreetMap "}
                {"basemap, with buses animating along it (one per assigned vehicle). Segments connect "}
                {"consecutive real stops."}
              </p>
              <TransitRouteMap network={network} />
            </div>

            {/* Network summary */}
            <div className="flex flex-col gap-2 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
              <div className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3 lg:grid-cols-4 text-c3-regular-label-l3">
                <Metric
                  label="Routes proposed"
                  value={numberFmt.format(network.plan.fleet.routeCount)}
                />
                <Metric
                  label="Fleet used / requested"
                  value={`${numberFmt.format(network.plan.fleet.used)} / ${numberFmt.format(
                    network.plan.fleet.requested,
                  )}`}
                />
                <Metric label="Events used" value={numberFmt.format(network.plan.demand.eventsUsed)} />
                <Metric
                  label="Estimated demand"
                  value={numberFmt.format(network.plan.coverage.estimatedDemand)}
                />
                <Metric
                  label="Riders assigned"
                  value={numberFmt.format(network.plan.coverage.assignedRiders)}
                  accent
                />
                <Metric
                  label="Unserved riders"
                  value={numberFmt.format(network.plan.coverage.unservedRiders)}
                  warn={network.plan.coverage.unservedRiders > 0}
                />
                <Metric
                  label="Passenger service"
                  value={`${network.plan.coverage.passengerServicePct}%`}
                />
                <Metric
                  label="Pickup-location coverage"
                  value={`${network.plan.coverage.locationCoveragePct}%`}
                />
              </div>
              <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Passenger service (riders assigned ÷ estimated demand) is distinct from pickup-location coverage (stops
                served ÷ stops planned). Transit share {Math.round(network.plan.demand.transitShare * 100)}%. Target ~
                {network.plan.fleet.targetStopsPerRoute} stops per route.
              </p>
              <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                {network.plan.outboundNote}
              </p>
            </div>

            {/* Demand audit (expandable) */}
            <div className="flex flex-col gap-2 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
              <button
                type="button"
                className="flex w-fit items-center gap-1 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-accent)]"
                onClick={() => setShowDemand((v) => !v)}
              >
                {showDemand ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                Demand audit — each event&apos;s contribution ({perEvent.length} event(s)
                {network.plan.demand.eventsUnknownDemand > 0
                  ? `, ${network.plan.demand.eventsUnknownDemand} with unknown attendance`
                  : ''}
                )
              </button>
              {showDemand && (
                <div className="max-h-80 w-full overflow-auto rounded border border-[var(--c3-style-basic-border-weak)]">
                  <table className="w-full border-collapse text-c3-regular-label-l3">
                    <thead>
                      <tr className="bg-[var(--c3-style-basic-bg-hover)] text-left">
                        <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">Event</th>
                        <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">Destination</th>
                        <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">Attendance</th>
                        <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">Basis</th>
                        <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">Inbound</th>
                        <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">Outbound</th>
                        <th className="px-2 py-1 font-medium text-[var(--c3-style-basic-fg-primary)]">Origins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perEvent.map((e) => (
                        <tr key={e.eventId} className="border-t border-[var(--c3-style-basic-border-weak)]">
                          <td className="px-2 py-1 text-[var(--c3-style-basic-fg-primary)]">{e.name}</td>
                          <td className="px-2 py-1 text-[var(--c3-style-basic-fg-secondary)]">{e.venue}</td>
                          <td className="px-2 py-1 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                            {e.attendance != null ? numberFmt.format(e.attendance) : 'Unknown'}
                          </td>
                          <td className="px-2 py-1 text-[var(--c3-style-basic-fg-secondary)]">{e.attendanceBasis}</td>
                          <td className="px-2 py-1 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                            {e.inboundDemand != null ? numberFmt.format(e.inboundDemand) : '—'}
                          </td>
                          <td className="px-2 py-1 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                            {e.outboundDemand != null ? numberFmt.format(e.outboundDemand) : '—'}
                          </td>
                          <td className="px-2 py-1 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                            {numberFmt.format(e.originStops)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {network.routes.length === 0 ? (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                No proposed routes could be built from the current demand.
              </p>
            ) : (
              network.routes.map((r) => <ProposedRouteCard key={r.routeId} route={r} />)
            )}

            {/* Hand-off to the SurgePlanner simulator */}
            <div className="flex flex-col gap-3 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
              <div className="flex items-start gap-2">
                <Waypoints className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
                <div className="flex flex-col gap-1">
                  <h3 className="text-c3-bold-label-l1 text-[var(--c3-style-basic-fg-primary)]">
                    Evaluate in SurgePlanner
                  </h3>
                  <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    Map this plan into a scenario-scoped simulator input: event demand becomes passenger journeys,
                    the proposed fleet becomes the supplemental extra-bus pool, and SurgePlanner sweeps every
                    allocation (0…{Math.max(1, Math.floor(numBuses) || 1)} buses) against a fixed baseline. Existing
                    MTD core service is omitted (the CUMTD feed has no stop coordinates), so the baseline runs with no
                    core capacity — the comparison is &quot;proposed supplemental vs. no supplemental service.&quot;
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  appearance="accent"
                  disabled={sending}
                  loading={sending}
                  leadingIcon={<Waypoints />}
                  onClick={() => void sendToSurgePlanner()}
                >
                  Send to SurgePlanner
                </Button>
                {bridge && (
                  <Button variant="outline" appearance="secondary" asChild>
                    <Link to="/surge-planner">
                      <ExternalLink className="size-4" aria-hidden /> Open SurgePlanner
                    </Link>
                  </Button>
                )}
              </div>

              {bridge && (
                <div className="flex flex-col gap-2 border-t border-[var(--c3-style-basic-border-weak)] pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="soft" appearance={bridge.validation.isValid ? 'success' : 'danger'}>
                      {bridge.validation.isValid ? 'Scenario valid' : `${bridge.validation.errorCount} validation error(s)`}
                    </Badge>
                    <Badge variant="soft" appearance={bridge.reconciliation.match ? 'success' : 'warning'}>
                      {bridge.reconciliation.match ? (
                        <>
                          <CheckCircle2 className="size-3.5" aria-hidden /> Rider totals reconciled
                        </>
                      ) : (
                        'Rider totals differ'
                      )}
                    </Badge>
                    <code className="text-[0.72rem] text-[var(--c3-style-basic-fg-secondary)]">
                      {bridge.scenarioId}
                    </code>
                  </div>

                  <div className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3 lg:grid-cols-4 text-c3-regular-label-l3">
                    <Metric
                      label="Planner demand"
                      value={numberFmt.format(bridge.reconciliation.plannerEstimatedDemand)}
                    />
                    <Metric
                      label="Mapped inbound riders"
                      value={numberFmt.format(bridge.reconciliation.mappedInboundDemand)}
                      accent
                    />
                    <Metric label="Events mapped" value={numberFmt.format(bridge.created.events)} />
                    <Metric label="Stops" value={numberFmt.format(bridge.created.stops)} />
                    <Metric label="Extra buses" value={numberFmt.format(bridge.created.extraBuses)} />
                    <Metric label="Travel links" value={numberFmt.format(bridge.created.travelLinks)} />
                  </div>

                  <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    Service window {bridge.horizon.serviceDate} · horizon {formatClock(bridge.horizon.horizonStart)}–
                    {formatClock(bridge.horizon.horizonEnd)}. Open SurgePlanner and pick scenario{' '}
                    <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">{bridge.scenarioId}</span> to
                    run the allocation sweep.
                  </p>

                  {!bridge.validation.isValid &&
                    Array.isArray(bridge.validation.errors) &&
                    bridge.validation.errors.length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {bridge.validation.errors.map((e, i) => (
                          <li
                            key={`${e.code}-${i}`}
                            className="flex items-start gap-1.5 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-danger)]"
                          >
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <span>
                              <span className="font-medium">{e.code}:</span> {e.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default TransitPanel;
