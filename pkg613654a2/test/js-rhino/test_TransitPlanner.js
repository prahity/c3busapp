/**
 * Unit tests for TransitPlanner.planDay — the event-transit day planner engine.
 *
 * These use the small fixed test networks required by the planner spec (fixtures only, never used
 * at runtime): a direct trip, a transfer, a same-block continuation, a bus over capacity, a closed
 * segment, a supplemental bus created for overflow, and an extra bus reused across two intervals.
 * planDay is a pure static method over the json segment-table + demand contract, so no entities or
 * TestApi context are required.
 */
const filename = 'test_TransitPlanner';

describe(filename, function () {
  describe('TransitPlanner', function () {
    describe('#planDay', function () {
      // ---- Fixture 1: a direct trip --------------------------------------------------------
      describe('a direct trip', function () {
        beforeAll(function () {
          this.out = TransitPlanner.planDay({
            segmentTable: {
              A: {
                VENUE: [
                  {
                    route_id: 'R1',
                    block_id: 'B1',
                    departure_times: [28800, 29100, 29400],
                    arrivals: [
                      ['t1|A:1|VENUE:5', 29400],
                      ['t2|A:1|VENUE:5', 29700],
                      ['t3|A:1|VENUE:5', 30000],
                    ],
                  },
                ],
              },
            },
            demand: [
              { id: 'd1', direction: 'to', origin: 'A', destination: 'VENUE', riders: 50, earliestDeparture: 28000, deadline: 30600 },
            ],
            capacities: { default: { seated: 36, total: 60 } },
            backgroundRidership: { R1: 5 },
          });
        });

        it('serves every rider on the direct route', function () {
          expect(this.out.assignments[0].served).toBe(50);
        });

        it('uses a zero-transfer journey', function () {
          expect(this.out.riderView[0].transfers).toBe(0);
        });

        it('marks the trip as standing when loaded past seated capacity', function () {
          expect(this.out.riderView[0].crowding).toBe('standing');
        });

        it('leaves nobody unserved', function () {
          expect(this.out.unserved.length).toBe(0);
        });

        it('flags one crowding hotspot in the MTD view', function () {
          expect(this.out.mtdView.crowdingHotspots.length).toBe(1);
        });
      });

      // ---- Fixture 2: a transfer -----------------------------------------------------------
      describe('a transfer between two routes', function () {
        beforeAll(function () {
          this.out = TransitPlanner.planDay({
            segmentTable: {
              A: { B: [{ route_id: 'R1', block_id: 'B1', departure_times: [28800], arrivals: [['s1|A|B', 29100]] }] },
              B: { VENUE: [{ route_id: 'R2', block_id: 'B2', departure_times: [29400], arrivals: [['s2|B|VENUE', 29700]] }] },
            },
            demand: [
              { id: 't', direction: 'to', origin: 'A', destination: 'VENUE', riders: 10, earliestDeparture: 28000, deadline: 30600 },
            ],
            capacities: { default: { seated: 36, total: 60 } },
          });
        });

        it('counts exactly one transfer', function () {
          expect(this.out.riderView[0].transfers).toBe(1);
        });

        it('chains two ride legs', function () {
          expect(this.out.assignments[0].options[0].legs.length).toBe(2);
        });

        it('arrives on the second route', function () {
          expect(this.out.riderView[0].arrival).toBe('08:15:00');
        });
      });

      // ---- Fixture 3: a same-block continuation --------------------------------------------
      describe('a same-block continuation', function () {
        beforeAll(function () {
          this.out = TransitPlanner.planDay({
            segmentTable: {
              A: { B: [{ route_id: 'R1', block_id: 'B1', departure_times: [28800], arrivals: [['s1|A|B', 29100]] }] },
              B: { VENUE: [{ route_id: 'R1', block_id: 'B1', departure_times: [29100], arrivals: [['s2|B|VENUE', 29400]] }] },
            },
            demand: [
              { id: 'sb', direction: 'to', origin: 'A', destination: 'VENUE', riders: 10, earliestDeparture: 28000, deadline: 30600 },
            ],
            capacities: { default: { seated: 36, total: 60 } },
          });
        });

        it('is not counted as a transfer when staying on the same block', function () {
          expect(this.out.riderView[0].transfers).toBe(0);
        });

        it('still traverses both legs of the block', function () {
          expect(this.out.assignments[0].options[0].legs.length).toBe(2);
        });

        it('arrives at the continued end stop', function () {
          expect(this.out.riderView[0].arrival).toBe('08:10:00');
        });
      });

      // ---- Fixture 4: a bus over capacity --------------------------------------------------
      describe('demand that exceeds core capacity with no extra buses', function () {
        beforeAll(function () {
          this.out = TransitPlanner.planDay({
            segmentTable: {
              A: {
                VENUE: [
                  {
                    route_id: 'R1',
                    block_id: 'B1',
                    departure_times: [28800, 29400],
                    arrivals: [
                      ['c1|A|VENUE', 29400],
                      ['c2|A|VENUE', 30000],
                    ],
                  },
                ],
              },
            },
            demand: [
              { id: 'oc', direction: 'to', origin: 'A', destination: 'VENUE', riders: 150, earliestDeparture: 28000, deadline: 30600 },
            ],
            capacities: { default: { seated: 36, total: 60 } },
          });
        });

        it('fills both trips to total capacity (60 + 60)', function () {
          expect(this.out.assignments[0].served).toBe(120);
        });

        it('reports the overflow as unserved riders', function () {
          expect(this.out.unserved[0].riders).toBe(30);
        });
      });

      // ---- Fixture 5: a closed segment -----------------------------------------------------
      describe('a closed segment', function () {
        beforeAll(function () {
          this.out = TransitPlanner.planDay({
            segmentTable: {
              A: { VENUE: [{ route_id: 'R1', block_id: 'B1', departure_times: [28800], arrivals: [['x1|A|VENUE', 29400]] }] },
            },
            demand: [
              { id: 'cl', direction: 'to', origin: 'A', destination: 'VENUE', riders: 10, earliestDeparture: 28000, deadline: 30600 },
            ],
            operationalEvents: [{ window: [0, 86400], closedSegments: ['x1|A|VENUE'] }],
            capacities: { default: { seated: 36, total: 60 } },
          });
        });

        it('removes the closed segment from the usable network', function () {
          expect(this.out.diagnostics.trips).toBe(0);
        });

        it('reports the stranded riders as having no feasible route', function () {
          expect(this.out.unserved[0].reason).toBe('no feasible route');
        });
      });

      // ---- Fixture 6: a supplemental bus created for overflow ------------------------------
      describe('a supplemental bus created for overflow', function () {
        beforeAll(function () {
          this.out = TransitPlanner.planDay({
            segmentTable: {
              A: { VENUE: [{ route_id: 'R1', block_id: 'B1', departure_times: [28800], arrivals: [['p1|A|VENUE', 29400]] }] },
            },
            demand: [
              { id: 'sp', direction: 'to', origin: 'A', destination: 'VENUE', riders: 100, earliestDeparture: 28000, deadline: 30600 },
            ],
            capacities: { default: { seated: 36, total: 60 } },
            extraBuses: [{ id: 'EX1', seated: 40, total: 50, startLocation: 'A', availableFrom: 0, availableUntil: 86400 }],
          });
        });

        it('plans exactly one supplemental trip', function () {
          expect(this.out.supplemental.length).toBe(1);
        });

        it('runs that supplemental trip on the available extra bus', function () {
          expect(this.out.supplemental[0].busId).toBe('EX1');
        });

        it('moves the overflow onto the supplemental bus', function () {
          expect(this.out.supplemental[0].ridersAssigned).toBe(40);
        });

        it('leaves nobody unserved once supplemented', function () {
          expect(this.out.unserved.length).toBe(0);
        });
      });

      // ---- Fixture 7: an extra bus reused across two intervals ------------------------------
      describe('an extra bus reused across two intervals', function () {
        beforeAll(function () {
          this.out = TransitPlanner.planDay({
            segmentTable: {
              A: {
                VENUE: [
                  {
                    route_id: 'R1',
                    block_id: 'B1',
                    departure_times: [28800, 36000],
                    arrivals: [
                      ['r1|A|VENUE', 29400],
                      ['r2|A|VENUE', 36600],
                    ],
                  },
                ],
              },
            },
            demand: [
              { id: 'm1', direction: 'to', origin: 'A', destination: 'VENUE', riders: 40, earliestDeparture: 28000, deadline: 30600 },
              { id: 'm2', direction: 'to', origin: 'A', destination: 'VENUE', riders: 40, earliestDeparture: 35000, deadline: 38600 },
            ],
            capacities: { byRoute: { R1: { seated: 15, total: 20 } }, default: { seated: 36, total: 60 } },
            walkTimes: { 'VENUE->A': 300 },
            extraBuses: [{ id: 'EX9', seated: 40, total: 50, startLocation: 'A', availableFrom: 0, availableUntil: 86400 }],
          });
        });

        it('creates one supplemental trip per overflowing interval', function () {
          expect(this.out.supplemental.length).toBe(2);
        });

        it('reuses the same extra bus for both intervals', function () {
          expect(this.out.supplemental[0].busId === 'EX9' && this.out.supplemental[1].busId === 'EX9').toBe(true);
        });

        it('serves both intervals in chronological order', function () {
          expect(this.out.supplemental[0].departureSec < this.out.supplemental[1].departureSec).toBe(true);
        });

        it('leaves nobody unserved across both intervals', function () {
          expect(this.out.unserved.length).toBe(0);
        });
      });
    });
  });
});
