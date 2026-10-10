/**
 * Display formatters for the Surge Planner page.
 *
 * Two rules hold throughout:
 * - `null` / `undefined` renders as an em dash. A metric the backend could not
 *   compute is never shown as `0`.
 * - Instants are formatted in the **scenario's** `serviceTimezone`, which comes
 *   from the backend. There is no hardcoded service date, timezone or offset
 *   anywhere in this page.
 */

const num = new Intl.NumberFormat('en-US');
const num1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const moneyCache = new Map<string, Intl.NumberFormat>();

function money(currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}|${fractionDigits}`;
  let fmt = moneyCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    moneyCache.set(key, fmt);
  }
  return fmt;
}

/** The single no-data marker used everywhere on the page. */
export const NO_DATA = '—';

export function fmtNum(v: number | null | undefined): string {
  return v == null ? NO_DATA : num.format(Math.round(v));
}

export function fmtNum1(v: number | null | undefined): string {
  return v == null ? NO_DATA : num1.format(v);
}

export function fmtMin(v: number | null | undefined, digits = 1): string {
  return v == null ? NO_DATA : `${v.toFixed(digits)} min`;
}

/** Whole-unit money, e.g. `$528`. Currency comes from the backend, not a constant. */
export function fmtMoney(v: number | null | undefined, currency = 'USD'): string {
  return v == null ? NO_DATA : money(currency, 0).format(v);
}

/** Two-decimal money, for per-minute rates where cents matter. */
export function fmtMoney2(v: number | null | undefined, currency = 'USD'): string {
  return v == null ? NO_DATA : money(currency, 2).format(v);
}

export function fmtPct(v: number | null | undefined): string {
  return v == null ? NO_DATA : `${v.toFixed(1)}%`;
}

export function fmtSigned(v: number | null | undefined, digits = 0): string {
  if (v == null) return NO_DATA;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}`;
}

/** 0–1 heuristic weight. Not a probability — callers label it as such. */
export function fmtWeight(v: number | null | undefined): string {
  return v == null ? NO_DATA : v.toFixed(2);
}

// ---------------------------------------------------------------- time

/** Timezone-bound instant formatters. Build one per loaded scenario. */
export interface TimeFormat {
  /** IANA zone the scenario is operated in, e.g. `America/Chicago`. */
  timeZone: string;
  /** `8:45 AM` */
  clock(iso: string | null | undefined): string;
  /** `8a` on the hour, otherwise `8:45` — compact axis label. */
  clockShort(iso: string | null | undefined): string;
  /** `8:45 AM – 9:00 AM` */
  range(startIso: string | null | undefined, endIso: string | null | undefined): string;
  /** `Oct 13, 2026` */
  date(iso: string | null | undefined): string;
  /** `Oct 13, 2026, 5:30 AM CDT` */
  dateTime(iso: string | null | undefined): string;
  /** True when the instant falls exactly on the hour in this zone. */
  isOnTheHour(iso: string | null | undefined): boolean;
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function createTimeFormat(timeZone: string): TimeFormat {
  const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });

  function hourMinute(iso: string | null | undefined): { hour: number; minute: number; dayPeriod: string } | null {
    const d = parse(iso);
    if (!d) return null;
    let hour = 0;
    let minute = 0;
    let dayPeriod = '';
    for (const part of partsFmt.formatToParts(d)) {
      if (part.type === 'hour') hour = Number(part.value);
      else if (part.type === 'minute') minute = Number(part.value);
      else if (part.type === 'dayPeriod') dayPeriod = part.value;
    }
    return { hour, minute, dayPeriod };
  }

  return {
    timeZone,
    clock(iso) {
      const d = parse(iso);
      return d ? clockFmt.format(d) : NO_DATA;
    },
    clockShort(iso) {
      const hm = hourMinute(iso);
      if (!hm) return NO_DATA;
      const suffix = hm.dayPeriod.toLowerCase().startsWith('p') ? 'p' : 'a';
      return hm.minute === 0 ? `${hm.hour}${suffix}` : `${hm.hour}:${String(hm.minute).padStart(2, '0')}`;
    },
    range(startIso, endIso) {
      const a = parse(startIso);
      const b = parse(endIso);
      if (!a && !b) return NO_DATA;
      return `${a ? clockFmt.format(a) : NO_DATA} – ${b ? clockFmt.format(b) : NO_DATA}`;
    },
    date(iso) {
      const d = parse(iso);
      return d ? dateFmt.format(d) : NO_DATA;
    },
    dateTime(iso) {
      const d = parse(iso);
      return d ? dateTimeFmt.format(d) : NO_DATA;
    },
    isOnTheHour(iso) {
      const hm = hourMinute(iso);
      return hm != null && hm.minute === 0;
    },
  };
}

/** Whole minutes between two instants, or null if either is unparseable. */
export function minutesBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  const a = parse(startIso);
  const b = parse(endIso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 60000);
}
