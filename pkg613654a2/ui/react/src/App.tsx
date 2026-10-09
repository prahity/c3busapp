/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard/Dashboard';
import SideNav from './components/SideNav/SideNav';
import TopNav from './components/TopNav/TopNav';
import ErrorReporterProvider from './components/ErrorBoundary/ErrorBoundary';

/**
 * Application shell.
 *
 * The chrome — {@link TopNav} across the top and {@link SideNav} down the left —
 * is rendered here, OUTSIDE `<Routes>`, so it is present on **every** page. The
 * router only ever swaps the `<main>` content; the top bar and side nav are part
 * of the shell and cannot be dropped by an individual page. Per the C3 Design
 * System, the TopNavBar is expected on every screen — keep it mounted here and
 * do not move it inside a route.
 */
export default function App() {
  return (
    <ErrorReporterProvider>
      <div className="h-screen flex flex-col max-w-full overflow-hidden">
        <TopNav title="Application Name" />
        <div className="flex flex-1 min-h-0">
          <SideNav />
          <div className="flex-1 flex flex-col min-w-0">
            <main className="flex-1 overflow-auto bg-[var(--c3-style-basic-bg-page)]">
              <Routes>
                {/* Add page routes here */}
                <Route path="/" element={<Dashboard />} />
                <Route
                  path="*"
                  element={
                    import.meta.env.MODE === 'development' ? (
                      <div className="flex h-full items-center justify-center p-8 text-center text-[var(--c3-style-basic-fg-neutral)]">
                        <p>No route matched. Add routes in App.tsx.</p>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center p-8 text-center text-[var(--c3-style-basic-fg-neutral)]">
                        <p>Page not found.</p>
                      </div>
                    )
                  }
                />
              </Routes>
            </main>
          </div>
        </div>
      </div>
    </ErrorReporterProvider>
  );
}
