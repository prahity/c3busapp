import React, { useMemo } from 'react';
import {
  ArrowLeft,
  Bus,
  CircleOff,
  Clock,
  DollarSign,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
  ServerCrash,
  TimerOff,
  TriangleAlert,
  Users,
} from 'lucide-react';

import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricCard, MetricCardCaption, MetricCardHeader, MetricCardLabel, MetricCardValue } from '@/components/ui/metric-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { candidateFor, loadedAllocations, planFor } from '../api';
import type { RouteId, SimComparison, SimMetrics, SimScopeDescriptor } from '../contracts/types';
import { NO_DATA, fmtMin, fmtMoney, fmtMoney2, fmtNum, fmtPct } from '../format';
import { useRunContext } from '../runContext';
import CostCurveChart from './CostCurveChart';
import DelayHeatmap from './DelayHeatmap';
import ExportPanel from './ExportPanel';
import ItineraryTable from './ItineraryTable';
import MetricsCompare from './MetricsCompare';
import OpportunityCards from './OpportunityCards';
import PlanSummary from './PlanSummary';
import ReconciliationPanel from './ReconciliationPanel';
import ReplayControls from './ReplayControls';
import SimRouteMap from './SimRouteMap';
import SyntheticBanner from './SyntheticBanner';
import { useReplayClock } from '../useReplayClock';

interface ResultsStepProps {
  /** The loaded `SimRunner.runComparison` sweep. Everything below is read from it. */
  comparison: SimComparison;
  /** `describeScope()`, for the disclosure banner. Null if that call failed. */
  scope: SimScopeDescriptor | null;
  allocation: number;
  onAllocationChange: (allocation: number) => void;
  onBack: () => void;
  /** Re-runs `runAllocation` for the selected allocation and merges it in. */
  onRefreshAllocation: () => void;
  refreshing: boolean;
  refreshError: string | null;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-5">
      <header className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="shrink-0 text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">{title}</h2>
        {hint && <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)] sm:text-right">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * The comparison review screen.
 *
 * Reads one loaded {@link SimComparison}. The allocation control selects among
 * the candidates the backend already returned, so moving it costs nothing; the
 * refresh button re-runs that one allocation through `runAllocation`. Where the
 * backend returned null — a cost per waiting minute saved it declined to divide,
 * an average over zero completed passengers — this screen prints the reason or a
 * dash, never a zero.
 */
