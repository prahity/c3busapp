import React, { useMemo } from 'react';
import { AlertTriangle, CircleCheck, CircleHelp, GitMerge, Info, ScaleIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { parseAssertion } from '../api';
import type {
  ParsedAssertion,
  SimEvent,
  SimReconciliationEntry,
  SimReconciliationTrace,
  SimValidationIssue,
  SimValidationReport,
} from '../contracts/types';
import { NO_DATA, fmtWeight } from '../format';

interface ReconciliationPanelProps {
  /** `comparison.input.reconciliation`. */
  reconciliation: SimReconciliationTrace;
  /** `comparison.input.validation`. */
  validation: SimValidationReport;
  /** `comparison.comparabilityAssertions` — the backend's own checks on this comparison. */
  assertions: string[];
  /** `comparison.input.events`, used only to show an event's name next to its id. */
  events: SimEvent[];
}

/** How each backend `entryKind` should read, and how alarming it is. */
const ENTRY_KIND: Record<string, { label: string; appearance: 'success' | 'warning' | 'secondary' | 'info' | 'danger' }> = {
  ReportMatchedByCanonicalId: { label: 'matched by canonical id', appearance: 'success' },
  ReportMatchedByFallback: { label: 'matched by stop + time fallback', appearance: 'warning' },
  ReportUnmatched: { label: 'report unmatched', appearance: 'danger' },
  DuplicateEventSuppressed: { label: 'duplicate event suppressed', appearance: 'warning' },
  CohortOverlapResolved: { label: 'cohort overlap resolved', appearance: 'info' },
  ReliabilityWeightApplied: { label: 'reliability weight applied', appearance: 'secondary' },
};

function entryKindOf(kind: string) {
  return ENTRY_KIND[kind] ?? { label: kind, appearance: 'secondary' as const };
}

const SEVERITY: Record<SimValidationIssue['severity'], { appearance: 'danger' | 'warning' | 'info'; icon: React.ReactNode }> = {
  Error: { appearance: 'danger', icon: <AlertTriangle className="size-3.5" aria-hidden /> },
  Warning: { appearance: 'warning', icon: <AlertTriangle className="size-3.5" aria-hidden /> },
  Info: { appearance: 'info', icon: <Info className="size-3.5" aria-hidden /> },
};

function AssertionRow({ assertion }: { assertion: ParsedAssertion }) {
  const appearance =
    assertion.verdict === 'PASS' ? 'success' : assertion.verdict === 'FAIL' ? 'danger' : assertion.verdict === 'NOT CHECKED' ? 'secondary' : 'info';
  const Icon = assertion.verdict === 'PASS' ? CircleCheck : assertion.verdict === 'FAIL' ? AlertTriangle : CircleHelp;
  return (
    <li className="flex items-start gap-2 text-c3-regular-label-l2">
      <Badge variant="soft" appearance={appearance} size="sm" className="shrink-0">
        <Icon className="size-3" aria-hidden />
        {assertion.verdict}
      </Badge>
      <span className="text-[var(--c3-style-basic-fg-secondary)]">{assertion.text}</span>
    </li>
  );
}

/**
 * What the input assembler decided, and on what authority.
 *
 * Every row is one `SimReconciliationEntry` the backend emitted: which reports
 * fed which event, which duplicates it suppressed, which cohort overlaps it
 * resolved, and the confidence, reputation and applied weight behind each. A
 * weight the producer never supplied shows as "default", never as 0 — a zero
 * weight and an absent weight mean different things.
 */
export default function ReconciliationPanel({ reconciliation, validation, assertions, events }: ReconciliationPanelProps) {
  const eventNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) m.set(e.id, e.name);
    return m;
  }, [events]);

  const parsed = useMemo(() => assertions.map(parseAssertion), [assertions]);
  const entries: SimReconciliationEntry[] = reconciliation.entries;
  const issues = validation.issues;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
          <ScaleIcon className="size-4 shrink-0 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
          <span>
            <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">Reliability policy: </span>
            {reconciliation.reliabilityPolicy || NO_DATA}
          </span>
          <span>
            <span className="font-medium text-[var(--c3-style-basic-fg-primary)]">Cohort overlap policy: </span>
            {reconciliation.cohortOverlapPolicy || NO_DATA}
          </span>
        </p>
        {reconciliation.policyNotes.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
            {reconciliation.policyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
          <GitMerge className="size-4 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
          Reconciliation decisions ({entries.length})
        </h4>
        {entries.length === 0 ? (
          <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
            The assembler recorded no reconciliation decisions for this scenario — nothing needed matching, suppressing
            or reweighting.
          </p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decision</TableHead>
                  <TableHead>Target event</TableHead>
                  <TableHead>Contributing reports</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Reputation</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead>Rationale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, i) => {
                  const kind = entryKindOf(entry.entryKind);
                  return (
                    <TableRow key={`${entry.entryKind}-${entry.targetEventId ?? 'none'}-${i}`}>
                      <TableCell>
                        <Badge variant="soft" appearance={kind.appearance} size="sm">
                          {kind.label}
                        </Badge>
                        {entry.policy && (
                          <div className="mt-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                            {entry.policy}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.targetEventId ? (
                          <>
                            <div className="font-medium text-[var(--c3-style-basic-fg-primary)]">
                              {eventNames.get(entry.targetEventId) ?? NO_DATA}
                            </div>
                            <div className="font-mono text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                              {entry.targetEventId}
                            </div>
                          </>
                        ) : (
                          <span className="text-[var(--c3-style-basic-fg-secondary)]">{NO_DATA}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-c3-regular-label-l3">
                        {entry.contributingReportIds.length > 0 ? entry.contributingReportIds.join(', ') : NO_DATA}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.confidenceUsed == null ? (
                          <span className="text-[var(--c3-style-basic-fg-secondary)]" title="Not supplied — the scenario default applies.">
                            default
                          </span>
                        ) : (
                          fmtWeight(entry.confidenceUsed)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.reputationUsed == null ? (
                          <span className="text-[var(--c3-style-basic-fg-secondary)]" title="Not supplied — the scenario default applies.">
                            default
                          </span>
                        ) : (
                          fmtWeight(entry.reputationUsed)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.appliedWeight == null ? (
                          <span className="text-[var(--c3-style-basic-fg-secondary)]">{NO_DATA}</span>
                        ) : (
                          fmtWeight(entry.appliedWeight)
                        )}
                      </TableCell>
                      <TableCell className="max-w-md text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                        {entry.rationale ?? NO_DATA}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          Confidence, reputation and applied weight are 0–1 heuristic weights, not calibrated probabilities.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h4 className="flex flex-wrap items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
            <AlertTriangle className="size-4 text-[var(--c3-style-basic-fg-warning)]" aria-hidden />
            Input validation
            <Badge variant="soft" appearance={validation.isValid ? 'success' : 'danger'} size="sm">
              {validation.isValid ? 'valid' : 'invalid'}
            </Badge>
            <Badge variant="outline" appearance="secondary" size="sm">
              {validation.errorCount} error{validation.errorCount === 1 ? '' : 's'} · {validation.warningCount} warning
              {validation.warningCount === 1 ? '' : 's'}
            </Badge>
          </h4>
          {issues.length === 0 ? (
            <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
              The assembler validated every input with no issues.
            </span>
          ) : (
            <ul className="flex flex-col gap-1.5 text-c3-regular-label-l2">
              {issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.refId ?? 'none'}-${i}`} className="flex items-start gap-2">
                  <Badge variant="soft" appearance={SEVERITY[issue.severity].appearance} size="sm" className="shrink-0">
                    {SEVERITY[issue.severity].icon}
                    {issue.severity}
                  </Badge>
                  <span className="text-[var(--c3-style-basic-fg-secondary)]">
                    {issue.message}
                    <span className="ml-1 font-mono text-c3-regular-label-l3">
                      [{issue.code}
                      {issue.refKind ? ` · ${issue.refKind}` : ''}
                      {issue.refId ? ` ${issue.refId}` : ''}]
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <h4 className="flex items-center gap-2 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
            <CircleCheck className="size-4 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
            Comparability assertions ({parsed.length})
          </h4>
          {parsed.length === 0 ? (
            <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
              The backend returned no comparability assertions for this comparison.
            </span>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {parsed.map((a, i) => (
                <AssertionRow key={`${a.verdict}-${i}`} assertion={a} />
              ))}
            </ul>
          )}
          <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            These are the backend&apos;s own checks that the baseline and every candidate consumed an identical demand
            snapshot, core service and seed.
          </p>
        </div>
      </div>
    </div>
  );
}
