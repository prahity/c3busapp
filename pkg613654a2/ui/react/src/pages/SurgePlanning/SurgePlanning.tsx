/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Info, MapPin, TrendingUp, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import { surgeDataSource, type SurgePlan } from './surgeData';
import { usePlayback } from './usePlayback';
import RouteMap from './RouteMap';
import ReplaySlider from './ReplaySlider';
import AggregateStatsBar from './AggregateStatsBar';
import OptimizationOpportunity from './OptimizationOpportunity';

/**
 * MTD Proactive Surge Capacity Planning.
 *
 * A self-contained prototype page: a simulated campus event drives two
 * live-animated route maps (current vs. optimized) that share one replay
 * slider, plus a list of optimization opportunities with before/after visuals.
 *
 * All data comes from {@link surgeDataSource} — mocked today, swappable to a
 * real C3 backend without touching any component in this folder.
 */
export default function SurgePlanning() {
  const { reportError } = useErrorBoundary();
  const [plan, setPlan] = useState<SurgePlan | null>(null);
  const [loading, setLoading] = useState(true);

  const playback = usePlayback({ loopSeconds: 24 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    surgeDataSource
      .getSurgePlan()
      .then((data) => {
        if (!cancelled) {
          setPlan(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          reportError(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  const attendance = useMemo(
    () => (plan ? plan.event.expectedAttendance.toLocaleString() : ''),
    [plan],
  );

  if (loading) {
    return (
      <div className="flex min-h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-full w-full items-center justify-center p-8 text-center">
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          Could not load the surge plan. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 px-6 py-6">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">
            MTD Proactive Surge Capacity Planning
          </h1>
          <Badge variant="soft" appearance="secondary">
            Prototype · mock data
          </Badge>
        </div>
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          Proactively allocate surge schedules based on real data specific to UIUC.
        </p>
      </header>

      {/* Simulated-event scenario summary (inputs mocked from the event form) */}
      <Card variant="outlined" size="sm" className="gap-3">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-[var(--c3-style-basic-fg-secondary)]" />
          <span className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">Simulated event</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <ScenarioItem icon={<MapPin className="size-4" />} label={plan.event.name} sub={plan.event.venue} />
          <ScenarioItem
            icon={<CalendarClock className="size-4" />}
            label={plan.event.windowLabel}
            sub={`${plan.event.startClock} – ${plan.event.endClock}`}
          />
          <ScenarioItem
            icon={<Users className="size-4" />}
            label={`${attendance} expected`}
            sub="Projected attendance"
          />
          <ScenarioItem
            icon={<TrendingUp className="size-4" />}
            label={`+${plan.event.excessBuses} surge buses`}
            sub="Excess capacity available"
          />
        </div>
      </Card>

      {/* Shared replay control */}
      <ReplaySlider playback={playback} startClock={plan.event.startClock} endClock={plan.event.endClock} />

      {/* Side-by-side maps */}
      <section>
        <h2 className="mb-3 text-c3-bold-heading-h5 text-[var(--c3-style-basic-fg-primary)]">
          Optimized surge capacity plan
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MapPanel title="Current plan" tone="neutral">
            <div className="h-[360px] w-full">
              <RouteMap plan={plan.oldPlan} t={playback.t} center={plan.mapCenter} zoom={plan.mapZoom} />
            </div>
            <AggregateStatsBar stats={plan.oldStats} tone="neutral" />
          </MapPanel>

          <MapPanel title="Optimized plan" tone="improved" badge="Optimized">
            <div className="h-[360px] w-full">
              <RouteMap plan={plan.optimizedPlan} t={playback.t} center={plan.mapCenter} zoom={plan.mapZoom} />
            </div>
            <AggregateStatsBar stats={plan.optimizedStats} baseline={plan.oldStats} tone="improved" />
          </MapPanel>
        </div>
        <MapLegend />
      </section>

      {/* Optimization opportunities */}
      <section className="flex flex-col gap-3">
        <h2 className="text-c3-bold-heading-h5 text-[var(--c3-style-basic-fg-primary)]">
          Optimization opportunities
        </h2>
        <div className="flex flex-col gap-4">
          {plan.opportunities.map((opp) => (
            <OptimizationOpportunity key={opp.id} opportunity={opp} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ScenarioItem({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--c3-style-basic-fg-accent)]">{icon}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">{label}</span>
        <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{sub}</span>
      </div>
    </div>
  );
}

function MapPanel({
  title,
  tone,
  badge,
  children,
}: {
  title: string;
  tone: 'neutral' | 'improved';
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Card variant="outlined" className="gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">{title}</h3>
        {badge && (
          <Badge variant="soft" appearance={tone === 'improved' ? 'success' : 'secondary'}>
            {badge}
          </Badge>
        )}
      </div>
      {children}
    </Card>
  );
}

function MapLegend() {
  const items: { color: string; label: string }[] = [
    { color: '#16a34a', label: 'Healthy (<60%)' },
    { color: '#f59e0b', label: 'Busy (60–85%)' },
    { color: '#dc2626', label: 'Overloaded (>85%)' },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 rounded-full" style={{ backgroundColor: it.color }} />
          <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{it.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-6 rounded-full border-b-2 border-dashed border-[var(--c3-style-basic-fg-neutral)]" />
        <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">New route</span>
      </div>
    </div>
  );
}
