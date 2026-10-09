/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';

import { SideNavPanelV2, SideNavPanelV2Item } from '@/components/ui/side-nav-panel-v2';
import { useTheme } from '@/hooks/useTheme';
import { navigationConfig } from '@/config/navigation';
import { NavigationItem } from '@/types/navigation';

// Key under which the sidebar expanded/collapsed state is persisted so it
// survives a page refresh. Read once on mount, written on every toggle.
const SIDENAV_EXPANDED_KEY = 'c3.sidenav.expanded';

const readStoredExpanded = (): boolean => {
  try {
    const stored = window.localStorage.getItem(SIDENAV_EXPANDED_KEY);
    // Default to expanded when nothing has been persisted yet.
    return stored === null ? true : stored === 'true';
  } catch {
    // localStorage can be unavailable (private mode, blocked cookies) — fall
    // back to the expanded default rather than crashing the shell.
    return true;
  }
};

/**
 * Application left navigation.
 *
 * Built on the C3 Design System {@link SideNavPanelV2} — the current-gen labeled
 * tree (256px) that collapses to a 48px icon rail. It is driven by
 * {@link navigationConfig}: add a route there and it appears here automatically.
 * Selection is wired to the router (the active item is derived from the current
 * path; clicking an item navigates). The theme toggle lives in the panel footer.
 */
export default function SideNav() {
  const { currentTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState<boolean>(readStoredExpanded);

  // Persist the expanded/collapsed choice so a refresh restores it.
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDENAV_EXPANDED_KEY, String(expanded));
    } catch {
      // Ignore storage failures — the toggle still works for this session.
    }
  }, [expanded]);

  const isActiveRoute = (item: NavigationItem): boolean => {
    if (item.path === '/') {
      return location.pathname === '/';
    }
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  };

  // The panel's controlled `value` is the path of the active nav item. Fall back
  // to '' (not undefined) when no route matches, so the panel stays a controlled
  // component — passing undefined would flip it controlled→uncontrolled and warn.
  const activeItem = navigationConfig.find(isActiveRoute);
  const activeValue = activeItem?.path ?? '';

  const ThemeIcon = currentTheme === 'dark' ? Sun : Moon;

  return (
    <SideNavPanelV2
      expanded={expanded}
      onExpandedChange={setExpanded}
      value={activeValue}
      onValueChange={(path) => navigate(path)}
      className="shrink-0 border-r border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]"
      footer={
        <SideNavPanelV2Item
          value="__theme-toggle"
          icon={<ThemeIcon />}
          label={`${currentTheme === 'dark' ? 'Light' : 'Dark'} mode`}
          onClick={(event) => {
            // This row is an action, not a route — don't let it become the
            // selected page. Toggle the theme and keep navigation state intact.
            event.preventDefault();
            toggleTheme();
          }}
        />
      }
    >
      {navigationConfig.map((item) => (
        <SideNavPanelV2Item
          key={item.id}
          value={item.path}
          icon={<item.icon />}
          label={item.label}
          disabled={item.disabled}
          trailing={
            item.badge ? (
              <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--c3-style-basic-bg-danger-inverse)] px-1 text-[11px] font-medium text-[var(--c3-style-basic-fg-inverse)]">
                {item.badge}
              </span>
            ) : undefined
          }
        />
      ))}
    </SideNavPanelV2>
  );
}
