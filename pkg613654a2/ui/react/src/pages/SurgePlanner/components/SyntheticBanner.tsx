import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FlaskConical } from 'lucide-react';

import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import type { SimScopeDescriptor } from '../contracts/types';

interface SyntheticBannerProps {
  /** `SimRunner.describeScope()`. Null while it is still loading or if it failed. */
  scope: SimScopeDescriptor | null;
  /** `syntheticDataLabel` from the loaded comparison, when one is loaded. */
  runLabel?: string;
}

/**
 * Standing disclosure that the figures on this page are simulated and advisory.
 *
 * The numbers are no longer computed in the browser — every one comes from the
 * `SimRunner` backend. But the backend's scenarios are still synthetic fixtures
 * (`SimScenario.isSynthetic` is true for all of them) and the whole package is
 * advisory: nothing here dispatches a bus or publishes to MTD. The wording is
 * taken from `describeScope()` where available so the disclosure cannot drift
 * away from what the backend says about itself.
 */
export default function SyntheticBanner({ scope, runLabel }: SyntheticBannerProps) {
  const [open, setOpen] = useState(false);
  const label = scope?.syntheticDataLabel ?? runLabel ?? null;

  return (
    <Alert variant="soft" appearance="warning" className="w-full">
      <AlertIcon>
        <FlaskConical aria-hidden />
      </AlertIcon>
      <AlertContent>
        <AlertTitle className="flex flex-wrap items-center gap-2">
          <span>Simulated, synthetic and advisory</span>
          <Badge variant="soft" appearance="warning" size="sm">
            {label ?? 'synthetic fixture data'}
          </Badge>
          {scope && (
            <Badge variant="outline" appearance="secondary" size="sm">
              contract {scope.contractVersion}
            </Badge>
          )}
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            Results come from the <span className="font-medium">SimRunner</span> backend, but every scenario, stop,
            event, estimate, report and bus behind them is a synthetic fixture — not live MTD operations data. Figures
            are a recommendation for a human to act on; nothing on this page dispatches a bus or publishes a plan to
            MTD.
          </span>
          {scope && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-fit items-center gap-1 text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-accent)]"
                aria-expanded={open}
              >
                {open ? 'Hide scope and caveats' : 'Scope, data labelling and caveats'}
                {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
              </button>
              {open && (
                <div className="flex flex-col gap-3 border-t border-[var(--c3-style-basic-border-weak)] pt-3">
                  <Note label="Purpose" text={scope.purpose} />
                  <Note label="Data labelling" text={scope.dataLabelling} />
                  <Note label="Reliability weights" text={scope.reliabilityNote} />
                  <Note label="Savings" text={scope.savingsNote} />
                  <Note label="Assumptions" text={scope.keyAssumptionsNote} />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ScopeList title="In scope" items={scope.inScope} />
                    <ScopeList title="Out of scope" items={scope.outOfScope} />
                  </div>
                </div>
              )}
            </>
          )}
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-c3-regular-label-l2">
      <span className="font-medium">{label}: </span>
      {text}
    </p>
  );
}

function ScopeList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-c3-bold-label-l3 uppercase tracking-wide">{title}</span>
      <ul className="list-disc space-y-0.5 pl-5 text-c3-regular-label-l2">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
