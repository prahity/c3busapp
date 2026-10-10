import React, { useMemo } from 'react';
import { CartesianGrid, LabelList, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { SimCostCurvePoint } from '../contracts/types';
import { NO_DATA, fmtMin, fmtMoney, fmtMoney2, fmtNum, fmtPct } from '../format';

interface CostCurveChartProps {
  /** `SimComparison.costCurve` — one point per allocation the backend evaluated. */
  curve: SimCostCurvePoint[];
  allocation: number;
  onSelect: (allocation: number) => void;
}

interface TooltipPayload {
  payload?: SimCostCurvePoint;
}

function CurveTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] px-3 py-2 text-c3-regular-label-l2 shadow-md">
      <div className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
        {p.allocation} extra bus{p.allocation === 1 ? '' : 'es'} · {p.busesUsed} used · {p.busesIdle} idle
      </div>
      <div className="text-[var(--c3-style-basic-fg-secondary)]">Operating cost {fmtMoney(p.operatingCost, p.currency)}</div>
      <div className="text-[var(--c3-style-basic-fg-secondary)]">
        Waiting saved {fmtNum(p.horizonWaitingMinutesSaved)} passenger-min
      </div>
      <div className="text-[var(--c3-style-basic-fg-secondary)]">
        Cost / min saved{' '}
        {p.costPerWaitingMinuteSaved == null ? NO_DATA : fmtMoney2(p.costPerWaitingMinuteSaved, p.currency)}
      </div>
      {p.costPerWaitingMinuteSaved == null && p.costPerMinuteSavedUnavailableReason && (
        <div className="max-w-xs text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          {p.costPerMinuteSavedUnavailableReason}
        </div>
      )}
    </div>
  );
}

/**
 * Operating cost (x) against passenger waiting minutes saved (y), one point per
 * allocation the backend simulated. Selecting a point or a table row changes the
 * allocation shown across the whole results screen.
 */
export default function CostCurveChart({ curve, allocation, onSelect }: CostCurveChartProps) {
  const data = useMemo(() => [...curve].sort((a, b) => a.operatingCost - b.operatingCost), [curve]);
  const rows = useMemo(() => [...curve].sort((a, b) => a.allocation - b.allocation), [curve]);
  const current = curve.find((p) => p.allocation === allocation);
  const currency = current?.currency ?? curve[0]?.currency ?? 'USD';

  if (curve.length === 0) {
    return (
      <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
        The backend returned no cost-curve points for this run, so there is nothing to plot.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 24, right: 32, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c3-style-basic-border-weak)" />
            <XAxis
              type="number"
              dataKey="operatingCost"
              name="Operating cost"
              tickFormatter={(v: number) => fmtMoney(v, currency)}
              tick={{ fontSize: 11, fill: 'var(--c3-style-basic-fg-secondary)' }}
              label={{
                value: `Extra-bus operating cost (${currency}, simulated)`,
                position: 'insideBottom',
                offset: -2,
                fontSize: 11,
                fill: 'var(--c3-style-basic-fg-secondary)',
              }}
              domain={[0, 'dataMax']}
            />
            <YAxis
              dataKey="horizonWaitingMinutesSaved"
              tickFormatter={(v: number) => fmtNum(v)}
              tick={{ fontSize: 11, fill: 'var(--c3-style-basic-fg-secondary)' }}
              label={{
                value: 'Waiting min saved',
                angle: -90,
                position: 'insideLeft',
                offset: 12,
                fontSize: 11,
                fill: 'var(--c3-style-basic-fg-secondary)',
              }}
              width={72}
            />
            <Tooltip content={<CurveTooltip />} cursor={{ stroke: 'var(--c3-style-basic-border-weak)' }} />
            <Line
              type="monotone"
              dataKey="horizonWaitingMinutesSaved"
              stroke="var(--c3-style-basic-fg-accent)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--c3-style-basic-fg-accent)', stroke: 'var(--c3-style-basic-bg-card)', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="allocation"
                position="top"
                formatter={(v: number) => `${v} bus${v === 1 ? '' : 'es'}`}
                style={{ fontSize: 10, fill: 'var(--c3-style-basic-fg-secondary)' }}
              />
            </Line>
            {current && (
              <ReferenceDot
                x={current.operatingCost}
                y={current.horizonWaitingMinutesSaved}
                r={9}
                fill="none"
                stroke="var(--c3-style-basic-fg-accent)"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buses</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Min saved</TableHead>
              <TableHead className="text-right">Cost / min</TableHead>
              <TableHead className="text-right">Late</TableHead>
              <TableHead className="text-right">Unserved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow
                key={p.allocation}
                className={cn('cursor-pointer', p.allocation === allocation && 'bg-[var(--c3-style-basic-bg-selected)]')}
                onClick={() => onSelect(p.allocation)}
              >
                <TableCell className="font-medium text-[var(--c3-style-basic-fg-primary)]">
                  <button type="button" className="text-left" onClick={() => onSelect(p.allocation)}>
                    {p.allocation === 0 ? '0 · baseline' : p.allocation}
                  </button>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(p.busesUsed)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(p.operatingCost, p.currency)}</TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    p.horizonWaitingMinutesSaved < 0 && 'text-[var(--c3-style-basic-fg-danger)]',
                  )}
                >
                  {fmtNum(p.horizonWaitingMinutesSaved)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.costPerWaitingMinuteSaved == null ? (
                    <span
                      className="text-[var(--c3-style-basic-fg-secondary)]"
                      title={p.costPerMinuteSavedUnavailableReason ?? 'Not available from the backend for this allocation.'}
                    >
                      {NO_DATA}
                    </span>
                  ) : (
                    fmtMoney2(p.costPerWaitingMinuteSaved, p.currency)
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(p.lateCompletedPassengers)}
                  <span className="ml-1 text-[var(--c3-style-basic-fg-secondary)]">({fmtPct(p.lateCompletedPct)})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(p.unservedPassengers)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          Savings are the backend&apos;s horizon-based baseline minus candidate total waiting, including waiting accrued by
          passengers never served. They are not clamped. Cost per minute saved reads {NO_DATA} when the backend could not
          compute it — hover for its reason. Avg completed wait at the selected allocation:{' '}
          {fmtMin(current?.avgWaitMinutesCompleted ?? null)}.
        </p>
      </div>
    </div>
  );
}
