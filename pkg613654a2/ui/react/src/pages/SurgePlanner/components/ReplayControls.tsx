/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React, { useCallback } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { TimeFormat } from '../format';
import type { ReplayClock } from '../useReplayClock';

interface ReplayControlsProps {
  clock: ReplayClock;
  /** `comparison.input.horizonStart` — ISO instant for `t = 0`. */
  horizonStart: string;
  /** `comparison.input.horizonEnd` — ISO instant for `t = 1`. */
  horizonEnd: string;
  /** Scenario-bound formatter, so the readout is in the service timezone. */
  time: TimeFormat;
}

const SPEEDS = [0.5, 1, 2] as const;

/** ISO instant at fraction `t` of the horizon, for the live clock readout. */
function instantAt(startIso: string, endIso: string, t: number): string | null {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return new Date(a + (b - a) * t).toISOString();
}

/**
 * Shared replay control for the comparison maps.
 *
 * The single slider + play/pause/speed buttons drive one {@link ReplayClock},
 * which both the baseline and candidate maps read — so scrubbing moves the buses
 * on both maps in lockstep. The timeline is labelled from the loaded scenario's
 * own horizon, formatted in its service timezone.
 */
export default function ReplayControls({ clock, horizonStart, horizonEnd, time }: ReplayControlsProps) {
  const { t, setT, playing, setPlaying, speed, setSpeed } = clock;

  const onScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setT(Number(e.target.value) / 1000);
    },
    [setT],
  );

  const liveClock = time.clock(instantAt(horizonStart, horizonEnd, t));

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-secondary)] p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <Button
          variant="solid"
          appearance="accent"
          size="sm"
          onClick={() => setPlaying(!playing)}
          leadingIcon={playing ? <Pause /> : <Play />}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="ghost"
          appearance="secondary"
          size="sm"
          onClick={() => setT(0)}
          leadingIcon={<RotateCcw />}
          aria-label="Restart replay"
        >
          Restart
        </Button>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span className="shrink-0 text-c3-regular-label-l3 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
          {time.clock(horizonStart)}
        </span>
        <input
          id="sim-replay-slider"
          type="range"
          min={0}
          max={1000}
          value={Math.round(t * 1000)}
          onChange={onScrub}
          aria-label="Replay position"
          className="h-1.5 flex-1 cursor-pointer accent-[var(--c3-style-basic-fg-accent)]"
        />
        <span className="shrink-0 text-c3-regular-label-l3 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
          {time.clock(horizonEnd)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="min-w-[76px] text-center text-c3-bold-label-l2 tabular-nums text-[var(--c3-style-basic-fg-accent)]">
          {liveClock}
        </span>
        <div className="flex overflow-hidden rounded-sm border border-[var(--c3-style-basic-border-weak)]">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={
                speed === s
                  ? 'bg-[var(--c3-style-basic-fg-accent)] px-2.5 py-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-inverse)]'
                  : 'bg-[var(--c3-style-basic-bg-card)] px-2.5 py-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)] hover:bg-[var(--c3-style-basic-bg-secondary)]'
              }
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
