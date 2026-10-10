import React, { useMemo } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { delayStops, delayWindows } from '../api';
import type { SimStop, SimStopWindowDelay } from '../contracts/types';
import { NO_DATA, fmtMin, fmtNum } from '../format';
import { useRunContext } from '../runContext';

interface DelayHeatmapProps {
  /** `comparison.baseline.stopWindowDelays`. */
  baseline: SimStopWindowDelay[];
  /** The selected candidate's `stopWindowDelays`. */
  candidate: SimStopWindowDelay[];
  /** Core-service stops, used only to order the rows. */
  stops: SimStop[];
  /** `assumptions.stopDelayWindowMinutes` — the width of each column. */
  windowMinutes: number;
}

const BUCKETS: { max: number; cls: string; text: string; label: string }[] = [
  { max: 3, cls: 'bg-[var(--c3-style-basic-fg-accent)]/15', text: 'text-[var(--c3-style-basic-fg-primary)]', label: '< 3' },
  { max: 8, cls: 'bg-[var(--c3-style-basic-fg-accent)]/30', text: 'text-[var(--c3-style-basic-fg-primary)]', label: '3–8' },
  { max: 15, cls: 'bg-[var(--c3-style-basic-fg-accent)]/50', text: 'text-[var(--c3-style-basic-fg-primary)]', label: '8–15' },
  { max: 30, cls: 'bg-[var(--c3-style-basic-fg-accent)]/72', text: 'text-[var(--c3-style-basic-fg-inverse)]', label: '15–30' },
  { max: Infinity, cls: 'bg-[var(--c3-style-basic-fg-accent)]', text: 'text-[var(--c3-style-basic-fg-inverse)]', label: '30+' },
];

function bucket(v: number) {
  return BUCKETS.find((b) => v < b.max) ?? BUCKETS[BUCKETS.length - 1];
}

interface GridProps {
  rows: { stopId: string; name: string }[];
  windows: { start: string; end: string }[];
  cells: Map<string, SimStopWindowDelay>;
}

function Grid({ rows, windows, cells }: GridProps) {
  const { time } = useRunContext();

  if (rows.length === 0 || windows.length === 0) {
    return (
      <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
        The backend reported no stop-window delay rows for this run, so there is nothing to chart.
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-c3-regular-label-l3">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--c3-style-basic-bg-card)] pr-2 text-left font-medium text-[var(--c3-style-basic-fg-secondary)]">
              Stop
            </th>
            {windows.map((w) => (
              <th
                key={w.start}
                className="min-w-[22px] px-0 pb-1 text-center font-normal tabular-nums text-[var(--c3-style-basic-fg-secondary)]"
              >
                {time.isOnTheHour(w.start) ? time.clockShort(w.start) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.stopId}>
              <th className="sticky left-0 z-10 whitespace-nowrap bg-[var(--c3-style-basic-bg-card)] pr-2 text-left font-medium text-[var(--c3-style-basic-fg-primary)]">
                {row.name}
              </th>
              {windows.map((w) => {
                const cell = cells.get(`${row.stopId}|${w.start}`);
                const span = time.range(w.start, w.end);
                // No row at all, or a row the backend explicitly marked as having
                // no observations: this is absence of data, NOT a zero wait.
                const noData = !cell || !cell.hasObservations;
                const wait = cell?.estimatedWaitMinutes ?? null;
                const censored = !noData && wait == null;
                const b = !noData && wait != null ? bucket(wait) : null;

                const title = noData
                  ? `${row.name} · ${span}: no simulated passengers waited in this window — expected wait ${NO_DATA}, not zero`
                  : censored
                    ? `${row.name} · ${span}: ${fmtNum(cell?.supportingPassengerCount)} passengers waiting, none boarded before the horizon — wait is censored, so no estimate`
                    : `${row.name} · ${span}: expected wait ${fmtMin(wait)}${
                        cell?.maxWaitMinutes != null ? ` (max ${fmtMin(cell.maxWaitMinutes)})` : ''
                      } from ${fmtNum(cell?.supportingPassengerCount)} simulated passengers${
                        cell && cell.censoredPassengerCount > 0 ? `, ${fmtNum(cell.censoredPassengerCount)} censored` : ''
                      }${cell?.stopUnavailableInWindow ? ' · stop unavailable in this window' : ''}`;

                return (
                  <td key={w.start} className="p-0">
                    <div
                      title={title}
                      className={cn(
                        'flex h-6 w-full min-w-[22px] items-center justify-center rounded-xs tabular-nums',
                        noData && 'border border-dashed border-[var(--c3-style-basic-border-weak)]',
                        censored && 'bg-[var(--c3-style-basic-fg-danger)]/80 text-[var(--c3-style-basic-fg-inverse)]',
                        b?.cls,
                        b?.text,
                        cell?.stopUnavailableInWindow && 'outline outline-1 outline-offset-[-1px] outline-[var(--c3-style-basic-fg-danger)]',
                      )}
                    >
                      {noData ? '' : censored ? '∞' : Math.round(wait ?? 0)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function index(delays: SimStopWindowDelay[]): Map<string, SimStopWindowDelay> {
  const m = new Map<string, SimStopWindowDelay>();
  for (const row of delays) m.set(`${row.stopId}|${row.windowStart}`, row);
  return m;
}

/**
 * Expected waiting delay per stop per reporting window, baseline against candidate.
 *
 * Rows and columns are both derived from the delay rows the backend actually
 * returned — there is no assumed stop list and no assumed horizon. A window with
 * `hasObservations: false` is left blank and hatched; a window where passengers
 * waited but never boarded is marked as censored. Neither is drawn as zero.
 */
export default function DelayHeatmap({ baseline, candidate, stops, windowMinutes }: DelayHeatmapProps) {
  const windows = useMemo(() => delayWindows(baseline, candidate), [baseline, candidate]);
  const rows = useMemo(() => delayStops(stops, baseline, candidate), [stops, baseline, candidate]);
  const baselineCells = useMemo(() => index(baseline), [baseline]);
  const candidateCells = useMemo(() => index(candidate), [candidate]);

  return (
    <Tabs defaultValue="candidate" variant="boxed" size="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="baseline">Without changes</TabsTrigger>
          <TabsTrigger value="candidate">With recommendations</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          <span>Minutes:</span>
          {BUCKETS.map((b) => (
            <span key={b.label} className="flex items-center gap-1">
              <span className={cn('inline-block size-3 rounded-xs', b.cls)} aria-hidden />
              {b.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded-xs bg-[var(--c3-style-basic-fg-danger)]/80" aria-hidden />
            waiting at horizon
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded-xs border border-dashed border-[var(--c3-style-basic-border-weak)]" aria-hidden />
            no observations
          </span>
        </div>
      </div>
      <TabsContent value="baseline" className="pt-3">
        <Grid rows={rows} windows={windows} cells={baselineCells} />
      </TabsContent>
      <TabsContent value="candidate" className="pt-3">
        <Grid rows={rows} windows={windows} cells={candidateCells} />
      </TabsContent>
      <p className="pt-2 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
        {windows.length} reporting window{windows.length === 1 ? '' : 's'} of {windowMinutes} minutes, in the
        scenario&apos;s service timezone. Simulated estimates, not live arrival predictions.
      </p>
    </Tabs>
  );
}
