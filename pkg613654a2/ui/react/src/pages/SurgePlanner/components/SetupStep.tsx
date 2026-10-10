import React, { useMemo, useState } from 'react';
import {
  Bus,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  ServerCrash,
  Sparkles,
} from 'lucide-react';

import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { SimScenario, SimScopeDescriptor } from '../contracts/types';
import { createTimeFormat, fmtMoney, fmtMoney2, fmtNum1, fmtWeight } from '../format';
import SyntheticBanner from './SyntheticBanner';

interface SetupStepProps {
  /** `SimRunner.listScenarios()`. Empty while loading or after a failed load. */
  scenarios: SimScenario[];
  scenarioId: string | null;
  onScenarioChange: (id: string) => void;
  maxExtraBuses: number;
  onMaxExtraBusesChange: (n: number) => void;
  onRun: () => void;
  scope: SimScopeDescriptor | null;
  /** True while `listScenarios` / `describeScope` are in flight. */
  loading: boolean;
  /** Message from a failed load. There is no fallback scenario list. */
  error: string | null;
  onRetry: () => void;
}

/**
 * The scenario the backend tags `edge-case` is a deliberate boundary fixture
 * (empty demand, total saturation) rather than a representative surge day, so
 * those are collapsed by default. The split comes from the scenario's own
 * `scenarioTags` — there is no client-side categorisation of scenarios.
 */
const EDGE_CASE_TAG = 'edge-case';

function isEdgeCase(scenario: SimScenario): boolean {
  return scenario.scenarioTags.includes(EDGE_CASE_TAG);
}

/**
 * Scenario picker and run configuration.
 *
 * Every value shown is a field of the `SimScenario` the backend returned — the
 * service date, timezone, horizon, planning cutoff, seed, cost rates and the
 * full set of modelling assumptions. Switching scenarios therefore switches all
 * of them; none are hardcoded in the page.
 */
