import React, { useMemo } from 'react';
import { ArrowRight, Lightbulb, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import type {
  RouteId,
  SimBusItinerary,
  SimPlan,
  SimRouteDef,
  SimStop,
  SimStopWindowDelay,
  StopId,
} from '../contracts/types';
import { NO_DATA, fmtMin, fmtNum } from '../format';
import { useRunContext } from '../runContext';
import SimRouteMap from './SimRouteMap';

interface OpportunityCardsProps {
  /** `comparison.baseline.stopWindowDelays`. */
  baselineDelays: SimStopWindowDelay[];
  /** The selected candidate's `stopWindowDelays`. */
  candidateDelays: SimStopWindowDelay[];
  /** The selected candidate's plan, or null at allocation 0. */
  plan: SimPlan | null;
  stops: SimStop[];
  routes: SimRouteDef[];
  /** Scheduled core trips per route — passed through so the compact maps animate core buses. */
  coreBusCounts: Map<RouteId, number>;
  /** Shared replay position so the card maps scrub in lockstep with the hero maps. */
  t: number;
}

/** What the backend reported at one stop over one span of windows. */
interface WindowStats {
  worstWaitMinutes: number | null;
  observedWindows: number;
  passengers: number;
  censored: number;
}

function statsFor(delays: SimStopWindowDelay[], stopId: StopId, fromMs: number, toMs: number): WindowStats {
  const out: WindowStats = { worstWaitMinutes: null, observedWindows: 0, passengers: 0, censored: 0 };
  for (const row of delays) {
    if (row.stopId !== stopId) continue;
    const start = Date.parse(row.windowStart);
    const end = Date.parse(row.windowEnd);
    // Keep any window that overlaps the targeted span.
    if (Number.isNaN(start) || Number.isNaN(end) || end <= fromMs || start >= toMs) continue;
    if (!row.hasObservations) continue;
    out.observedWindows += 1;
    out.passengers += row.supportingPassengerCount;
    out.censored += row.censoredPassengerCount;
    if (row.estimatedWaitMinutes != null) {
      out.worstWaitMinutes = Math.max(out.worstWaitMinutes ?? 0, row.estimatedWaitMinutes);
    }
  }
  return out;
}

/** One targeted bottleneck, assembled from the trips the planner aimed at it. */
interface TargetedStop {
  stopId: StopId;
  destinationStopId: StopId | null;
  fromMs: number;
  toMs: number;
  windowStart: string | null;
  windowEnd: string | null;
  tripCount: number;
  buses: SimBusItinerary[];
  expectedBoardings: number | null;
  expectedWaitingMinutesSaved: number | null;
  explanations: string[];
}

function collectTargets(plan: SimPlan | null): TargetedStop[] {
  if (!plan) return [];
  const byStop = new Map<StopId, TargetedStop>();
  for (const bus of plan.extraBusItineraries) {
    for (const trip of bus.trips) {
      const stopId = trip.targetStopId;
      if (!stopId) continue;
      const start = trip.targetWindowStart ? Date.parse(trip.targetWindowStart) : NaN;
      const end = trip.targetWindowEnd ? Date.parse(trip.targetWindowEnd) : NaN;
      let entry = byStop.get(stopId);
      if (!entry) {
        entry = {
          stopId,
          destinationStopId: trip.targetDestinationStopId ?? null,
          fromMs: Number.POSITIVE_INFINITY,
          toMs: Number.NEGATIVE_INFINITY,
          windowStart: null,
          windowEnd: null,
          tripCount: 0,
          buses: [],
          expectedBoardings: null,
          expectedWaitingMinutesSaved: null,
          explanations: [],
        };
        byStop.set(stopId, entry);
      }
      entry.tripCount += 1;
      if (!entry.buses.includes(bus)) entry.buses.push(bus);
      if (!entry.destinationStopId && trip.targetDestinationStopId) entry.destinationStopId = trip.targetDestinationStopId;
      if (!Number.isNaN(start) && start < entry.fromMs) {
        entry.fromMs = start;
        entry.windowStart = trip.targetWindowStart ?? null;
      }
      if (!Number.isNaN(end) && end > entry.toMs) {
        entry.toMs = end;
        entry.windowEnd = trip.targetWindowEnd ?? null;
      }
      if (trip.expectedBoardings != null) entry.expectedBoardings = (entry.expectedBoardings ?? 0) + trip.expectedBoardings;
      if (trip.expectedWaitingMinutesSaved != null) {
        entry.expectedWaitingMinutesSaved = (entry.expectedWaitingMinutesSaved ?? 0) + trip.expectedWaitingMinutesSaved;
      }
      if (trip.explanation && !entry.explanations.includes(trip.explanation)) entry.explanations.push(trip.explanation);
    }
  }

  // A trip with no target window still gets compared against the whole day.
  for (const entry of byStop.values()) {
    if (!Number.isFinite(entry.fromMs)) entry.fromMs = Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(entry.toMs)) entry.toMs = Number.POSITIVE_INFINITY;
  }

  return [...byStop.values()].sort((a, b) => (b.expectedWaitingMinutesSaved ?? 0) - (a.expectedWaitingMinutesSaved ?? 0));
}

