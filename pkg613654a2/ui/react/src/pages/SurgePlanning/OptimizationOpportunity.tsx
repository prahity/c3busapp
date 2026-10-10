/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Badge, type BadgeAppearance } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import RouteSchematic from './RouteSchematic';
import type { OptimizationOpportunity as Opportunity } from './surgeData';

const SEVERITY_APPEARANCE: Record<Opportunity['severity'], BadgeAppearance> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

/** One optimization opportunity: before/after schematics + stat lists. */
export default function OptimizationOpportunity({ opportunity }: { opportunity: Opportunity }) {
  const { title, description, severity, before, after } = opportunity;

  return (
    <Card variant="outlined" className="gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">{title}</h3>
          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">{description}</p>
        </div>
        <Badge variant="soft" appearance={SEVERITY_APPEARANCE[severity]} className="shrink-0 capitalize">
          {severity}
        </Badge>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
        <Side label={before.statLabel} stats={before.stats}>
          <RouteSchematic schematic={before.schematic} title={`${title} — before`} />
        </Side>

        <div className="flex items-center justify-center">
          <div className="flex size-8 items-center justify-center rounded-full bg-[var(--c3-style-basic-bg-accent)] text-[var(--c3-style-basic-fg-accent)]">
            <ArrowRight className="size-4" />
          </div>
        </div>

        <Side label={after.statLabel} stats={after.stats} highlight>
          <RouteSchematic schematic={after.schematic} title={`${title} — after`} />
        </Side>
      </div>
    </Card>
  );
}

function Side({
  label,
  stats,
  highlight = false,
  children,
}: {
  label: string;
  stats: string[];
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className={`text-c3-bold-label-l3 ${
          highlight ? 'text-[var(--c3-style-basic-fg-success)]' : 'text-[var(--c3-style-basic-fg-secondary)]'
        }`}
      >
        {label}
      </span>
      {children}
      <ul className="flex flex-col gap-1">
        {stats.map((s) => (
          <li key={s} className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-primary)]">
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
