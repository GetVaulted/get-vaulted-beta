import { CONNECTION_ERROR_MESSAGE } from './friendlyErrorText';

/**
 * RN `fetch` + AbortController often fails to abort in-flight requests (multipart especially).
 * XMLHttpRequest.timeout is reliable on both iOS and Android.
 */
export function postJsonWithTimeout(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = timeoutMs;
    xhr.responseType = 'text';
    for (const [key, value] of Object.entries(headers)) {
      if (value) xhr.setRequestHeader(key, value);
    }
    xhr.onload = () => {
      resolve({ status: xhr.status, text: typeof xhr.responseText === 'string' ? xhr.responseText : '' });
    };
    xhr.onerror = () => {
      console.warn('[postJsonWithTimeout] XHR error', { url });
      reject(new Error(CONNECTION_ERROR_MESSAGE));
    };
    xhr.ontimeout = () => {
      console.warn('[postJsonWithTimeout] XHR timeout', { url, timeoutMs });
      reject(new Error(CONNECTION_ERROR_MESSAGE));
    };
    xhr.send(body);
  });
}
