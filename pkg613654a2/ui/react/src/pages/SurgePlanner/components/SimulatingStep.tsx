import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, ServerCrash } from 'lucide-react';

import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface SimulatingStepProps {
  scenarioName: string;
  maxExtraBuses: number;
  /** Message from a failed `runComparison`. Non-null replaces the progress view. */
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}

/**
 * The wait while `SimRunner.runComparison` is in flight.
 *
 * The backend does the whole sweep in one synchronous action and reports no
 * intermediate progress, so there is no completion percentage to show and none
 * is invented: this screen shows what the single call is doing and how long it
 * has actually been running. If the call fails, the error is shown here with the
 * option to retry or go back — the page never falls through to simulated data.
 */
export default function SimulatingStep({ scenarioName, maxExtraBuses, error, onRetry, onBack }: SimulatingStepProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (error) return;
    const startedAt = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => window.clearInterval(id);
  }, [error]);

  const runs = maxExtraBuses + 1;

  return (
    <div className="flex min-h-full w-full items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-5 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-8">
        <div className="flex flex-col gap-1">
          <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">{scenarioName}</span>
          <h2 className="text-c3-bold-heading-h5 text-[var(--c3-style-basic-fg-primary)]">
            {error ? 'Simulation failed' : 'Simulating and optimizing plans'}
          </h2>
        </div>

        {error ? (
          <>
            <Alert variant="soft" appearance="destructive">
              <AlertIcon>
                <ServerCrash aria-hidden />
              </AlertIcon>
              <AlertContent>
                <AlertTitle>
                  <span className="font-mono">SimRunner.runComparison</span> did not return a comparison
                </AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
            <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
              No results are shown, because there are none — this page has no simulator of its own and does not
              substitute placeholder figures for a failed backend call.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button leadingIcon={<RefreshCw />} onClick={onRetry}>
                Retry simulation
              </Button>
              <Button variant="outline" appearance="secondary" leadingIcon={<ArrowLeft />} onClick={onBack}>
                Back to setup
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 shrink-0 animate-spin text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
              <div className="flex min-w-0 flex-col">
                <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                  Waiting on <span className="font-mono">SimRunner.runComparison</span>
                </span>
                <span className="text-c3-regular-label-l2 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                  {(elapsedMs / 1000).toFixed(1)} s elapsed · planning and simulating {runs} allocation
                  {runs === 1 ? '' : 's'} (0 – {maxExtraBuses} extra buses)
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-secondary)] p-4">
              <span className="text-c3-bold-label-l3 uppercase tracking-wide text-[var(--c3-style-basic-fg-secondary)]">
                What this one call does
              </span>
              <ul className="list-disc space-y-1 pl-5 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                <li>Assembles the scenario&apos;s events, estimates, reports and reputation scores into one input.</li>
                <li>Reconciles duplicate reports and cohort overlaps, then validates every reference and range.</li>
                <li>Freezes one immutable demand snapshot that the baseline and every candidate share.</li>
                <li>Simulates the old-model baseline, then plans and simulates each allocation in turn.</li>
                <li>Builds the cost curve and the comparability assertions over all of them.</li>
              </ul>
              <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                The action is synchronous and returns everything at once, so the steps above are not ticked off
                individually — only the elapsed time above is measured.
              </p>
            </div>

            <div>
              <Button variant="ghost" appearance="secondary" leadingIcon={<ArrowLeft />} onClick={onBack}>
                Cancel and go back
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
