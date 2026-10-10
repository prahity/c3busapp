import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bus,
  ChevronDown,
  ChevronRight,
  Clock,
  GitMerge,
  Layers,
  MapPin,
  Navigation,
  Route as RouteIcon,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { c3Action } from '@/c3Action';
import {
  CampusEventCategory,
  FieldProvenance,
  GeneratedRoute,
  MergedEvent,
  RouteMap,
  StopCandidate,
} from '@/Interfaces';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MetricCard,
  MetricCardCaption,
  MetricCardHeader,
  MetricCardLabel,
  MetricCardValue,
} from '@/components/ui/metric-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';

type BadgeAppearance = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const CATEGORY_APPEARANCE: Record<CampusEventCategory, BadgeAppearance> = {
  Sports: 'danger',
  Concert: 'accent',
  Academic: 'info',
  Conference: 'primary',
  Social: 'success',
  Arts: 'warning',
  Other: 'secondary',
};

const numberFmt = new Intl.NumberFormat('en-US');
const HARD_CAP = 300;
const RESOLVE_WINDOW_DAYS = 60;

interface ResolvedPanelProps {
  /** Optional CUMTD baseline-route map (loaded in the Transit tab) fed to the route planner. */
  baseline: RouteMap | null;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatClock(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function reputationAppearance(score?: number): BadgeAppearance {
  if (score == null) return 'secondary';
  if (score >= 0.8) return 'success';
  if (score >= 0.6) return 'warning';
  return 'danger';
}

function formatValue(v: string | number | boolean | null): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return numberFmt.format(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  return v;
}

const StopList: React.FC<{ title: string; icon: React.ReactNode; stops?: StopCandidate[] }> = ({
  title,
  icon,
  stops,
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
      {icon}
      {title}
    </div>
    {!stops || stops.length === 0 ? (
      <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
        No candidates (event has no mapped venue or coordinates).
      </p>
    ) : (
      <ul className="flex flex-col gap-1">
        {stops.map((s, i) => (
          <li
            key={`${s.name}-${i}`}
            className="flex items-center justify-between gap-3 rounded border border-[var(--c3-style-basic-border-weak)] px-2.5 py-1.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">{s.name}</span>
              <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                {s.method} · {s.stopType} · {numberFmt.format(s.distanceMeters)} m
              </span>
            </div>
            <Badge variant="soft" appearance={s.score >= 0.75 ? 'success' : s.score >= 0.4 ? 'warning' : 'secondary'}>
              {s.score.toFixed(2)}
            </Badge>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const ProvenanceTable: React.FC<{ provenance?: Record<string, FieldProvenance> }> = ({ provenance }) => {
  const entries = useMemo(() => Object.entries(provenance ?? {}), [provenance]);
  if (entries.length === 0) {
    return <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">No provenance recorded.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
        <Layers className="size-4" aria-hidden />
        Field provenance
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            <TableHead>Chosen value</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Conflicting alternatives</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([field, p]) => {
            const hasConflict = (p.alternatives?.length ?? 0) > 0;
            return (
              <TableRow key={field}>
                <TableCell className="font-medium text-[var(--c3-style-basic-fg-primary)]">{field}</TableCell>
                <TableCell>{formatValue(p.value)}</TableCell>
                <TableCell>
                  <Badge variant="soft" appearance={p.source === 'Manual' ? 'secondary' : 'info'}>
                    {p.source} · {p.reputation?.toFixed(2)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {!hasConflict ? (
                    <span className="text-[var(--c3-style-basic-fg-secondary)]">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {p.alternatives.map((alt, i) => (
                        <span key={i} className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                          <Badge variant="outline" appearance="warning" className="mr-1">
                            {alt.source} · {alt.reputation?.toFixed(2)}
                          </Badge>
                          {formatValue(alt.value)}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

/** Renders a generated route and its transparent planning rationale. */
const RoutePlanView: React.FC<{ result: GeneratedRoute }> = ({ result }) => {
  const { plan, route } = result;
  const startStopId = Object.keys(route)[0];
  const info = startStopId ? route[startStopId] : undefined;
  const svc = plan.service;
  return (
    <div className="flex flex-col gap-4 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-page)] p-3">
      {/* Service summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryStat label="Demand" value={numberFmt.format(plan.event.demand)} caption={plan.event.demandBasis} />
        <SummaryStat label="Headway" value={`${svc.headwayMin} min`} caption={`buses every ${svc.headwayMin} min`} />
        <SummaryStat label="Buses" value={numberFmt.format(svc.busesScheduled)} caption={`need ${svc.departuresNeeded}`} />
        <SummaryStat label="Capacity" value={`${svc.busCapacity}/bus`} caption={`MTTS ${svc.meanTimeToServiceMin} min`} />
        <SummaryStat label="Travel" value={`${plan.travel.totalMinutes} min`} caption={plan.travel.basis.replace(/_/g, ' ')} />
        <SummaryStat
          label="Service window"
          value={`${formatClock(svc.firstDeparture)}–${formatClock(svc.lastDeparture)}`}
          caption={`${svc.serviceWindowMin} min before start`}
        />
      </div>

      {/* Convolution + legs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
            <GitMerge className="size-4" aria-hidden />
            Route convolution ({plan.convolution.originCandidates} origins → {plan.convolution.consolidatedStops} stops,{' '}
            {plan.convolution.kernelMeters} m kernel)
          </div>
          <ul className="flex flex-col gap-1">
            {plan.convolution.stops.map((s) => (
              <li
                key={s.stop_id}
                className="flex items-center justify-between gap-3 rounded border border-[var(--c3-style-basic-border-weak)] px-2.5 py-1.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                    {s.name}
                  </span>
                  {s.members.length > 1 && (
                    <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                      merged: {s.members.join(', ')}
                    </span>
                  )}
                </div>
                <Badge variant="soft" appearance="info">
                  ~{numberFmt.format(s.estimatedRiders)} riders
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
            <Navigation className="size-4" aria-hidden />
            Per-leg travel ({plan.travel.basis.replace(/_/g, ' ')})
          </div>
          <ul className="flex flex-col gap-1">
            {plan.travel.legs.map((leg, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded border border-[var(--c3-style-basic-border-weak)] px-2.5 py-1.5"
              >
                <span className="truncate text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                  {leg.from} → {leg.to}
                </span>
                <span className="shrink-0 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  {leg.minutes} min · {numberFmt.format(leg.meters)} m
                </span>
              </li>
            ))}
          </ul>
          <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            {plan.baselineComparison.note}
          </p>
        </div>
      </div>

      {/* Generated route (same nested shape as the MTD baseline) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
          <Clock className="size-4" aria-hidden />
          Generated route — start stop{' '}
          <code className="rounded bg-[var(--c3-style-basic-bg-hover)] px-1 py-0.5 text-[0.75rem]">{startStopId}</code>
        </div>
        {info && (
          <div className="flex flex-col gap-2">
            <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              {info.departure_times.length} departures:{' '}
              {info.departure_times.slice(0, 6).map((t) => formatClock(t)).join(', ')}
              {info.departure_times.length > 6 ? ', …' : ''}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination stop</TableHead>
                  <TableHead>stop_id</TableHead>
                  <TableHead>First arrival</TableHead>
                  <TableHead className="text-right">Arrivals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {info.destinations.map((d) => (
                  <TableRow key={d.stop_id}>
                    <TableCell className="font-medium text-[var(--c3-style-basic-fg-primary)]">{d.name ?? '—'}</TableCell>
                    <TableCell>
                      <code className="text-[0.75rem] text-[var(--c3-style-basic-fg-secondary)]">{d.stop_id}</code>
                    </TableCell>
                    <TableCell>{formatClock(d.arrival_times[0])}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.arrival_times.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryStat: React.FC<{ label: string; value: string; caption?: string }> = ({ label, value, caption }) => (
  <div className="flex flex-col rounded border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] px-2.5 py-2">
    <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{label}</span>
    <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{value}</span>
    {caption && <span className="truncate text-[0.7rem] text-[var(--c3-style-basic-fg-secondary)]">{caption}</span>}
  </div>
);

/** Per-event route generator: capacity/MTTS inputs + "Generate route" calling the backend. */
const RouteGenerator: React.FC<{ eventId: string; baseline: RouteMap | null }> = ({ eventId, baseline }) => {
  const { reportError } = useErrorBoundary();
  const [mtts, setMtts] = useState<number>(7.5);
  const [busCap, setBusCap] = useState<number>(40);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<GeneratedRoute | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const safeMtts = Number.isFinite(mtts) && mtts > 0 ? mtts : 7.5;
      const safeCap = Number.isFinite(busCap) && busCap > 0 ? Math.floor(busCap) : 40;
      const res = (await c3Action('RoutePlanner', 'generateRoute', [
        eventId,
        safeMtts,
        safeCap,
        baseline,
      ])) as GeneratedRoute;
      setResult(res);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }, [eventId, mtts, busCap, baseline, reportError]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
        <RouteIcon className="size-4" aria-hidden />
        Generate a bus route
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`mtts-${eventId}`}>Mean time to service (min)</Label>
          <Input
            id={`mtts-${eventId}`}
            type="number"
            min={1}
            step={0.5}
            value={mtts}
            disabled={loading}
            className="w-[11rem]"
            onChange={(e) => setMtts(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cap-${eventId}`}>Bus capacity (riders)</Label>
          <Input
            id={`cap-${eventId}`}
            type="number"
            min={1}
            value={busCap}
            disabled={loading}
            className="w-[9rem]"
            onChange={(e) => setBusCap(Number(e.target.value))}
          />
        </div>
        <Button appearance="accent" disabled={loading} loading={loading} leadingIcon={<Bus />} onClick={() => void generate()}>
          Generate route
        </Button>
        {baseline && (
          <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Using {Object.keys(baseline).length} baseline route(s) from the Transit tab.
          </span>
        )}
      </div>
      {result && <RoutePlanView result={result} />}
    </div>
  );
};

const ResolvedPanel: React.FC<ResolvedPanelProps> = ({ baseline }) => {
  const { reportError } = useErrorBoundary();
  const [merged, setMerged] = useState<MergedEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [resolving, setResolving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchMerged = useCallback(async (): Promise<MergedEvent[]> => {
    const res = await c3Action('MergedEvent', 'fetch', {
      limit: HARD_CAP,
      offset: 0,
      order: 'startTime',
      include: 'this, venue.id, venue.name, venue.capacity, venue.latitude, venue.longitude',
    });
    return (res?.objs ?? []) as MergedEvent[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const objs = await fetchMerged();
        if (!cancelled) setMerged(objs);
      } catch (err) {
        if (!cancelled) reportError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMerged, reportError]);

  const resolveNow = useCallback(async () => {
    setResolving(true);
    setStatusMsg(null);
    try {
      const summary = (await c3Action('EventResolver', 'resolveAll', [RESOLVE_WINDOW_DAYS])) as {
        rawEvents: number;
        clusters: number;
        merged: number;
      };
      setStatusMsg(
        `Resolved ${numberFmt.format(summary?.rawEvents ?? 0)} raw observation(s) into ` +
          `${numberFmt.format(summary?.merged ?? 0)} merged event(s).`,
      );
      const objs = await fetchMerged();
      setMerged(objs);
    } catch (err) {
      reportError(err);
    } finally {
      setResolving(false);
    }
  }, [fetchMerged, reportError]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const stats = useMemo(() => {
    const count = merged.length;
    const multiSource = merged.filter((m) => (m.sourceCount ?? 1) > 1).length;
    const totalPop = merged.reduce((sum, m) => sum + (m.estimatedPopulation ?? 0), 0);
    const avgRep = count === 0 ? 0 : merged.reduce((sum, m) => sum + (m.reputationScore ?? 0), 0) / count;
    return { count, multiSource, totalPop, avgRep };
  }, [merged]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">Deduplicate, merge &amp; score</h2>
          <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Run the resolver to turn raw observations into canonical events with a reputation score, a
            reputation-weighted population estimate, field-level provenance, and candidate start/end stops.
          </p>
        </div>
        <Button
          className="shrink-0"
          appearance="accent"
          disabled={loading || resolving}
          loading={resolving}
          leadingIcon={<GitMerge />}
          onClick={() => void resolveNow()}
        >
          Resolve events
        </Button>
      </div>

      {statusMsg && <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-success)]">{statusMsg}</p>}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard>
              <MetricCardHeader>
                <Layers className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Merged events</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{numberFmt.format(stats.count)}</MetricCardValue>
              <MetricCardCaption>Canonical records after dedup</MetricCardCaption>
            </MetricCard>

            <MetricCard>
              <MetricCardHeader>
                <GitMerge className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Multi-source</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{numberFmt.format(stats.multiSource)}</MetricCardValue>
              <MetricCardCaption>Events corroborated by 2+ sources</MetricCardCaption>
            </MetricCard>

            <MetricCard>
              <MetricCardHeader>
                <ShieldCheck className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Avg reputation</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{stats.avgRep.toFixed(2)}</MetricCardValue>
              <MetricCardCaption>Mean confidence across events</MetricCardCaption>
            </MetricCard>

            <MetricCard>
              <MetricCardHeader>
                <Users className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Estimated population</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{numberFmt.format(stats.totalPop)}</MetricCardValue>
              <MetricCardCaption>Reputation-weighted total demand</MetricCardCaption>
            </MetricCard>
          </div>

          <div className="rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
            <h2 className="mb-4 text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">Canonical events</h2>
            {merged.length === 0 ? (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                No resolved events yet. Click <span className="font-medium">Resolve events</span> to run the dedup/merge
                pipeline over the collected observations.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" aria-label="Expand" />
                    <TableHead>Event</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Venue / location</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead className="text-right">Reputation</TableHead>
                    <TableHead className="text-right">Est. population</TableHead>
                    <TableHead className="text-right">Sources</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merged.map((m) => {
                    const isOpen = !!expanded[m.id];
                    return (
                      <React.Fragment key={m.id}>
                        <TableRow>
                          <TableCell>
                            <button
                              type="button"
                              aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                              className="flex size-6 items-center justify-center rounded hover:bg-[var(--c3-style-basic-bg-hover)]"
                              onClick={() => toggle(m.id)}
                            >
                              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium text-[var(--c3-style-basic-fg-primary)]">{m.name}</TableCell>
                          <TableCell>
                            {m.category ? (
                              <Badge variant="soft" appearance={CATEGORY_APPEARANCE[m.category]}>
                                {m.category}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>{m.venue?.name ?? m.locationName ?? '—'}</TableCell>
                          <TableCell>{formatDateTime(m.startTime)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="soft" appearance={reputationAppearance(m.reputationScore)}>
                              {m.reputationScore != null ? m.reputationScore.toFixed(2) : '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.estimatedPopulation != null ? numberFmt.format(m.estimatedPopulation) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{m.sourceCount ?? 1}</TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-[var(--c3-style-basic-bg-page)]">
                              <div className="flex flex-col gap-5 py-2">
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                                      Reputation basis
                                    </span>
                                    <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                                      {m.reputationBasis ?? '—'}
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                                      Population basis
                                    </span>
                                    <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                                      {m.populationBasis ?? '—'}
                                    </span>
                                  </div>
                                </div>

                                <ProvenanceTable provenance={m.fieldProvenance} />

                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                  <StopList
                                    title="Start stops (rider origins)"
                                    icon={<Navigation className="size-4" aria-hidden />}
                                    stops={m.startStopCandidates}
                                  />
                                  <StopList
                                    title="End stops (near the venue)"
                                    icon={<MapPin className="size-4" aria-hidden />}
                                    stops={m.endStopCandidates}
                                  />
                                </div>

                                <RouteGenerator eventId={m.id} baseline={baseline} />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ResolvedPanel;
