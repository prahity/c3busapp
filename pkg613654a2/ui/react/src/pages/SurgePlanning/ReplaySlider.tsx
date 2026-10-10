/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React, { useCallback } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Playback } from './usePlayback';

interface ReplaySliderProps {
  playback: Playback;
  /** Clock label for the start of the simulated window, e.g. "6:00 PM". */
  startClock: string;
  /** Clock label for the end of the simulated window, e.g. "8:00 PM". */
  endClock: string;
}

const SPEEDS = [0.5, 1, 2] as const;

/** Interpolate a wall-clock label from the two window endpoints and `t`. */
function clockAt(startClock: string, endClock: string, t: number): string {
  const start = parseClock(startClock);
  const end = parseClock(endClock);
  if (start == null || end == null) return '';
  const minutes = Math.round(start + (end - start) * t);
  return formatClock(minutes);
}

function parseClock(label: string): number | null {
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(match[2]);
}

function formatClock(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(m / 60);
  const minute = m % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Shared replay control. The single slider + play/pause/speed controls drive
 * one {@link Playback} clock, which both route maps read — so scrubbing the
 * slider moves the buses on the old and new maps in lockstep.
 */
export default function ReplaySlider({ playback, startClock, endClock }: ReplaySliderProps) {
  const { t, setT, playing, setPlaying, speed, setSpeed } = playback;

  const onScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setT(Number(e.target.value) / 1000);
    },
    [setT],
  );

  return (
    <div className="flex flex-col gap-3 rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <Button
          variant="solid"
          appearance="accent"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause replay' : 'Play replay'}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          <span className="ml-1">{playing ? 'Pause' : 'Play'}</span>
        </Button>
        <Button
          variant="ghost"
          appearance="secondary"
          onClick={() => {
            setT(0);
          }}
          aria-label="Restart replay"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span className="w-20 shrink-0 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
          {startClock}
        </span>
        <input
          id="surge-replay-slider"
          type="range"
          min={0}
          max={1000}
          value={Math.round(t * 1000)}
          onChange={onScrub}
          aria-label="Replay position"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--c3-style-basic-bg-secondary)] accent-[var(--c3-style-basic-bg-accent-inverse)]"
        />
        <span className="w-20 shrink-0 text-right text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
          {endClock}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="min-w-[88px] text-center text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
          {clockAt(startClock, endClock, t)}
        </span>
        <div className="flex overflow-hidden rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)]">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 text-c3-regular-label-l3 transition-colors ${
                speed === s
                  ? 'bg-[var(--c3-style-basic-bg-accent-inverse)] text-[var(--c3-style-basic-fg-inverse)]'
                  : 'bg-[var(--c3-style-basic-bg-primary)] text-[var(--c3-style-basic-fg-secondary)] hover:bg-[var(--c3-style-basic-bg-secondary)]'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