function StatLine({ stats }: { stats: WindowStats }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-c3-regular-label-l2">
      <dt className="text-[var(--c3-style-basic-fg-secondary)]">Worst expected wait</dt>
      <dd className="text-right tabular-nums text-[var(--c3-style-basic-fg-primary)]">
        {stats.observedWindows === 0 ? NO_DATA : fmtMin(stats.worstWaitMinutes)}
      </dd>
      <dt className="text-[var(--c3-style-basic-fg-secondary)]">Windows with observations</dt>
      <dd className="text-right tabular-nums text-[var(--c3-style-basic-fg-primary)]">{fmtNum(stats.observedWindows)}</dd>
      <dt className="text-[var(--c3-style-basic-fg-secondary)]">Passengers waiting</dt>
      <dd className="text-right tabular-nums text-[var(--c3-style-basic-fg-primary)]">
        {stats.observedWindows === 0 ? NO_DATA : fmtNum(stats.passengers)}
      </dd>
      <dt className="text-[var(--c3-style-basic-fg-secondary)]">Still waiting at horizon</dt>
      <dd className="text-right tabular-nums text-[var(--c3-style-basic-fg-primary)]">
        {stats.observedWindows === 0 ? NO_DATA : fmtNum(stats.censored)}
      </dd>
    </dl>
  );
}

/**
 * Where the plan intervenes, and what the backend says changed there.
 *
 * Each card is one stop the planner aimed supplemental trips at. The left side
 * is the baseline's reported wait at that stop over the targeted windows; the
 * right side is the candidate's. Both come from `stopWindowDelays`. The "why"
 * text is the planner's own `explanation` — it is not restated or embellished
 * here. Stops the plan left alone but where the baseline still reports long
 * waits are listed separately rather than quietly dropped.
 */
