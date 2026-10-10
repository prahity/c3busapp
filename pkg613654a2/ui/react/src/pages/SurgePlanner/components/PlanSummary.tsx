/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React, { useMemo } from 'react';
import { ArrowRight, Bus, CalendarClock, MapPin, Sparkles, TrendingDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import type { SimComparison, SimEventActivation, SimPlan, SimResults } from '../contracts/types';
import { fmtMoney, fmtMoney2, fmtNum, fmtPct } from '../format';
import { useRunContext } from '../runContext';

interface PlanSummaryProps {
  comparison: SimComparison;
  allocation: number;
  /** The selected candidate's results, or null at an allocation the sweep did not cover. */
  candidate: SimResults | null;
  /** The selected candidate's plan, or null at allocation 0. */
  plan: SimPlan | null;
}

/** The event that put the most riders on the road during this run — the thing being absorbed. */
function leadActivation(acts: SimEventActivation[]): SimEventActivation | null {
  let best: SimEventActivation | null = null;
  for (const a of acts) {
    if (!best || a.generatedPassengers > best.generatedPassengers) best = a;
  }
  return best;
}

/**
 * The one-glance answer to "what is the optimization?".
 *
 * Sits at the very top of the results so the before → after is obvious before
 * any table or map: which event is driving demand, and what adding this many
 * extra buses does to campus waiting, who is left unserved, and the cost. Every
 * number is read straight off the loaded {@link SimComparison} — baseline vs. the
 * selected candidate — and null stays null.
 */
export default function PlanSummary({ comparison, allocation, candidate, plan }: PlanSummaryProps) {
  const { time, stopName } = useRunContext();
  const { baseline, demandSnapshot } = comparison;
  const bm = baseline.metrics;
  const cm = candidate?.metrics ?? null;

  const lead = useMemo(() => leadActivation(candidate?.eventActivations ?? baseline.eventActivations), [candidate, baseline]);
  const otherEventCount = (candidate?.eventActivations ?? baseline.eventActivations).length - (lead ? 1 : 0);

  const leadStops = useMemo(() => {
    if (!lead) return [];
    return lead.affectedIds.map((id) => stopName(id)).filter((n) => n && !n.startsWith('—')).slice(0, 2);
  }, [lead, stopName]);

  const noDemand = demandSnapshot.totalPassengers === 0;
  const saved = cm?.horizonWaitingMinutesSavedVsBaseline ?? 0;
  const savedPct = bm.horizonTotalWaitingMinutes > 0 ? saved / bm.horizonTotalWaitingMinutes : null;
  const positive = cm != null && allocation > 0 && saved > 0;

  const headline = (() => {
    if (!cm) return 'Pick an allocation the sweep covered to see the optimization.';
    if (noDemand) return 'This scenario generated no simulated passengers, so there is nothing to optimize.';
    if (allocation === 0) return 'This is the do-nothing baseline. Add extra buses to see the optimization.';
    if (saved <= 0)
      return `Adding ${allocation} extra bus${allocation === 1 ? '' : 'es'} does not beat the baseline here — the backend reports no net waiting saved.`;
    return `Add ${plan?.busesUsed ?? 0} extra bus${(plan?.busesUsed ?? 0) === 1 ? '' : 'es'} to absorb the surge below — cutting campus waiting by ${savedPct == null ? '' : fmtPct(savedPct) + ' '}for ${fmtMoney(cm.extraBusOperatingCost, cm.currency)}.`;
  })();

  return (
    <section className="flex flex-col gap-4 rounded-sm border-2 border-[var(--c3-style-basic-border-accent)] bg-[var(--c3-style-basic-bg-secondary)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-5 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
        <h2 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">The optimization</h2>
        <Badge variant="solid" appearance="accent" size="sm">
          <Bus className="mr-1 size-3.5" aria-hidden />
          {allocation} extra bus{allocation === 1 ? '' : 'es'}
        </Badge>
      </div>

      <p className="max-w-3xl text-c3-regular-body-p1 text-[var(--c3-style-basic-fg-primary)]">{headline}</p>

      {cm && !noDemand && (
        <>
          {/* The before → after that is the whole point of the page. */}
          <div className="flex flex-wrap items-stretch gap-3">
            <BeforeAfter
              label="Campus waiting"
              unit="passenger-min"
              before={fmtNum(bm.horizonTotalWaitingMinutes)}
              after={fmtNum(cm.horizonTotalWaitingMinutes)}
              good={positive}
            />
            <BeforeAfter
              label="Still unserved at horizon"
              unit="passengers"
              before={fmtNum(bm.unservedAtHorizon)}
              after={fmtNum(cm.unservedAtHorizon)}
              good={cm.unservedAtHorizon < bm.unservedAtHorizon}
            />
            <BeforeAfter
              label="Late to a deadline"
              unit="passengers"
              before={fmtNum(bm.lateCompletedPassengers)}
              after={fmtNum(cm.lateCompletedPassengers)}
              good={cm.lateCompletedPassengers < bm.lateCompletedPassengers}
            />
            <div className="flex min-w-[9rem] flex-1 flex-col justify-center gap-1 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] px-4 py-3">
              <span className="flex items-center gap-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                <TrendingDown className="size-3.5" aria-hidden /> Waiting saved
              </span>
              <span className="text-c3-bold-heading-h5 tabular-nums text-[var(--c3-style-basic-fg-accent)]">
                {positive ? fmtNum(saved) : '0'}
              </span>
              <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                passenger-min{' '}
                {cm.costPerWaitingMinuteSaved != null ? `· ${fmtMoney2(cm.costPerWaitingMinuteSaved, cm.currency)}/min` : ''}
              </span>
            </div>
          </div>

          {/* What is driving the demand — the "where / when" of the event. */}
          {lead && (
            <div className="flex flex-col gap-1 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                <MapPin className="size-4 text-[var(--c3-style-basic-fg-danger)]" aria-hidden />
                <span className="font-medium">Driving the surge:</span>
                <span className="font-semibold">{lead.eventName ?? lead.eventId}</span>
                {lead.eventType && (
                  <Badge variant="soft" appearance="secondary" size="sm">
                    {lead.eventType}
                  </Badge>
                )}
                <Badge variant="soft" appearance="danger" size="sm">
                  {fmtNum(lead.generatedPassengers)} riders
                </Badge>
                <span className="flex items-center gap-1 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {time.range(lead.activationTime, lead.deactivationTime)}
                </span>
                {otherEventCount > 0 && (
                  <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    +{otherEventCount} more event{otherEventCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                {leadStops.length > 0 && (
                  <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">Hits {leadStops.join(', ')}
                    {lead.affectedIds.length > leadStops.length ? ` +${lead.affectedIds.length - leadStops.length} more` : ''}. </span>
                )}
                {lead.effectSummary ?? 'See the campus map below for exactly where it lands and how the plan responds.'}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** One before → after pair with a direction-aware tint. */
function BeforeAfter({
  label,
  unit,
  before,
  after,
  good,
}: {
  label: string;
  unit: string;
  before: string;
  after: string;
  good: boolean;
}) {
  return (
    <div className="flex min-w-[12rem] flex-1 flex-col gap-1 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] px-4 py-3">
      <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-c3-bold-body-p1 tabular-nums text-[var(--c3-style-basic-fg-secondary)] line-through decoration-1">
          {before}
        </span>
        <ArrowRight className="size-4 shrink-0 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
        <span
          className={
            good
              ? 'text-c3-bold-heading-h5 tabular-nums text-[var(--c3-style-basic-fg-success)]'
              : 'text-c3-bold-heading-h5 tabular-nums text-[var(--c3-style-basic-fg-primary)]'
          }
        >
          {after}
        </span>
      </div>
      <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{unit}</span>
    </div>
  );
}
