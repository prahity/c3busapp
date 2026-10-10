/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Playback state shared by both route maps and the replay slider. */
export interface Playback {
  /** Normalized position in the loop, `0..1`. */
  t: number;
  /** Jump to a specific position (used by the slider). */
  setT: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  /** Speed multiplier (0.5× / 1× / 2× …). */
  speed: number;
  setSpeed: (s: number) => void;
}

interface Options {
  /** Real seconds for one full loop at 1× speed. */
  loopSeconds?: number;
}

/**
 * Drives a single normalized clock `t ∈ [0, 1)` with `requestAnimationFrame`.
 *
 * This is a pure in-memory animation (no data fetching), so it is safe to run
 * at frame rate. The loop is paused when `playing` is false, and the rAF handle
 * is always cancelled on unmount / dependency change.
 */
export function usePlayback({ loopSeconds = 24 }: Options = {}): Playback {
  const [t, setTState] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const setT = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    setTState(clamped >= 1 ? 0 : clamped);
  }, []);

  useEffect(() => {
    if (!playing) {
      lastRef.current = null;
      return;
    }

    const step = (ts: number) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dtSec = (ts - lastRef.current) / 1000;
      lastRef.current = ts;

      setTState((prev) => {
        const next = prev + (dtSec * speed) / loopSeconds;
        return next >= 1 ? next - 1 : next;
      });

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, [playing, speed, loopSeconds]);

  return { t, setT, playing, setPlaying, speed, setSpeed };
}