export default function OpportunityCards({
  baselineDelays,
  candidateDelays,
  plan,
  stops,
  routes,
  coreBusCounts,
  t,
}: OpportunityCardsProps) {
  const { stopName, time } = useRunContext();
  const targets = useMemo(() => collectTargets(plan), [plan]);

  const unaddressed = useMemo(() => {
    const targeted = new Set(targets.map((t) => t.stopId));
    const worst = new Map<StopId, { stopId: StopId; wait: number; window: SimStopWindowDelay }>();
    for (const row of baselineDelays) {
      if (targeted.has(row.stopId)) continue;
      if (!row.hasObservations || row.estimatedWaitMinutes == null) continue;
      const existing = worst.get(row.stopId);
      if (!existing || row.estimatedWaitMinutes > existing.wait) {
        worst.set(row.stopId, { stopId: row.stopId, wait: row.estimatedWaitMinutes, window: row });
      }
    }
    return [...worst.values()].sort((a, b) => b.wait - a.wait).slice(0, 6);
  }, [baselineDelays, targets]);

  if (targets.length === 0 && unaddressed.length === 0) {
    return (
      <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
        The plan targets no stop at this allocation, and the baseline reports no stop where simulated passengers waited
        with a measurable wait. There is nothing for extra buses to improve in this scenario.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {targets.map((target) => {
        const base = statsFor(baselineDelays, target.stopId, target.fromMs, target.toMs);
        const cand = statsFor(candidateDelays, target.stopId, target.fromMs, target.toMs);
        const delta =
          base.worstWaitMinutes != null && cand.worstWaitMinutes != null ? cand.worstWaitMinutes - base.worstWaitMinutes : null;
        const focusIds = [target.stopId, target.destinationStopId].filter((id): id is StopId => id != null);

        return (
          <article key={target.stopId} className="rounded-sm border border-[var(--c3-style-basic-border-weak)] p-4">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <Lightbulb className="size-4 text-[var(--c3-style-basic-fg-warning)]" aria-hidden />
              <h3 className="flex flex-wrap items-center gap-1.5 text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                <span>{stopName(target.stopId)}</span>
                {target.destinationStopId && (
                  <>
                    <ArrowRight className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                    <span>{stopName(target.destinationStopId)}</span>
                  </>
                )}
              </h3>
              <Badge variant="soft" appearance="secondary" size="sm">
                {target.windowStart || target.windowEnd ? time.range(target.windowStart, target.windowEnd) : 'whole horizon'}
              </Badge>
              <Badge variant="soft" appearance="accent" size="sm">
                {target.tripCount} trip{target.tripCount === 1 ? '' : 's'} · {target.buses.length} bus
                {target.buses.length === 1 ? '' : 'es'}
              </Badge>
              {delta != null && (
                <Badge variant="soft" appearance={delta < 0 ? 'success' : delta > 0 ? 'danger' : 'secondary'} size="sm">
                  worst wait {delta > 0 ? '+' : ''}
                  {delta.toFixed(1)} min
                </Badge>
              )}
              <span className="ml-auto text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                expected {target.expectedBoardings == null ? NO_DATA : fmtNum(target.expectedBoardings)} boardings ·{' '}
                {target.expectedWaitingMinutesSaved == null
                  ? `waiting saved ${NO_DATA}`
                  : `${fmtNum(target.expectedWaitingMinutesSaved)} waiting min saved`}
              </span>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="text-c3-bold-label-l3 uppercase tracking-wide text-[var(--c3-style-basic-fg-secondary)]">
                  Without changes
                </span>
                <SimRouteMap
                  title=""
                  stops={stops}
                  routes={routes}
                  delays={baselineDelays}
                  coreBusCounts={coreBusCounts}
                  focusStopIds={focusIds}
                  highlightStopIds={focusIds}
                  compact
                  t={t}
                />
                <StatLine stats={base} />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-c3-bold-label-l3 uppercase tracking-wide text-[var(--c3-style-basic-fg-secondary)]">
                  With recommendations
                </span>
                <SimRouteMap
                  title=""
                  stops={stops}
                  routes={routes}
                  delays={candidateDelays}
                  coreBusCounts={coreBusCounts}
                  itineraries={target.buses}
                  focusStopIds={focusIds}
                  highlightStopIds={focusIds}
                  compact
                  t={t}
                />
                <StatLine stats={cand} />
              </div>
            </div>

            {target.explanations.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {target.explanations.map((why) => (
                  <p key={why} className="flex items-start gap-2 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">Planner: </span>
                      {why}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </article>
        );
      })}

      {unaddressed.length > 0 && (
        <section className="flex flex-col gap-2 rounded-sm border border-dashed border-[var(--c3-style-basic-border-weak)] p-4">
          <h3 className="flex items-center gap-2 text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
            <TriangleAlert className="size-4 text-[var(--c3-style-basic-fg-warning)]" aria-hidden />
            Not addressed by this plan
          </h3>
          <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
            Stops where the baseline reports waiting but no supplemental trip targets them at this allocation. Ranked by
            the worst single-window wait the backend reported.
          </p>
          <ul className="flex flex-col gap-1 text-c3-regular-label-l2">
            {unaddressed.map((u) => (
              <li key={u.stopId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">{stopName(u.stopId)}</span>
                <span className="tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                  {fmtMin(u.wait)} at {time.range(u.window.windowStart, u.window.windowEnd)} ·{' '}
                  {fmtNum(u.window.supportingPassengerCount)} passengers
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
