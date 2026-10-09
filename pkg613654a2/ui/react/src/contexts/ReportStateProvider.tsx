/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { createContext, useState, useContext, Dispatch, SetStateAction } from 'react';

export interface ReportStateInterface {
  editMode: boolean;
  summaryLoading: boolean;
}

const initialState = {
  editMode: false,
  summaryLoading: false,
};

const ReportStateContext = createContext({
  state: initialState as Partial<ReportStateInterface>,
  setState: {} as Dispatch<SetStateAction<Partial<ReportStateInterface>>>,
});

export function ReportStateProvider({
  children,
  value = initialState as ReportStateInterface,
}: {
  children: React.ReactNode;
  value?: Partial<ReportStateInterface>;
}) {
  const [state, setState] = useState(value);
  return <ReportStateContext.Provider value={{ state, setState }}>{children}</ReportStateContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useReportState = () => {
  const context = useContext(ReportStateContext);
  if (!context) {
    throw new Error('useReportState must be used within a ReportStateContext');
  }
  return context;
};