export default function SetupStep({
  scenarios,
  scenarioId,
  onScenarioChange,
  maxExtraBuses,
  onMaxExtraBusesChange,
  onRun,
  scope,
  loading,
  error,
  onRetry,
}: SetupStepProps) {
  const scenario = useMemo(() => scenarios.find((s) => s.id === scenarioId) ?? null, [scenarios, scenarioId]);
  const surgeDays = useMemo(() => scenarios.filter((s) => !isEdgeCase(s)), [scenarios]);
  const edgeCases = useMemo(() => scenarios.filter(isEdgeCase), [scenarios]);
  const [showEdgeCases, setShowEdgeCases] = useState(false);

  const time = useMemo(() => createTimeFormat(scenario?.serviceTimezone ?? 'UTC'), [scenario?.serviceTimezone]);
  const sliderMax = Math.max(scenario?.maxExtraBuses ?? 0, maxExtraBuses, 1);

  return (
    <div className="flex min-h-full w-full flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">MTD Proactive Surge Capacity Planning</h1>
        <p className="max-w-3xl text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          Proactively evaluate where additional buses should run during the day. Compare &ldquo;without changes&rdquo;
          against &ldquo;with these recommendations&rdquo; before MTD allocates supplemental capacity by hand.
        </p>
      </div>

      <SyntheticBanner scope={scope} />

      {error && (
        <Alert variant="soft" appearance="destructive">
          <AlertIcon>
            <ServerCrash aria-hidden />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Could not load scenarios from the backend</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{error}</span>
              <Button size="sm" variant="outline" appearance="secondary" leadingIcon={<RefreshCw />} onClick={onRetry}>
                Try again
              </Button>
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {loading && scenarios.length === 0 && !error && (
        <div className="flex items-center gap-2 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-5 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          <Loader2 className="size-4 animate-spin text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
          Loading scenarios from <span className="font-mono">SimRunner.listScenarios</span>…
        </div>
      )}

      {scenarios.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="flex min-w-0 flex-col gap-4 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-5">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">Simulate event</h2>
              <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                {scenarios.length} scenario{scenarios.length === 1 ? '' : 's'} from the backend
              </span>
            </header>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                Scenario (events &amp; demand)
              </legend>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {surgeDays.map((s) => (
                  <ScenarioCard key={s.id} scenario={s} selected={s.id === scenario?.id} onSelect={() => onScenarioChange(s.id)} />
                ))}
              </div>

              {edgeCases.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEdgeCases((v) => !v)}
                    aria-expanded={showEdgeCases}
                    className="flex w-fit items-center gap-1.5 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-secondary)]"
                  >
                    {showEdgeCases ? (
                      <ChevronDown className="size-4" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4" aria-hidden />
                    )}
                    Edge-case fixtures ({edgeCases.length})
                    <span className="font-normal text-c3-regular-label-l3">
                      · tagged {EDGE_CASE_TAG} by the backend
                    </span>
                  </button>
                  {showEdgeCases && (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {edgeCases.map((s) => (
                        <ScenarioCard
                          key={s.id}
                          scenario={s}
                          selected={s.id === scenario?.id}
                          onSelect={() => onScenarioChange(s.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </fieldset>

            {scenario && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ReadOnlyField
                    icon={<CalendarDays className="size-4" aria-hidden />}
                    label="Service day"
                    value={scenario.serviceDate}
                    hint={scenario.serviceTimezone}
                  />
                  <div className="flex flex-col gap-2 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-secondary)] p-4">
                    <label
                      htmlFor="available-buses"
                      className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]"
                    >
                      <Bus className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                      Excess capacity available
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="available-buses"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={sliderMax}
                        step={1}
                        value={maxExtraBuses}
                        onChange={(e) => {
                          const parsed = Number(e.target.value);
                          if (Number.isNaN(parsed)) {
                            onMaxExtraBusesChange(0);
                            return;
                          }
                          onMaxExtraBusesChange(Math.max(0, Math.min(sliderMax, Math.round(parsed))));
                        }}
                        className="w-24 tabular-nums"
                      />
                      <span className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                        extra bus{maxExtraBuses === 1 ? '' : 'es'} (0–{sliderMax})
                      </span>
                    </div>
                    <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                      The backend plans and simulates every allocation from 0 to this maximum in a single
                      <span className="font-mono"> runComparison </span>
                      call. This scenario&apos;s own <span className="font-mono">maxExtraBuses</span> is{' '}
                      {scenario.maxExtraBuses}.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button size="lg" leadingIcon={<Play />} onClick={onRun} disabled={loading}>
                    Simulate &amp; optimize plans
                  </Button>
                </div>
              </>
            )}
          </section>

          {scenario && (
            <aside className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">{scenario.name}</h3>
                    <p className="font-mono text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{scenario.id}</p>
                  </div>
                  {scenario.isSynthetic && (
                    <Badge variant="soft" appearance="warning" size="sm" className="shrink-0">
                      synthetic
                    </Badge>
                  )}
                </div>
                {scenario.description && (
                  <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{scenario.description}</p>
                )}
                {scenario.scenarioTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {scenario.scenarioTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        appearance={tag === EDGE_CASE_TAG ? 'warning' : 'secondary'}
                        size="sm"
                      >
                        {tag === EDGE_CASE_TAG && <FlaskConical className="size-3" aria-hidden />}
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-3 pt-1">
                  <Stat label="Random seed" value={String(scenario.randomSeed)} />
                  <Stat label="Max extra buses" value={String(scenario.maxExtraBuses)} />
                  <Stat label="Planning cutoff" value={time.clock(scenario.planningCutoff)} />
                  <Stat label="Horizon" value={time.range(scenario.horizonStart, scenario.horizonEnd)} />
                </dl>
              </div>

              <div className="flex flex-col gap-2 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-5">
                <h3 className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">Cost basis</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Stat
                    label="Fixed per allocated bus"
                    value={fmtMoney(scenario.costConfig.fixedCostPerAllocatedBus, scenario.costConfig.currency)}
                  />
                  <Stat
                    label="Per operating minute"
                    value={fmtMoney2(scenario.costConfig.costPerOperatingMinute, scenario.costConfig.currency)}
                  />
                  <Stat
                    label="Per deadhead minute"
                    value={fmtMoney2(scenario.costConfig.costPerDeadheadMinute, scenario.costConfig.currency)}
                  />
                  <Stat
                    label="Per dwell minute"
                    value={fmtMoney2(scenario.costConfig.costPerDwellMinute, scenario.costConfig.currency)}
                  />
                </dl>
                <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  {scenario.costConfig.includeIdleAllocatedBuses
                    ? 'An allocated bus the planner leaves idle still carries its fixed cost.'
                    : 'Allocated buses left idle are not charged.'}
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-5">
                <h3 className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                  <Sparkles className="size-4 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
                  Modelling assumptions
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Stat label="Reliability policy" value={scenario.assumptions.reliabilityPolicy} />
                  <Stat label="Cohort overlap" value={scenario.assumptions.cohortOverlapPolicy} />
                  <Stat label="Queue discipline" value={scenario.assumptions.queueDiscipline} />
                  <Stat label="Arrival window" value={scenario.assumptions.arrivalWindowDistribution} />
                  <Stat label="Overlapping effects" value={scenario.assumptions.overlappingMultiplierRule} />
                  <Stat label="Default confidence" value={fmtWeight(scenario.assumptions.defaultConfidence)} />
                  <Stat label="Default reputation" value={fmtWeight(scenario.assumptions.defaultReputation)} />
                  <Stat label="Dwell" value={`${fmtNum1(scenario.assumptions.defaultDwellMinutes)} min`} />
                  <Stat
                    label="Board / alight"
                    value={`${scenario.assumptions.boardingSecondsPerPassenger}s / ${scenario.assumptions.alightingSecondsPerPassenger}s`}
                  />
                  <Stat label="Deadhead speed" value={`${fmtNum1(scenario.assumptions.deadheadSpeedKmPerHour)} km/h`} />
                  <Stat label="Min turnaround" value={`${fmtNum1(scenario.assumptions.minTurnaroundMinutes)} min`} />
                  <Stat label="Report match window" value={`${scenario.assumptions.reportMatchWindowMinutes} min`} />
                  <Stat label="Transfers" value={scenario.assumptions.allowTransfers ? 'allowed' : 'not modelled'} />
                  <Stat label="Max travel multiplier" value={`${fmtNum1(scenario.assumptions.maxTravelTimeMultiplier)}×`} />
                </dl>
                <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  Confidence and reputation are 0–1 heuristic weights, not calibrated probabilities.
                </p>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario, selected, onSelect }: { scenario: SimScenario; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-sm border p-3 text-left transition-colors',
        selected
          ? 'border-[var(--c3-style-basic-border-accent)] bg-[var(--c3-style-basic-bg-accent)]'
          : 'border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] hover:bg-[var(--c3-style-basic-bg-hover)]',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-c3-bold-label-l1 text-[var(--c3-style-basic-fg-primary)]">{scenario.name}</span>
        {selected ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
        ) : isEdgeCase(scenario) ? (
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
        ) : null}
      </span>
      {scenario.description && (
        <span className="line-clamp-2 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          {scenario.description}
        </span>
      )}
      <span className="text-c3-regular-label-l3 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
        up to {scenario.maxExtraBuses} extra bus{scenario.maxExtraBuses === 1 ? '' : 'es'} · seed {scenario.randomSeed}
      </span>
    </button>
  );
}

function ReadOnlyField({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-secondary)] p-4">
      <span className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
        <span className="text-[var(--c3-style-basic-fg-secondary)]">{icon}</span>
        {label}
      </span>
      <span className="text-c3-bold-body-p1 tabular-nums text-[var(--c3-style-basic-fg-primary)]">{value}</span>
      {hint && <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{hint}</span>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{label}</dt>
      <dd className="truncate text-c3-bold-body-p2 tabular-nums text-[var(--c3-style-basic-fg-primary)]" title={value}>
        {value}
      </dd>
    </div>
  );
}
