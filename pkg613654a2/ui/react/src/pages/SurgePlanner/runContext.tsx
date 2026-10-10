import React, { createContext, useContext, useMemo } from 'react';

import { buildStopNames } from './api';
import type { SimStop, SimStopWindowDelay, StopId } from './contracts/types';
import { createTimeFormat, type TimeFormat } from './format';

/**
 * Per-run presentation context: the stop-name registry and the timezone-bound
 * time formatters.
 *
 * Both are properties of the **loaded run**, not of the page. The old mockup
 * resolved stop names from a fictional lookup table and formatted times against
 * a hardcoded service date and offset; both now come from the backend response,
 * so every panel below the provider reads the same scenario's names and clock.
 */
interface RunContextValue {
  /** Display name for a stop id. Falls back to the raw id for unknown stops. */
  stopName(id: StopId | null | undefined): string;
  time: TimeFormat;
}

const FALLBACK: RunContextValue = {
  stopName: (id) => id ?? '—',
  time: createTimeFormat('UTC'),
};

const RunContext = createContext<RunContextValue>(FALLBACK);

interface RunContextProviderProps {
  /** `comparison.input.serviceTimezone` — the scenario's IANA zone. */
  timeZone: string;
  /** `comparison.input.coreService.stops` — authoritative names and geography. */
  stops: SimStop[];
  /** Delay rows, which carry `stopName` for stops the core service omits. */
  delaySets: SimStopWindowDelay[][];
  children: React.ReactNode;
}

export function RunContextProvider({ timeZone, stops, delaySets, children }: RunContextProviderProps) {
  const value = useMemo<RunContextValue>(() => {
    const names = buildStopNames(stops, ...delaySets);
    return {
      stopName: (id) => (id ? (names.get(id) ?? id) : '—'),
      time: createTimeFormat(timeZone),
    };
  }, [timeZone, stops, delaySets]);

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRunContext(): RunContextValue {
  return useContext(RunContext);
}
