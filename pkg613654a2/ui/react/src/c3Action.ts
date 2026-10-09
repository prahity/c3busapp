/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from 'axios';

interface AxiosResponse {
  data: any;
}

export function getCookieValue(cookieName: string): string | undefined {
  const cookie = document?.cookie
    ?.split(';')
    ?.map((c) => c.trim())
    .find((c) => c.startsWith(cookieName + '='));
  return cookie ? cookie.split('=')[1] : undefined;
}

export function getAppBaseUrl(): string {
  const c3AppUrlPrefix = getCookieValue('c3AppUrlPrefix');
  const c3env = getCookieValue('c3env');
  const c3app = getCookieValue('c3app');

  let baseUrl = window.location.origin;
  if (c3AppUrlPrefix !== undefined) {
    baseUrl = `${baseUrl}/${c3AppUrlPrefix}`;
  } else if (c3env && c3app) {
    baseUrl = `${baseUrl}/${c3env}/${c3app}`;
  }

  return baseUrl.replace(/\/$/, '');
}

/**
 * Internal function to perform an Axios POST request with error handling.
 * @param url The URL to post to
 * @param payload The payload to send in the POST request
 * @returns The response data from the server
 * @throws An error message if the request fails
 */
const _doAxiosPost = async (url: string, payload: any): Promise<any> => {
  try {
    const response: AxiosResponse = await axios.post(url, payload);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) {
      throw error.response.data.message;
    } else {
      throw error.message;
    }
  };
};

/**
 * The function that allows communication with c3server APIs.
 * For calling APIs with arguments, action needs to be the function name and spec needs to be a list of arguments.
 * For fetching data, action needs to be `fetch` and spec needs to be an object that contains the Filter spec.
 * @param typeName The c3type to call
 * @param actionName The function to invoke
 * @param spec The arguments to the function
 * @returns The response from c3server
 */
export async function c3Action(typeName: string, actionName: string, spec?: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = spec
    ? Array.isArray(spec)
      ? JSON.stringify([typeName, ...spec])
      : JSON.stringify([typeName, spec])
    : undefined;

  return _doAxiosPost(url, payload);
}

export async function c3GetAction(typeName: string, id: string, include: string = 'id'): Promise<any> {
  return await c3MemberAction(typeName, 'get', { id }, include);
}

/**
 * The function that allows communication with c3server APIs using functions like create().
 * For calling APIs with arguments, action needs to be the function name and spec needs to be a list of arguments.
 * @param typeName The c3type to call
 * @param actionName The function to invoke
 * @param spec The arguments to the function
 * @returns The response from c3server
 */
export async function c3CreateAction(typeName: string, actionName: string, spec: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = JSON.stringify([spec]);

  return _doAxiosPost(url, payload);
}

/**
 * The function that allows communication with c3server APIs using member functions.
 * For calling APIs with arguments, action needs to be the member function name and spec needs
 * to be a list of arguments.
 * @param typeName The c3type to call
 * @param actionName The member function to invoke
 * @param instance The c3type instance to call
 * @param spec The arguments to the function
 * @returns The response from c3server
 */
export async function c3MemberAction(typeName: string, actionName: string, instance: any, spec?: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = spec
    ? Array.isArray(spec)
      ? JSON.stringify([instance, ...spec])
      : JSON.stringify([instance, spec])
    : JSON.stringify([instance]);

  return _doAxiosPost(url, payload);
}

export default c3Action;
