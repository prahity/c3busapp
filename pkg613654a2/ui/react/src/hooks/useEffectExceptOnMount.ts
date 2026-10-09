/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useRef, useEffect, EffectCallback, DependencyList } from 'react';

export const useEffectExceptOnMount = (effect: EffectCallback, dependencies: DependencyList = []) => {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) {
      return effect();
    }
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect, ...dependencies]);
};

export default useEffectExceptOnMount;
