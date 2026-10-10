/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React from 'react';
import type { AggregateStats } from './surgeData';

interface AggregateStatsBarProps {
  stats: AggregateStats;
  /** When provided, each metric shows the delta vs. this baseline. */
  baseline?: AggregateStats;
  tone: 'neutral' | 'improved';
}

interface Metric {
  key: keyof AggregateStats;
  label: string;
  format: (v: number) => string;
  /** True when a lower value is better (wait time, overcrowding). */
  lowerIsBetter: boolean;
}

const METRICS: Metric[] = [
  { key: 'avgWaitMin', label: 'Avg wait', format: (v) => `${v.toFixed(1)}m`, lowerIsBetter: true },
  { key: 'overcrowdingPct', label: 'Overcrowded', format: (v) => `${v}%`, lowerIsBetter: true },
  { key: 'onTimePct', label: 'On-time', format: (v) => `${v}%`, lowerIsBetter: false },
  { key: 'busesDeployed', label: 'Buses', format: (v) => `${v}`, lowerIsBetter: false },
  {
    key: 'passengersServed',
    label: 'Riders',
    format: (v) => `${(v / 1000).toFixed(1)}k`,
    lowerIsBetter: false,
  },
];

/** Row of KPI tiles shown under a route map, optionally with deltas vs a baseline. */
export default function AggregateStatsBar({ stats, baseline, tone }: AggregateStatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {METRICS.map((m) => {
        const value = stats[m.key];
        const base = baseline?.[m.key];
        const delta = base != null ? value - base : null;
        const improved =
          delta == null || delta === 0 ? null : m.lowerIsBetter ? delta < 0 : delta > 0;

        return (
          <div
            key={m.key}
            className="flex flex-col gap-0.5 rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-3 py-2"
          >
            <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{m.label}</span>
            <span
              className={`text-c3-bold-body-p1 ${
                tone === 'improved'
                  ? 'text-[var(--c3-style-basic-fg-success)]'
                  : 'text-[var(--c3-style-basic-fg-primary)]'
              }`}
            >
              {m.format(value)}
            </span>
            {delta != null && delta !== 0 && (
              <span
                className={`text-c3-regular-label-l3 ${
                  improved
                    ? 'text-[var(--c3-style-basic-fg-success)]'
                    : 'text-[var(--c3-style-basic-fg-danger)]'
                }`}
              >
                {`${delta > 0 ? '+' : '−'}${m.format(Math.abs(delta))}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
