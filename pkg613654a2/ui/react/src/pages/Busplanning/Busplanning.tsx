import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bus, CalendarClock, GitMerge, Plus } from 'lucide-react';

import { RouteMap } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import CollectionPanel from './CollectionPanel';
import ResolvedPanel from './ResolvedPanel';
import TransitPanel from './TransitPanel';

/**
 * Bus-planning workspace. A single page with three tabs:
 *   • Collection — scrape/add campus events (demand observations).
 *   • Resolve & plan — dedup/merge/score events, then generate a bus route per event.
 *   • Transit routes — pull CUMTD baseline routes used by the route planner.
 *
 * The CUMTD baseline-route map loaded in the Transit tab is held here and shared with the
 * route planner in the Resolve tab, so a generated route can be compared against current routes.
 */
const Busplanning: React.FC = () => {
  const [baseline, setBaseline] = useState<RouteMap | null>(null);

  return (
    <div className="flex min-h-full w-full flex-col gap-6 bg-[var(--c3-style-basic-bg-page)] px-6 py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Bus Planning</h1>
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
            Collect UIUC campus events, resolve them into canonical demand, and plan the bus routes that service them.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/events/new">
            <Plus className="size-4" aria-hidden />
            Add event
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="collection" variant="bordered">
        <TabsList>
          <TabsTrigger value="collection">
            <CalendarClock className="size-4" aria-hidden />
            Collection
          </TabsTrigger>
          <TabsTrigger value="resolve">
            <GitMerge className="size-4" aria-hidden />
            Resolve &amp; plan
          </TabsTrigger>
          <TabsTrigger value="transit">
            <Bus className="size-4" aria-hidden />
            Transit routes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="collection" className="pt-6">
          <CollectionPanel />
        </TabsContent>
        <TabsContent value="resolve" className="pt-6">
          <ResolvedPanel baseline={baseline} />
        </TabsContent>
        <TabsContent value="transit" className="pt-6">
          <TransitPanel baseline={baseline} onBaselineChange={setBaseline} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Busplanning;
