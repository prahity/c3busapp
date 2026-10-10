import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { c3Action, c3CreateAction } from '@/c3Action';
import { CampusEvent, CampusEventCategory, CampusEventStatus, CampusVenue } from '@/Interfaces';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const CATEGORIES: CampusEventCategory[] = [
  'Sports',
  'Concert',
  'Academic',
  'Conference',
  'Social',
  'Arts',
  'Other',
];

const STATUSES: CampusEventStatus[] = ['Scheduled', 'Cancelled', 'Completed'];

const selectClass =
  'flex h-[var(--c3-style-height-h-32)] w-full rounded-[var(--c3-style-border-radius-4)] ' +
  'border border-solid border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] ' +
  'px-3 font-sans text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)] outline-none ' +
  'focus-visible:shadow-[0_0_0_2px_var(--c3-style-shadow-ring-accent)]';

const labelClass = 'text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]';

interface FormState {
  name: string;
  category: '' | CampusEventCategory;
  status: CampusEventStatus;
  venueId: string;
  locationName: string;
  startTime: string;
  endTime: string;
  expectedAttendance: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  category: '',
  status: 'Scheduled',
  venueId: '',
  locationName: '',
  startTime: '',
  endTime: '',
  expectedAttendance: '',
  description: '',
};

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Standalone manual event-entry page. Collects the fields the bus-route optimizer needs —
 * timing, location, and approximate attendance — and persists a {@link CampusEvent} tagged
 * `source = 'Manual'` via `c3CreateAction`, then returns to the Bus Planning dashboard.
 */
const ManualEntry: React.FC = () => {
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();
  const [venues, setVenues] = useState<CampusVenue[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await c3Action('CampusVenue', 'fetch', { limit: 200, offset: 0, order: 'name' });
        if (!cancelled) setVenues((res?.objs ?? []) as CampusVenue[]);
      } catch (err) {
        if (!cancelled) reportError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const canSubmit = useMemo(
    () => form.name.trim().length > 0 && form.startTime.length > 0 && !submitting,
    [form.name, form.startTime, submitting],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      try {
        const spec: Partial<CampusEvent> & Record<string, unknown> = {
          name: form.name.trim(),
          startTime: toIso(form.startTime) as string,
          source: 'Manual',
          status: form.status,
        };
        if (form.description.trim()) spec.description = form.description.trim();
        const endIso = toIso(form.endTime);
        if (endIso) spec.endTime = endIso;
        if (form.category) spec.category = form.category;
        if (form.venueId) spec.venue = { id: form.venueId } as CampusVenue;
        if (form.locationName.trim()) spec.locationName = form.locationName.trim();
        const attendance = Number(form.expectedAttendance);
        if (form.expectedAttendance && !Number.isNaN(attendance)) {
          spec.expectedAttendance = attendance;
        }

        await c3CreateAction('CampusEvent', 'create', spec);
        navigate('/busplanning');
      } catch (err) {
        reportError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, form, navigate, reportError],
  );

  return (
    <div className="flex min-h-full w-full flex-col gap-6 bg-[var(--c3-style-basic-bg-page)] px-6 py-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          appearance="secondary"
          size="sm"
          className="self-start"
          leadingIcon={<ArrowLeft />}
          onClick={() => navigate('/busplanning')}
        >
          Back to Bus Planning
        </Button>
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Add a campus event</h1>
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          Enter an event manually. Timing, location, and expected attendance feed the bus-route optimizer.
        </p>
      </div>

      <div className="w-full max-w-3xl rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="evt-name" className={labelClass}>
              Event name *
            </label>
            <Input
              id="evt-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Illinois Football vs. Michigan"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evt-start" className={labelClass}>
                Starts *
              </label>
              <Input
                id="evt-start"
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => update('startTime', e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evt-end" className={labelClass}>
                Ends
              </label>
              <Input
                id="evt-end"
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => update('endTime', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evt-category" className={labelClass}>
                Category
              </label>
              <select
                id="evt-category"
                className={selectClass}
                value={form.category}
                onChange={(e) => update('category', e.target.value as FormState['category'])}
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evt-status" className={labelClass}>
                Status
              </label>
              <select
                id="evt-status"
                className={selectClass}
                value={form.status}
                onChange={(e) => update('status', e.target.value as CampusEventStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evt-venue" className={labelClass}>
                Venue
              </label>
              <select
                id="evt-venue"
                className={selectClass}
                value={form.venueId}
                onChange={(e) => update('venueId', e.target.value)}
              >
                <option value="">No known venue</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evt-attendance" className={labelClass}>
                Expected attendance
              </label>
              <Input
                id="evt-attendance"
                type="number"
                min={0}
                value={form.expectedAttendance}
                onChange={(e) => update('expectedAttendance', e.target.value)}
                placeholder="e.g. 15000"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="evt-location" className={labelClass}>
              Location (if not a known venue)
            </label>
            <Input
              id="evt-location"
              value={form.locationName}
              onChange={(e) => update('locationName', e.target.value)}
              placeholder="e.g. Main Quad"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="evt-description" className={labelClass}>
              Description
            </label>
            <Textarea
              id="evt-description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Optional notes about the event"
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button type="submit" disabled={!canSubmit} loading={submitting}>
              Save event
            </Button>
            <Button
              type="button"
              variant="ghost"
              appearance="secondary"
              onClick={() => navigate('/busplanning')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualEntry;
