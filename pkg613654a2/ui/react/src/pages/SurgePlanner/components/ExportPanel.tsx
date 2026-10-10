import React, { useCallback, useState } from 'react';
import { Download, FileJson, Loader2, ServerCrash } from 'lucide-react';

import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { describeError, fetchExportBundle } from '../api';
import type { SimComparison, SimPlan, SimResults } from '../contracts/types';
import { CONTRACT_VERSION } from '../contracts/types';

interface ExportPanelProps {
  comparison: SimComparison;
  /** The selected allocation's results, or null when the backend has no candidate for it. */
  candidate: SimResults | null;
  /** The selected allocation's plan, or null at allocation 0. */
  plan: SimPlan | null;
  allocation: number;
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * JSON exports.
 *
 * The headline export is the backend's own `SimRunner.exportBundle`, downloaded
 * verbatim — it is the authoritative handoff artefact and is never reassembled
 * or edited here. The remaining buttons serialize the parts of the comparison
 * already in memory, so they need no further round trip.
 */
export default function ExportPanel({ comparison, candidate, plan, allocation }: ExportPanelProps) {
  const [bundleState, setBundleState] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState<string | null>(null);

  const base = `surge-${comparison.scenarioId}`;
  const maxExtraBuses = comparison.input.maxExtraBuses;

  const handleBundle = useCallback(async () => {
    setBundleState('loading');
    setError(null);
    try {
      const bundle = await fetchExportBundle(comparison.scenarioId, maxExtraBuses);
      download(`${base}-bundle-max${maxExtraBuses}.json`, bundle);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBundleState('idle');
    }
  }, [base, comparison.scenarioId, maxExtraBuses]);

  const local = useCallback(
    (name: string, data: unknown) => () => {
      try {
        download(name, data);
        setError(null);
      } catch (err) {
        setError(describeError(err));
      }
    },
    [],
  );

  /**
   * The stop-delay boundary a downstream map integration would consume. Fields
   * are passed through unchanged, including nulls: a window with no observations
   * exports `hasObservations: false` and a null wait, not a zero.
   */
  const stopDelayBoundary = candidate
    ? {
        contractVersion: comparison.contractVersion ?? CONTRACT_VERSION,
        syntheticDataLabel: comparison.syntheticDataLabel,
        disclaimer: 'Simulated estimates from synthetic scenario fixtures — not live MTD arrival data.',
        scenarioId: comparison.scenarioId,
        serviceDate: comparison.input.serviceDate,
        serviceTimezone: comparison.input.serviceTimezone,
        windowMinutes: comparison.input.assumptions.stopDelayWindowMinutes,
        units: { estimatedWaitMinutes: 'minutes', maxWaitMinutes: 'minutes' },
        resultsId: candidate.resultsId,
        allocation: candidate.allocation,
        stops: comparison.input.coreService.stops.map((s) => ({
          id: s.id,
          name: s.name,
          stopCode: s.stopCode ?? null,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
        windows: candidate.stopWindowDelays,
      }
    : null;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="soft" appearance="destructive">
          <AlertIcon>
            <ServerCrash aria-hidden />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Export failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FileJson className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
        <span className="mr-1 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
          Export JSON (contract {comparison.contractVersion ?? CONTRACT_VERSION}):
        </span>

        <Button
          size="sm"
          variant="solid"
          appearance="accent"
          leadingIcon={bundleState === 'loading' ? <Loader2 className="animate-spin" /> : <Download />}
          onClick={handleBundle}
          disabled={bundleState === 'loading'}
        >
          {bundleState === 'loading' ? 'Building bundle…' : `Backend export bundle (max ${maxExtraBuses})`}
        </Button>

        <Button
          size="sm"
          variant="outline"
          appearance="secondary"
          leadingIcon={<Download />}
          onClick={local(`${base}-input.json`, comparison.input)}
        >
          Assembled input
        </Button>
        <Button
          size="sm"
          variant="outline"
          appearance="secondary"
          leadingIcon={<Download />}
          onClick={local(`${base}-reconciliation.json`, comparison.input.reconciliation)}
        >
          Reconciliation trace
        </Button>
        <Button
          size="sm"
          variant="outline"
          appearance="secondary"
          leadingIcon={<Download />}
          onClick={local(`${base}-demand-snapshot.json`, comparison.demandSnapshot)}
        >
          Demand snapshot
        </Button>
        <Button
          size="sm"
          variant="outline"
          appearance="secondary"
          leadingIcon={<Download />}
          onClick={local(`${base}-plan-k${allocation}.json`, plan)}
          disabled={!plan}
        >
          Plan (k={allocation})
        </Button>
        <Button
          size="sm"
          variant="outline"
          appearance="secondary"
          leadingIcon={<Download />}
          onClick={local(`${base}-results-k${allocation}.json`, candidate)}
          disabled={!candidate}
        >
          Results (k={allocation})
        </Button>
        <Button
          size="sm"
          variant="outline"
          appearance="secondary"
          leadingIcon={<Download />}
          onClick={local(`${base}-cost-curve.json`, comparison.costCurve)}
        >
          Cost curve
        </Button>
        <Button
          size="sm"
          variant="outline"
          appearance="accent"
          leadingIcon={<Download />}
          onClick={local(`${base}-stop-delays-k${allocation}.json`, stopDelayBoundary)}
          disabled={!stopDelayBoundary}
        >
          Stop-delay export (map boundary)
        </Button>
      </div>

      <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
        The backend bundle is fetched from <span className="font-mono">SimRunner.exportBundle</span> and written out
        unmodified. The other files serialize the loaded comparison exactly as the backend returned it — fields the
        backend left null stay null.
      </p>
    </div>
  );
}
