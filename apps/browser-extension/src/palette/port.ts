/**
 * The extension's side of the shared palette: every request goes to the service worker, so the
 * palette behaves the same in a content script and on the start page.
 */
import type { ActionPort } from '@kaihuman/palette';

/** One message to the service worker; rejects with its error, or with Chrome's. */
export const send = (message: object): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const failure = chrome.runtime.lastError?.message || response?.error;
      if (failure) reject(new Error(failure));
      else resolve(response);
    });
  });

export const workerPort: ActionPort = { send };
