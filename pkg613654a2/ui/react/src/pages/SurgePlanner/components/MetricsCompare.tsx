import React from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { SimAccounting, SimMetrics } from '../contracts/types';
import { NO_DATA, fmtMin, fmtMoney, fmtMoney2, fmtNum, fmtPct } from '../format';

interface MetricsCompareProps {
  baseline: SimMetrics;
  candidate: SimMetrics;
  baselineAccounting: SimAccounting;
  candidateAccounting: SimAccounting;
}

interface Row {
  label: string;
  base: string;
  cand: string;
  /** Candidate minus baseline, or null when either side is unavailable. */
  delta: number | null;
  lowerIsBetter: boolean;
  note?: string;
}

function DeltaCell({ delta, lowerIsBetter }: { delta: number | null; lowerIsBetter: boolean }) {
  if (delta == null || delta === 0) {
    return (
      <span className="flex items-center justify-end gap-1 text-[var(--c3-style-basic-fg-secondary)]">
        <Minus className="size-3.5" aria-hidden /> {delta == null ? NO_DATA : '0'}
      </span>
    );
  }
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={cn(
        'flex items-center justify-end gap-1 tabular-nums',
        good ? 'text-[var(--c3-style-basic-fg-success)]' : 'text-[var(--c3-style-basic-fg-danger)]',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {delta > 0 ? '+' : ''}
      {Number.isInteger(delta) ? delta : delta.toFixed(1)}
    </span>
  );
}

/**
 * Baseline `SimMetrics` against candidate `SimMetrics`, with the denominator and
 * censoring notes the backend ships alongside them.
 *
 * A metric the backend returned as null (no completed passengers to average over,
 * no positive savings to divide a cost by) is shown as an em dash and its delta
 * as unavailable. Nothing is substituted with zero.
 */
export default function MetricsCompare({ baseline, candidate, baselineAccounting, candidateAccounting }: MetricsCompareProps) {
  const currency = candidate.currency || baseline.currency;
  const d = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : Math.round((b - a) * 10) / 10;

  const rows: Row[] = [
    {
      label: 'Avg wait (completed passengers)',
      base: fmtMin(baseline.avgWaitMinutesCompleted),
      cand: fmtMin(candidate.avgWaitMinutesCompleted),
      delta: d(baseline.avgWaitMinutesCompleted, candidate.avgWaitMinutesCompleted),
      lowerIsBetter: true,
      note:
        candidate.denominatorNote ??
        `denominator: passengers who boarded — ${fmtNum(baseline.completedPassengers)} vs ${fmtNum(candidate.completedPassengers)}`,
    },
    {
      label: 'p95 wait (completed passengers)',
      base: fmtMin(baseline.p95WaitMinutesCompleted),
      cand: fmtMin(candidate.p95WaitMinutesCompleted),
      delta: d(baseline.p95WaitMinutesCompleted, candidate.p95WaitMinutesCompleted),
      lowerIsBetter: true,
    },
    {
      label: 'Total waiting, completed only',
      base: `${fmtNum(baseline.totalWaitingMinutesCompleted)} min`,
      cand: `${fmtNum(candidate.totalWaitingMinutesCompleted)} min`,
      delta: d(baseline.totalWaitingMinutesCompleted, candidate.totalWaitingMinutesCompleted),
      lowerIsBetter: true,
      note: 'excludes passengers never served — subject to survivor bias; read with the row below',
    },
    {
      label: 'Total waiting, horizon-based',
      base: `${fmtNum(baseline.horizonTotalWaitingMinutes)} min`,
      cand: `${fmtNum(candidate.horizonTotalWaitingMinutes)} min`,
      delta: d(baseline.horizonTotalWaitingMinutes, candidate.horizonTotalWaitingMinutes),
      lowerIsBetter: true,
      note: 'includes waiting accrued by passengers still queued at the horizon (censored — not an eventual wait)',
    },
    {
      label: 'Waiting accrued by unserved passengers',
      base: `${fmtNum(baseline.accruedWaitingMinutesUnserved)} min`,
      cand: `${fmtNum(candidate.accruedWaitingMinutesUnserved)} min`,
      delta: d(baseline.accruedWaitingMinutesUnserved, candidate.accruedWaitingMinutesUnserved),
      lowerIsBetter: true,
    },
    {
      label: 'Avg trip time (wait + ride)',
      base: fmtMin(baseline.avgTripTimeMinutesCompleted),
      cand: fmtMin(candidate.avgTripTimeMinutesCompleted),
      delta: d(baseline.avgTripTimeMinutesCompleted, candidate.avgTripTimeMinutesCompleted),
      lowerIsBetter: true,
    },
    {
      label: 'Avg in-vehicle time',
      base: fmtMin(baseline.avgInVehicleMinutesCompleted),
      cand: fmtMin(candidate.avgInVehicleMinutesCompleted),
      delta: d(baseline.avgInVehicleMinutesCompleted, candidate.avgInVehicleMinutesCompleted),
      lowerIsBetter: true,
    },
    {
      label: 'Late to class',
      base: `${fmtNum(baseline.lateCompletedPassengers)} (${fmtPct(baseline.lateCompletedPct)})`,
      cand: `${fmtNum(candidate.lateCompletedPassengers)} (${fmtPct(candidate.lateCompletedPct)})`,
      delta: d(baseline.lateCompletedPassengers, candidate.lateCompletedPassengers),
      lowerIsBetter: true,
      note: `denominator: ${fmtNum(candidate.deadlineBearingPassengers)} passengers with a class deadline; completed late arrivals only`,
    },
    {
      label: 'Deadline passengers unserved',
      base: fmtNum(baseline.deadlineBearingUnserved),
      cand: fmtNum(candidate.deadlineBearingUnserved),
      delta: d(baseline.deadlineBearingUnserved, candidate.deadlineBearingUnserved),
      lowerIsBetter: true,
      note: 'never boarded — not counted as on time and not counted as late',
    },
    {
      label: 'Passengers unserved at horizon',
      base: fmtNum(baseline.unservedAtHorizon),
      cand: fmtNum(candidate.unservedAtHorizon),
      delta: d(baseline.unservedAtHorizon, candidate.unservedAtHorizon),
      lowerIsBetter: true,
    },
    {
      label: 'Passengers onboard at horizon',
      base: fmtNum(baselineAccounting.onboardAtHorizon),
      cand: fmtNum(candidateAccounting.onboardAtHorizon),
      delta: d(baselineAccounting.onboardAtHorizon, candidateAccounting.onboardAtHorizon),
      lowerIsBetter: true,
      note: 'still riding when the horizon closed',
    },
    {
      label: 'Peak passengers onboard',
      base: fmtNum(baselineAccounting.peakOnboard),
      cand: fmtNum(candidateAccounting.peakOnboard),
      delta: d(baselineAccounting.peakOnboard, candidateAccounting.peakOnboard),
      lowerIsBetter: false,
    },
    {
      label: 'Extra-bus operating cost',
      base: fmtMoney(baseline.extraBusOperatingCost, baseline.currency),
      cand: fmtMoney(candidate.extraBusOperatingCost, currency),
      delta: d(baseline.extraBusOperatingCost, candidate.extraBusOperatingCost),
      lowerIsBetter: true,
      note: candidate.costBasisNote,
    },
    {
      label: 'Waiting minutes saved vs baseline',
      base: NO_DATA,
      cand: `${fmtNum(candidate.horizonWaitingMinutesSavedVsBaseline)} min`,
      delta: null,
      lowerIsBetter: false,
      note: 'horizon-based baseline minus candidate; not clamped, so a harmful allocation reports a negative saving',
    },
    {
      label: 'Cost per waiting minute saved',
      base: NO_DATA,
      cand:
        candidate.costPerWaitingMinuteSaved == null
          ? NO_DATA
          : fmtMoney2(candidate.costPerWaitingMinuteSaved, currency),
      delta: null,
      lowerIsBetter: true,
      note: candidate.costPerMinuteSavedUnavailableReason,
    },
  ];

  const unbalanced = !candidateAccounting.isBalanced || !baselineAccounting.isBalanced;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {unbalanced && (
        <Alert variant="soft" appearance="destructive">
          <AlertIcon>
            <AlertTriangle aria-hidden />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Passenger accounting does not balance</AlertTitle>
            <AlertDescription>
              The backend reports <span className="font-medium">isBalanced: false</span> for
              {!baselineAccounting.isBalanced ? ' the baseline' : ''}
              {!baselineAccounting.isBalanced && !candidateAccounting.isBalanced ? ' and' : ''}
              {!candidateAccounting.isBalanced ? ' this candidate' : ''}. Generated passengers do not reconcile against
              completed, waiting and onboard, so the metrics below should not be relied on.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}
      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Without changes</TableHead>
              <TableHead className="text-right">With recommendations</TableHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell>
                  <div className="font-medium text-[var(--c3-style-basic-fg-primary)]">{r.label}</div>
                  {r.note && <div className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{r.note}</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[var(--c3-style-basic-fg-secondary)]">{r.base}</TableCell>
                <TableCell className="text-right tabular-nums font-medium text-[var(--c3-style-basic-fg-primary)]">{r.cand}</TableCell>
                <TableCell className="text-right">
                  <DeltaCell delta={r.delta} lowerIsBetter={r.lowerIsBetter} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
        Accounting (with recommendations): generated {fmtNum(candidateAccounting.generatedPassengers)} = completed{' '}
        {fmtNum(candidateAccounting.completedPassengers)} + waiting {fmtNum(candidateAccounting.waitingAtHorizon)} + onboard{' '}
        {fmtNum(candidateAccounting.onboardAtHorizon)} + denied by closure {fmtNum(candidateAccounting.deniedByClosure)}.{' '}
        {fmtNum(candidateAccounting.totalBoardings)} boardings · {fmtNum(candidateAccounting.totalAlightings)} alightings.
        Durations are minutes; money is {currency}.
      </p>
    </div>
  );
}