export default function ResultsStep({
  comparison,
  scope,
  allocation,
  onAllocationChange,
  onBack,
  onRefreshAllocation,
  refreshing,
  refreshError,
}: ResultsStepProps) {
  const { time } = useRunContext();
  const { input, baseline, demandSnapshot } = comparison;

  const allocations = useMemo(() => loadedAllocations(comparison), [comparison]);
  const candidate = useMemo(() => candidateFor(comparison, allocation), [comparison, allocation]);
  const plan = useMemo(() => planFor(comparison, allocation), [comparison, allocation]);

  const minK = allocations[0] ?? 0;
  const maxK = allocations[allocations.length - 1] ?? 0;
  const bm: SimMetrics = baseline.metrics;
  const cm: SimMetrics | null = candidate?.metrics ?? null;
  const currency = input.costConfig.currency;
  const stops = input.coreService.stops;
  const routes = input.coreService.routes;
  const itineraries = plan?.extraBusItineraries ?? [];
  const tripCount = itineraries.reduce((sum, bus) => sum + bus.trips.length, 0);
  const events = input.events;

  // How many scheduled core trips run on each corridor — drives the live bus count per route.
  const coreBusCounts = useMemo(() => {
    const counts = new Map<RouteId, number>();
    for (const trip of input.coreService.coreTrips) {
      counts.set(trip.routeId, (counts.get(trip.routeId) ?? 0) + 1);
    }
    return counts;
  }, [input.coreService.coreTrips]);

  // One replay clock shared by both maps, so scrubbing moves them in lockstep.
  const replay = useReplayClock({ loopSeconds: 30 });

  const headline = useMemo(() => {
    if (!cm) return 'The loaded sweep has no candidate for this allocation.';
    if (demandSnapshot.totalPassengers === 0) {
      return 'This scenario generated no simulated passengers, so no allocation can save any waiting time.';
    }
    if (allocation === 0) {
      return 'Showing the plan at zero extra buses. Move the allocation control to compare the recommendations.';
    }
    const saved = cm.horizonWaitingMinutesSavedVsBaseline;
    if (saved <= 0) {
      return `${allocation} extra bus${allocation === 1 ? '' : 'es'} allocated, but the backend reports no waiting time saved against the baseline.`;
    }
    return `${plan?.busesUsed ?? 0} of ${allocation} extra bus${allocation === 1 ? '' : 'es'} used · ${fmtNum(saved)} passenger-minutes of waiting saved for ${fmtMoney(cm.extraBusOperatingCost, currency)}.`;
  }, [cm, demandSnapshot.totalPassengers, allocation, plan, currency]);

  const unknownAtCutoff = demandSnapshot.eventIdsUnknownAtCutoff;
  const infeasibilities = candidate?.infeasibilities ?? [];

  return (
    <div className="flex min-h-full w-full flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Optimized surge capacity plan</h1>
            <Badge variant="soft" appearance="accent" size="sm">
              {comparison.scenarioName}
            </Badge>
            <Badge variant="outline" appearance="secondary" size="sm">
              {input.serviceDate} · {input.serviceTimezone}
            </Badge>
            <Badge variant="outline" appearance="secondary" size="sm">
              {time.range(input.horizonStart, input.horizonEnd)}
            </Badge>
          </div>
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{headline}</p>
        </div>
        <Button variant="outline" appearance="secondary" leadingIcon={<ArrowLeft />} onClick={onBack}>
          New simulation
        </Button>
      </div>

      <SyntheticBanner scope={scope} runLabel={comparison.syntheticDataLabel} />

      {/* The optimization, up top and in plain language, before any table or map. */}
      <PlanSummary comparison={comparison} allocation={allocation} candidate={candidate} plan={plan} />

      {/* Allocation control — selects among the candidates already loaded. */}
      <section className="flex flex-col gap-3 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="allocation" className="flex items-center gap-2 text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
            <Bus className="size-4 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
            Extra buses to allocate
          </label>
          <div className="flex flex-wrap items-center gap-2 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
            <span className="text-c3-bold-body-p1 tabular-nums text-[var(--c3-style-basic-fg-accent)]">{allocation}</span>
            <span>of {maxK} simulated ·</span>
            <Badge variant="soft" appearance="success" size="sm">
              {plan ? `${plan.busesUsed} used` : `${NO_DATA} used`}
            </Badge>
            <Badge variant="soft" appearance="secondary" size="sm">
              {plan ? `${plan.busesIdle} idle` : `${NO_DATA} idle`}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              appearance="secondary"
              leadingIcon={refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              onClick={onRefreshAllocation}
              disabled={refreshing}
            >
              {refreshing ? 'Re-running…' : 'Re-run this allocation'}
            </Button>
          </div>
        </div>
        <input
          id="allocation"
          type="range"
          min={minK}
          max={maxK}
          step={1}
          value={allocation}
          onChange={(e) => onAllocationChange(Number(e.target.value))}
          className="w-full accent-[var(--c3-style-basic-fg-accent)]"
        />
        <div className="flex justify-between text-c3-regular-label-l3 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
          {allocations.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onAllocationChange(k)}
              className={k === allocation ? 'font-semibold text-[var(--c3-style-basic-fg-accent)]' : ''}
            >
              {k === 0 ? 'baseline' : k}
            </button>
          ))}
        </div>
        {refreshError && (
          <Alert variant="soft" appearance="destructive">
            <AlertIcon>
              <ServerCrash aria-hidden />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>
                <span className="font-mono">SimRunner.runAllocation</span> failed — the figures below are still from the
                original sweep
              </AlertTitle>
              <AlertDescription>{refreshError}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </section>

      {!candidate || !cm ? (
        <Alert variant="soft" appearance="warning">
          <AlertIcon>
            <CircleOff aria-hidden />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>No simulated results for {allocation} extra buses</AlertTitle>
            <AlertDescription>
              The loaded comparison covers allocations {minK}–{maxK}. Pick one of those, or start a new simulation with a
              higher maximum.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <>
          {/* KPI tiles — all four read straight off SimMetrics. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard>
              <MetricCardHeader>
                <Clock className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Waiting minutes saved</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{fmtNum(cm.horizonWaitingMinutesSavedVsBaseline)}</MetricCardValue>
              <MetricCardCaption>
                against a baseline of {fmtNum(bm.horizonTotalWaitingMinutes)} horizon minutes, including{' '}
                {fmtNum(bm.accruedWaitingMinutesUnserved)} accrued by passengers still queued
              </MetricCardCaption>
            </MetricCard>
            <MetricCard>
              <MetricCardHeader>
                <TimerOff className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Late to a deadline</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>
                {fmtNum(cm.lateCompletedPassengers)}{' '}
                <span className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                  ({fmtPct(cm.lateCompletedPct)})
                </span>
              </MetricCardValue>
              <MetricCardCaption>
                baseline {fmtNum(bm.lateCompletedPassengers)} of {fmtNum(bm.deadlineBearingPassengers)} deadline-bearing
                passengers · {fmtNum(cm.deadlineBearingUnserved)} never served
              </MetricCardCaption>
            </MetricCard>
            <MetricCard>
              <MetricCardHeader>
                <Users className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Unserved at the horizon</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{fmtNum(cm.unservedAtHorizon)}</MetricCardValue>
              <MetricCardCaption>
                baseline {fmtNum(bm.unservedAtHorizon)} · average completed wait {fmtMin(cm.avgWaitMinutesCompleted)}{' '}
                (p95 {fmtMin(cm.p95WaitMinutesCompleted, 0)})
              </MetricCardCaption>
            </MetricCard>
            <MetricCard>
              <MetricCardHeader>
                <DollarSign className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Extra-bus operating cost</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{fmtMoney(cm.extraBusOperatingCost, cm.currency)}</MetricCardValue>
              <MetricCardCaption>
                {cm.costPerWaitingMinuteSaved == null
                  ? (cm.costPerMinuteSavedUnavailableReason ?? 'Cost per waiting minute saved not available.')
                  : `${fmtMoney2(cm.costPerWaitingMinuteSaved, cm.currency)} per waiting minute saved`}
              </MetricCardCaption>
            </MetricCard>
          </div>

          {infeasibilities.length > 0 && (
            <Alert variant="soft" appearance="warning">
              <AlertIcon>
                <TriangleAlert aria-hidden />
              </AlertIcon>
              <AlertContent>
                <AlertTitle>The simulator reported {infeasibilities.length} infeasibility at this allocation</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {infeasibilities.map((issue, i) => (
                      <li key={`${issue.code}-${issue.refId ?? 'none'}-${i}`}>
                        <span className="font-medium">{issue.severity}: </span>
                        {issue.message}
                        <span className="ml-1 font-mono text-c3-regular-label-l3">[{issue.code}]</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}

          <Section
            title="Without changes vs. with these recommendations"
            hint="Live replay on the UIUC campus map · identical core service and demand snapshot · only the extra-bus trips differ"
          >
            <ReplayControls
              clock={replay}
              horizonStart={input.horizonStart}
              horizonEnd={input.horizonEnd}
              time={time}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SimRouteMap
                title="Without changes — old-model baseline"
                subtitle="0 extra buses"
                stops={stops}
                routes={routes}
                delays={baseline.stopWindowDelays}
                coreBusCounts={coreBusCounts}
                events={events}
                t={replay.t}
              />
              <SimRouteMap
                title={`With recommendations — ${allocation} extra bus${allocation === 1 ? '' : 'es'} allocated`}
                subtitle={`${plan?.busesUsed ?? 0} used · ${tripCount} supplemental trip${tripCount === 1 ? '' : 's'}`}
                stops={stops}
                routes={routes}
                delays={candidate.stopWindowDelays}
                coreBusCounts={coreBusCounts}
                itineraries={itineraries}
                events={events}
                t={replay.t}
              />
            </div>
            <MetricsCompare
              baseline={bm}
              candidate={cm}
              baselineAccounting={baseline.accounting}
              candidateAccounting={candidate.accounting}
            />
          </Section>

          <Section
            title="Where the plan intervenes"
            hint="One card per stop the planner targeted · baseline and candidate waits from stopWindowDelays"
          >
            <OpportunityCards
              baselineDelays={baseline.stopWindowDelays}
              candidateDelays={candidate.stopWindowDelays}
              plan={plan}
              stops={stops}
              routes={routes}
              coreBusCounts={coreBusCounts}
              t={replay.t}
            />
          </Section>

          <Section
            title="Cost versus waiting time saved"
            hint="One point per simulated allocation · identical demand snapshot and core service in every run"
          >
            <CostCurveChart curve={comparison.costCurve} allocation={allocation} onSelect={onAllocationChange} />
          </Section>

          <Section
            title={`Per-bus itineraries · ${allocation} allocated`}
            hint="Planned calls, arrive/depart times and boardings exactly as the planner emitted them"
          >
            {plan?.heuristicVersion && (
              <p className="-mt-2 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">Planning heuristic: </span>
                {plan.heuristicVersion}
              </p>
            )}
            {plan && plan.explanations.length > 0 && (
              <ul className="-mt-1 list-disc space-y-0.5 pl-5 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                {plan.explanations.map((why) => (
                  <li key={why}>{why}</li>
                ))}
              </ul>
            )}
            <ItineraryTable itineraries={itineraries} currency={currency} />
          </Section>

          <Section
            title="Expected waiting delay by stop and reporting window"
            hint={`${input.assumptions.stopDelayWindowMinutes}-minute windows · simulated estimates, not live arrival predictions`}
          >
            <DelayHeatmap
              baseline={baseline.stopWindowDelays}
              candidate={candidate.stopWindowDelays}
              stops={stops}
              windowMinutes={input.assumptions.stopDelayWindowMinutes}
            />
          </Section>

          <Section
            title="Events behind this demand"
            hint={`Snapshot ${demandSnapshot.snapshotId} · seed ${demandSnapshot.seed} · ${fmtNum(demandSnapshot.totalPassengers)} simulated passengers`}
          >
            {unknownAtCutoff.length > 0 && (
              <Alert variant="soft" appearance="info">
                <AlertIcon>
                  <EyeOff aria-hidden />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>
                    {unknownAtCutoff.length} event{unknownAtCutoff.length === 1 ? '' : 's'} happened but were invisible
                    to the planner
                  </AlertTitle>
                  <AlertDescription>
                    The plan was frozen at {time.dateTime(input.planningCutoff)}, so these were absorbed blind rather
                    than planned for: <span className="font-mono">{unknownAtCutoff.join(', ')}</span>
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}
            {candidate.eventActivations.length === 0 ? (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                No event became active during this run.
              </p>
            ) : (
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Visible to planner</TableHead>
                      <TableHead className="text-right">Passengers generated</TableHead>
                      <TableHead>Effect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidate.eventActivations.map((act) => (
                      <TableRow key={act.eventId}>
                        <TableCell>
                          <div className="font-medium text-[var(--c3-style-basic-fg-primary)]">
                            {act.eventName ?? NO_DATA}
                          </div>
                          <div className="font-mono text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                            {act.eventId}
                          </div>
                        </TableCell>
                        <TableCell className="text-[var(--c3-style-basic-fg-secondary)]">
                          {act.eventType ?? NO_DATA}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {time.range(act.activationTime, act.deactivationTime)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="soft" appearance={act.visibleToPlanner ? 'success' : 'warning'} size="sm">
                            {act.visibleToPlanner ? 'visible' : 'unknown at cutoff'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(act.generatedPassengers)}</TableCell>
                        <TableCell className="max-w-md text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                          {act.effectSummary ?? NO_DATA}
                          {act.operationalEffectKinds.length > 0 && (
                            <span className="ml-1 font-mono text-c3-regular-label-l3">
                              [{act.operationalEffectKinds.join(', ')}]
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {demandSnapshot.suppressedEventIds.length > 0 && (
              <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">Suppressed as duplicates: </span>
                <span className="font-mono">{demandSnapshot.suppressedEventIds.join(', ')}</span>
              </p>
            )}
          </Section>

          <Section
            title="Input reconciliation and reliability weighting"
            hint={`${fmtNum(demandSnapshot.deadlineBearingPassengers)} of ${fmtNum(demandSnapshot.totalPassengers)} passengers carry a deadline`}
          >
            <ReconciliationPanel
              reconciliation={input.reconciliation}
              validation={input.validation}
              assertions={comparison.comparabilityAssertions}
              events={input.events}
            />
          </Section>

          <Section title="Exports" hint="The backend's own bundle, plus the loaded contract objects as JSON">
            <ExportPanel comparison={comparison} candidate={candidate} plan={plan} allocation={allocation} />
          </Section>

          <section className="flex flex-col gap-3 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-secondary)] p-5">
            <h2 className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
              <Info className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden /> How to read these numbers
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)] md:grid-cols-2">
              {[
                ...comparison.scopeNotes,
                ...comparison.heuristicNotes,
                cm.denominatorNote,
                cm.costBasisNote,
                candidate.unitsNote,
              ]
                .filter((note): note is string => typeof note === 'string' && note.length > 0)
                .map((note) => (
                  <li key={note} className="ml-4 list-disc pl-1">
                    {note}
                  </li>
                ))}
            </ul>
            <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              Computed {time.dateTime(comparison.computedAt)} · contract {comparison.contractVersion} · scenario{' '}
              <span className="font-mono">{comparison.scenarioId}</span>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
