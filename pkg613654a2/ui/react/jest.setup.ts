/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import '@testing-library/jest-dom';

// Mock the Web Worker when unit tests are run
window.Worker = class Worker {
  [x: string]: any;
  constructor(stringUrl: string, mockOptions: any) {
    this.url = stringUrl;
    this.options = mockOptions;
    this.onmessage = () => {
      'doing nothing';
    };
  }

  postMessage(msg: any) {
    this.onmessage(msg);
  }
} as any;
