import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  DownloadCloud,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';

import { c3Action } from '@/c3Action';
import { CampusEvent, CampusEventCategory, CampusEventSource } from '@/Interfaces';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MetricCard,
  MetricCardCaption,
  MetricCardHeader,
  MetricCardLabel,
  MetricCardValue,
} from '@/components/ui/metric-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';

type BadgeAppearance = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const CATEGORY_APPEARANCE: Record<CampusEventCategory, BadgeAppearance> = {
  Sports: 'danger',
  Concert: 'accent',
  Academic: 'info',
  Conference: 'primary',
  Social: 'success',
  Arts: 'warning',
  Other: 'secondary',
};

const SOURCE_APPEARANCE: Record<CampusEventSource, BadgeAppearance> = {
  Manual: 'secondary',
  Scraped: 'info',
};

const numberFmt = new Intl.NumberFormat('en-US');

// Hard safety cap on how many events we will ever fetch/scrape into the preview at once.
const HARD_CAP = 500;

/** Local calendar date (yyyy-MM-dd), avoiding the UTC drift of toISOString(). */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return '—';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '—';
  const mins = Math.round((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

interface ScrapeSummary {
  scraped: number;
  saved: number;
  skipped: number;
  errors?: { message?: string }[];
}

const CollectionPanel: React.FC = () => {
  const { reportError } = useErrorBoundary();
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scraping, setScraping] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // "Show K events" — bounds both the scrape cap and the number of rows fetched/displayed.
  const [limitK, setLimitK] = useState<number>(50);
  // Custom range pickers default to the current week (today → +6 days).
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState<string>(localYmd(today));
  const [endDate, setEndDate] = useState<string>(localYmd(addDays(today, 6)));

  const clampK = useCallback((k: number): number => {
    if (!Number.isFinite(k) || k <= 0) return 50;
    return Math.min(Math.floor(k), HARD_CAP);
  }, []);

  const fetchEvents = useCallback(
    async (k: number): Promise<CampusEvent[]> => {
      const res = await c3Action('CampusEvent', 'fetch', {
        limit: clampK(k),
        offset: 0,
        order: 'startTime',
        include: 'this, venue.id, venue.name, venue.capacity, venue.venueType',
      });
      return (res?.objs ?? []) as CampusEvent[];
    },
    [clampK],
  );

  // Initial load (mount only; later reloads go through refresh/scrape handlers).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const objs = await fetchEvents(50);
        if (!cancelled) setEvents(objs);
      } catch (err) {
        if (!cancelled) reportError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const objs = await fetchEvents(limitK);
      setEvents(objs);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }, [fetchEvents, limitK, reportError]);

  const runScrape = useCallback(
    async (start: string, end: string, label: string) => {
      setScraping(true);
      setStatusMsg(null);
      try {
        const k = clampK(limitK);
        const summary = (await c3Action('UiucEventScraper', 'scrapeRange', [start, end, k])) as ScrapeSummary;
        const errCount = summary?.errors?.length ?? 0;
        setStatusMsg(
          `${label}: saved ${numberFmt.format(summary?.saved ?? 0)} event(s) ` +
            `(scanned ${numberFmt.format(summary?.scraped ?? 0)}, skipped ${numberFmt.format(summary?.skipped ?? 0)}` +
            (errCount ? `, ${errCount} error(s)` : '') +
            ').',
        );
        const objs = await fetchEvents(k);
        setEvents(objs);
      } catch (err) {
        reportError(err);
      } finally {
        setScraping(false);
      }
    },
    [clampK, limitK, fetchEvents, reportError],
  );

  const scrapeNextDay = useCallback(() => {
    const tomorrow = localYmd(addDays(new Date(), 1));
    void runScrape(tomorrow, tomorrow, 'Next day');
  }, [runScrape]);

  const scrapeThisWeek = useCallback(() => {
    const now = new Date();
    void runScrape(localYmd(now), localYmd(addDays(now, 6)), 'This week');
  }, [runScrape]);

  const scrapeCustomRange = useCallback(() => {
    void runScrape(startDate, endDate, `Range ${startDate} → ${endDate}`);
  }, [runScrape, startDate, endDate]);

  const stats = useMemo(() => {
    const totalAttendance = events.reduce((sum, e) => sum + (e.expectedAttendance ?? 0), 0);
    const peak = events.reduce<CampusEvent | null>(
      (best, e) => (!best || (e.expectedAttendance ?? 0) > (best.expectedAttendance ?? 0) ? e : best),
      null,
    );
    return {
      count: events.length,
      totalAttendance,
      peak,
    };
  }, [events]);

  const busy = loading || scraping;

  return (
    <div className="flex flex-col gap-6">
      {/* Scrape controls */}
      <div className="flex flex-col gap-4 rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">Scrape the UIUC calendar</h2>
          <p className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Pull events from the public campus iCalendar feed and upsert them as scraped records.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Quick scrape</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" appearance="accent" disabled={busy} leadingIcon={<CalendarPlus />} onClick={scrapeNextDay}>
                Next day
              </Button>
              <Button variant="soft" appearance="accent" disabled={busy} leadingIcon={<CalendarRange />} onClick={scrapeThisWeek}>
                This week
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrape-start">Start date</Label>
            <Input
              id="scrape-start"
              type="date"
              value={startDate}
              disabled={busy}
              className="w-[9.5rem]"
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrape-end">End date</Label>
            <Input
              id="scrape-end"
              type="date"
              value={endDate}
              disabled={busy}
              className="w-[9.5rem]"
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrape-limit">Show K events</Label>
            <Input
              id="scrape-limit"
              type="number"
              min={1}
              max={HARD_CAP}
              value={limitK}
              disabled={busy}
              className="w-[7rem]"
              onChange={(e) => setLimitK(clampK(Number(e.target.value)))}
            />
          </div>
          <Button appearance="accent" disabled={busy} loading={scraping} leadingIcon={<DownloadCloud />} onClick={scrapeCustomRange}>
            Scrape range
          </Button>
          <Button variant="outline" appearance="secondary" disabled={busy} leadingIcon={<RefreshCw />} onClick={() => void reload()}>
            Refresh
          </Button>
        </div>

        {statusMsg && (
          <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-success)]">{statusMsg}</p>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard>
              <MetricCardHeader>
                <CalendarClock className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Events shown</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{numberFmt.format(stats.count)}</MetricCardValue>
              <MetricCardCaption>Up to K from the campus calendar</MetricCardCaption>
            </MetricCard>

            <MetricCard>
              <MetricCardHeader>
                <Users className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Expected attendance</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>{numberFmt.format(stats.totalAttendance)}</MetricCardValue>
              <MetricCardCaption>Sum of reported attendance (blank where unknown)</MetricCardCaption>
            </MetricCard>

            <MetricCard>
              <MetricCardHeader>
                <TrendingUp className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
                <MetricCardLabel>Peak event</MetricCardLabel>
              </MetricCardHeader>
              <MetricCardValue>
                {stats.peak ? numberFmt.format(stats.peak.expectedAttendance ?? 0) : '—'}
              </MetricCardValue>
              <MetricCardCaption>{stats.peak ? stats.peak.name : 'No events'}</MetricCardCaption>
            </MetricCard>
          </div>

          {/* Events table */}
          <div className="rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4">
            <h2 className="mb-4 text-c3-bold-body-p1 text-[var(--c3-style-basic-fg-primary)]">Event schedule</h2>
            {events.length === 0 ? (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                No campus events found. Scrape the calendar above or add one manually.
              </p>
            ) : (
              <Table hover>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Expected attendance</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium text-[var(--c3-style-basic-fg-primary)]">{e.name}</TableCell>
                      <TableCell>
                        {e.category ? (
                          <Badge variant="soft" appearance={CATEGORY_APPEARANCE[e.category]}>
                            {e.category}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{e.venue?.name ?? e.locationName ?? '—'}</TableCell>
                      <TableCell>{formatDateTime(e.startTime)}</TableCell>
                      <TableCell>{formatDuration(e.startTime, e.endTime)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.expectedAttendance != null ? numberFmt.format(e.expectedAttendance) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="soft" appearance={SOURCE_APPEARANCE[e.source]}>
                          {e.source}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CollectionPanel;
