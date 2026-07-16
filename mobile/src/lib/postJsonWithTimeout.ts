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
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.ontimeout = () => reject(new Error(`Request timed out after ${timeoutMs}ms`));
    xhr.send(body);
  });
}
