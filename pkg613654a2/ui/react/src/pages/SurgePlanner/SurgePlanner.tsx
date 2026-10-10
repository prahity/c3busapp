import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { describeError, fetchScenarios, fetchScope, loadedAllocations, mergeAllocation, runAllocation, runComparison } from './api';
import ResultsStep from './components/ResultsStep';
import SetupStep from './components/SetupStep';
import SimulatingStep from './components/SimulatingStep';
import type { SimComparison, SimScenario, SimScopeDescriptor } from './contracts/types';
import { RunContextProvider } from './runContext';

type Step = 'setup' | 'simulating' | 'results';

/**
 * MTD Proactive Surge Capacity Planning.
 *
 * Three screens — configure, run, review — over the real `SimRunner` backend.
 * The scenario list, the scope disclosure and every simulated number come from
 * `c3Action` calls (see `./api.ts`); there is no client-side simulator and no
 * fallback data, so a failed call is shown as an error on the screen that needed
 * it rather than being papered over.
 *
 * `runComparison(scenarioId, maxExtraBuses)` is the one expensive call: it
 * returns the baseline plus a candidate for every allocation from 0 to the
 * maximum, so the allocation control on the results screen moves through
 * already-loaded data. `runAllocation` is used only to re-simulate the selected
 * allocation on demand, and its result is merged into the loaded sweep.
 */
const SurgePlanner: React.FC = () => {
  const [step, setStep] = useState<Step>('setup');

  // Setup screen: scenario list + scope disclosure.
  const [scenarios, setScenarios] = useState<SimScenario[]>([]);
  const [scope, setScope] = useState<SimScopeDescriptor | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);

  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [maxExtraBuses, setMaxExtraBuses] = useState(0);

  // Run state.
  const [comparison, setComparison] = useState<SimComparison | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runAttempt, setRunAttempt] = useState(0);
  const [allocation, setAllocation] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // `listScenarios` and `describeScope` are independent, so one failing does not
  // hide the other — both failures are reported together.
  useEffect(() => {
    let cancelled = false;
    setSetupLoading(true);
    setSetupError(null);
    void (async () => {
      const [scenarioResult, scopeResult] = await Promise.allSettled([fetchScenarios(), fetchScope()]);
      if (cancelled) return;
      const problems: string[] = [];
      if (scenarioResult.status === 'fulfilled') {
        const list = scenarioResult.value;
        setScenarios(list);
        setScenarioId(list[0].id);
        setMaxExtraBuses(list[0].maxExtraBuses);
      } else {
        setScenarios([]);
        problems.push(`SimRunner.listScenarios failed: ${describeError(scenarioResult.reason)}`);
      }
      if (scopeResult.status === 'fulfilled') {
        setScope(scopeResult.value);
      } else {
        setScope(null);
        problems.push(`SimRunner.describeScope failed: ${describeError(scopeResult.reason)}`);
      }
      setSetupError(problems.length > 0 ? problems.join(' · ') : null);
      setSetupLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setupAttempt]);

  // The sweep itself. Runs whenever the simulating screen is entered or retried.
  useEffect(() => {
    if (step !== 'simulating' || !scenarioId) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await runComparison(scenarioId, maxExtraBuses);
        if (cancelled) return;
        const allocations = loadedAllocations(result);
        setComparison(result);
        setAllocation(
          allocations.includes(maxExtraBuses) ? maxExtraBuses : (allocations[allocations.length - 1] ?? 0),
        );
        setRefreshError(null);
        setStep('results');
      } catch (err) {
        if (cancelled) return;
        setRunError(describeError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `runAttempt` is the retry trigger; the sweep must not re-fire on anything else.
  }, [step, runAttempt, scenarioId, maxExtraBuses]);

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId) ?? null,
    [scenarios, scenarioId],
  );

  const handleScenarioChange = useCallback(
    (id: string) => {
      setScenarioId(id);
      const next = scenarios.find((s) => s.id === id);
      if (next) setMaxExtraBuses(next.maxExtraBuses);
    },
    [scenarios],
  );

  const handleRun = useCallback(() => {
    setComparison(null);
    setRunError(null);
    setRefreshError(null);
    setRunAttempt((n) => n + 1);
    setStep('simulating');
  }, []);

  const handleRunRetry = useCallback(() => {
    setRunError(null);
    setRunAttempt((n) => n + 1);
  }, []);

  const handleBack = useCallback(() => {
    setRunError(null);
    setStep('setup');
  }, []);

  /** Re-simulates just the selected allocation and folds the result into the sweep. */
  const handleRefreshAllocation = useCallback(async () => {
    if (!comparison) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const single = await runAllocation(comparison.scenarioId, allocation);
      setComparison((prev) => (prev ? mergeAllocation(prev, single) : single));
    } catch (err) {
      setRefreshError(describeError(err));
    } finally {
      setRefreshing(false);
    }
  }, [comparison, allocation]);

  const candidateDelays = useMemo(() => {
    if (!comparison) return [];
    return comparison.candidates.find((c) => c.allocation === allocation)?.stopWindowDelays ?? [];
  }, [comparison, allocation]);

  const delaySets = useMemo(
    () => (comparison ? [comparison.baseline.stopWindowDelays, candidateDelays] : []),
    [comparison, candidateDelays],
  );

  if (step === 'simulating') {
    return (
      <SimulatingStep
        scenarioName={selectedScenario?.name ?? (scenarioId ?? 'Selected scenario')}
        maxExtraBuses={maxExtraBuses}
        error={runError}
        onRetry={handleRunRetry}
        onBack={handleBack}
      />
    );
  }

  if (step === 'results' && comparison) {
    return (
      <RunContextProvider
        timeZone={comparison.input.serviceTimezone}
        stops={comparison.input.coreService.stops}
        delaySets={delaySets}
      >
        <ResultsStep
          comparison={comparison}
          scope={scope}
          allocation={allocation}
          onAllocationChange={setAllocation}
          onBack={handleBack}
          onRefreshAllocation={handleRefreshAllocation}
          refreshing={refreshing}
          refreshError={refreshError}
        />
      </RunContextProvider>
    );
  }

  return (
    <SetupStep
      scenarios={scenarios}
      scenarioId={scenarioId}
      onScenarioChange={handleScenarioChange}
      maxExtraBuses={maxExtraBuses}
      onMaxExtraBusesChange={setMaxExtraBuses}
      onRun={handleRun}
      scope={scope}
      loading={setupLoading}
      error={setupError}
      onRetry={() => setSetupAttempt((n) => n + 1)}
    />
  );
};

export default SurgePlanner;
