/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';

const Dashboard: React.FC = () => {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center bg-[var(--c3-style-basic-bg-page)] px-6 py-8 text-center">
      <div className="flex max-w-[640px] flex-col items-center gap-2">
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Hey, welcome! 👋</h1>
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          You&apos;re on the{' '}
          <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">Dashboard</span> page — this is
          where things will live once we start building. Let&apos;s make this page yours!
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
