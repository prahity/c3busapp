import React from 'react';
import { ArrowRight, BusFront, MoonStar } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { SimBusItinerary, SimItineraryTrip } from '../contracts/types';
import { NO_DATA, fmtMin, fmtMoney, fmtNum } from '../format';
import { useRunContext } from '../runContext';

interface ItineraryTableProps {
  /** `SimPlan.extraBusItineraries` for the selected allocation. */
  itineraries: SimBusItinerary[];
  /** `costConfig.currency`, so operating cost is labelled with the backend's currency. */
  currency: string;
}

/**
 * Per-bus daily itinerary from `SimPlan.extraBusItineraries`.
 *
 * Every row is a planned call the backend emitted: its stop, its arrive/depart
 * times in the scenario timezone, and its planned boardings and alightings. An
 * allocated bus the planner left idle is shown as such — that is a real result,
 * not a gap in the data.
 */
export default function ItineraryTable({ itineraries, currency }: ItineraryTableProps) {
  const { stopName, time } = useRunContext();

  if (itineraries.length === 0) {
    return (
      <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
        No extra buses are allocated at this setting, so the plan contains no supplemental itineraries. Move the
        allocation control to see them.
      </p>
    );
  }

  const tripWindow = (trip: SimItineraryTrip): string => {
    if (!trip.targetWindowStart && !trip.targetWindowEnd) return NO_DATA;
    return time.range(trip.targetWindowStart, trip.targetWindowEnd);
  };

  return (
    <div className="flex flex-col gap-4">
      {itineraries.map((bus) => (
        <article key={bus.busId} className="rounded-sm border border-[var(--c3-style-basic-border-weak)]">
          <header className="flex flex-wrap items-center gap-3 border-b border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-secondary)] px-4 py-3">
            <span className="flex items-center gap-2 text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              {bus.isIdle ? (
                <MoonStar className="size-4 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
              ) : (
                <BusFront className="size-4 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
              )}
              {bus.busLabel ?? bus.busId}
            </span>
            <Badge variant="soft" appearance={bus.isIdle ? 'secondary' : 'accent'} size="sm">
              {bus.isIdle ? 'Allocated · idle' : `${bus.trips.length} trip${bus.trips.length === 1 ? '' : 's'}`}
            </Badge>
            <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
              {fmtNum(bus.capacity)} seats · {fmtMin(bus.totalOperatingMinutes, 0)} operating ·{' '}
              {fmtMin(bus.totalDeadheadMinutes, 0)} deadhead · {fmtMin(bus.totalDwellMinutes, 0)} dwell ·{' '}
              {fmtMoney(bus.operatingCost, currency)}
            </span>
            {bus.explanation && (
              <span className="ml-auto max-w-xl text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                {bus.explanation}
              </span>
            )}
          </header>

          {bus.trips.length === 0 ? (
            <p className="px-4 py-3 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
              The planner allocated this bus but scheduled no trips for it.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--c3-style-basic-border-weak)]">
              {bus.trips.map((trip) => (
                <div key={trip.tripId} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">
                      Trip {trip.tripIndex + 1}
                    </span>
                    <span className="font-mono text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                      {trip.tripId}
                    </span>
                    {trip.targetStopId && (
                      <span className="flex items-center gap-1 text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                        targets {stopName(trip.targetStopId)}
                        {trip.targetDestinationStopId && (
                          <>
                            <ArrowRight className="size-3" aria-hidden />
                            {stopName(trip.targetDestinationStopId)}
                          </>
                        )}
                      </span>
                    )}
                    <Badge variant="outline" appearance="secondary" size="sm">
                      {tripWindow(trip)}
                    </Badge>
                    <span className="text-c3-regular-label-l3 tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                      expected {fmtNum(trip.expectedBoardings ?? null)} boardings ·{' '}
                      {trip.expectedWaitingMinutesSaved == null
                        ? `waiting saved ${NO_DATA}`
                        : `${fmtNum(trip.expectedWaitingMinutesSaved)} waiting min saved`}
                    </span>
                  </div>
                  {trip.explanation && (
                    <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">{trip.explanation}</p>
                  )}
                  {trip.stops.length === 0 ? (
                    <p className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
                      The backend returned no planned calls for this trip.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10 text-right">#</TableHead>
                            <TableHead>Stop</TableHead>
                            <TableHead>Arrive</TableHead>
                            <TableHead>Depart</TableHead>
                            <TableHead className="text-right">Board</TableHead>
                            <TableHead className="text-right">Alight</TableHead>
                            <TableHead>Leg</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trip.stops.map((call, i) => (
                            <TableRow key={`${trip.tripId}-${call.stopId}-${call.stopSequenceIndex}-${i}`}>
                              <TableCell className="text-right tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                                {call.stopSequenceIndex + 1}
                              </TableCell>
                              <TableCell className="font-medium text-[var(--c3-style-basic-fg-primary)]">
                                {stopName(call.stopId)}
                              </TableCell>
                              <TableCell className="tabular-nums">{time.clock(call.arrivalTime)}</TableCell>
                              <TableCell className="tabular-nums">{time.clock(call.departureTime)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {call.plannedBoardings > 0 ? fmtNum(call.plannedBoardings) : NO_DATA}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {call.plannedAlightings > 0 ? fmtNum(call.plannedAlightings) : NO_DATA}
                              </TableCell>
                              <TableCell>
                                {call.isDeadhead ? (
                                  <Badge variant="outline" appearance="secondary" size="sm">
                                    deadhead
                                  </Badge>
                                ) : call.plannedBoardings > 0 ? (
                                  <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                                    pick-up
                                  </span>
                                ) : call.plannedAlightings > 0 ? (
                                  <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                                    drop-off
                                  </span>
                                ) : (
                                  <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                                    pass
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
