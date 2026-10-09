/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { createContext, useState, useContext, Dispatch, SetStateAction } from 'react';

export interface AppStateInterface {
  theme: string;
}

const initialState: AppStateInterface = {
  theme: 'dark',
};

const AppStateContext = createContext({
  state: initialState as Partial<AppStateInterface>,
  setState: {} as Dispatch<SetStateAction<Partial<AppStateInterface>>>,
});

export function AppStateProvider({
  children,
  value = initialState as AppStateInterface,
}: {
  children: React.ReactNode;
  value?: Partial<AppStateInterface>;
}) {
  const [state, setState] = useState(value);
  return <AppStateContext.Provider value={{ state, setState }}>{children}</AppStateContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within a AppStateContext');
  }
  return context;
};
