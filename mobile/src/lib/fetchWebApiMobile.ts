import { isLikelyHtmlEdgeResponse } from './betaApiResponse';
import { buildWebApiUrl, getWebApiBaseUrl, misconfiguredWebApiHostWarning } from './webApiBaseUrl';
import { readWebApiResponseText } from './webApiResponse';
import { CONNECTION_ERROR_MESSAGE } from './friendlyErrorText';

let warnedMisconfiguredHost = false;

function warnMisconfiguredHostOnce(base: string | null): void {
  if (warnedMisconfiguredHost) return;
  const warning = misconfiguredWebApiHostWarning(base);
  if (!warning) return;
  warnedMisconfiguredHost = true;
  console.warn('[fetchWebApiMobile] host config', { base, warning });
}

function applyMobileApiHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  headers.set('X-GV-Client', 'getvaulted-mobile');
  if (!headers.has('User-Agent')) headers.set('User-Agent', 'GetVaultedMobile/1.0 (Expo)');
  headers.set('Cache-Control', 'no-cache');

  // Optional: password-protected *preview* deploys only (not current beta.shopgetvaulted.com).
  // When set, Netlify site password uses Authorization Basic; Supabase JWT moves to X-GV-Supabase-Auth.
  const basic = process.env.EXPO_PUBLIC_BETA_HTTP_BASIC?.trim();
  const normalizedBasic = basic ? (basic.startsWith('Basic ') ? basic : `Basic ${basic}`) : null;
  const authHeader = headers.get('Authorization')?.trim() ?? '';

  if (normalizedBasic && authHeader.startsWith('Bearer ')) {
    headers.set('X-GV-Supabase-Auth', authHeader);
    headers.set('Authorization', normalizedBasic);
  } else if (normalizedBasic && !authHeader) {
    headers.set('Authorization', normalizedBasic);
  }

  return headers;
}

/** No timeout on RN `fetch` means a dropped/hung connection spins the caller's loading state
 * forever (see performance audit 2026-07). Abort after `timeoutMs` so callers always get a
 * settled promise, while still honoring any caller-supplied `signal`. */
const DEFAULT_TIMEOUT_MS = 15000;

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  const callerSignal = init.signal;
  let onCallerAbort: (() => void) | undefined;
  if (callerSignal) {
    if (callerSignal.aborted) timeoutController.abort();
    else {
      onCallerAbort = () => timeoutController.abort();
      callerSignal.addEventListener('abort', onCallerAbort);
    }
  }

  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: timeoutController.signal });
  } catch (e) {
    if (timeoutController.signal.aborted && !(callerSignal?.aborted)) {
      console.warn('[fetchWebApiMobile] request timed out', { url, timeoutMs });
      const timeoutError = new Error(CONNECTION_ERROR_MESSAGE);
      (timeoutError as Error & { isNetworkTimeout?: true }).isNetworkTimeout = true;
      throw timeoutError;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (callerSignal && onCallerAbort) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

async function responsePreview(res: Response): Promise<string> {
  return (await readWebApiResponseText(res.clone())).slice(0, 120);
}

function logHtmlEdge(path: string, url: string, res: Response, preview: string): void {
  console.warn('[fetchWebApiMobile] html edge response', {
    path,
    url,
    finalUrl: res.url || url,
    status: res.status,
    contentType: res.headers.get('content-type'),
    bodyPreview: preview,
  });
}

/** Mobile → Next.js API fetch with the same headers as POST /api/live-rooms. */
export async function fetchWebApiMobile(
  path: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number },
): Promise<Response> {
  const base = getWebApiBaseUrl();
  if (!base) {
    console.error('[fetchWebApiMobile] misconfigured: EXPO_PUBLIC_SITE_URL / EXPO_PUBLIC_WEB_API_URL not set');
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }
  warnMisconfiguredHostOnce(base);

  const { url } = buildWebApiUrl(path);
  if (!url) {
    console.error('[fetchWebApiMobile] misconfigured: could not build API URL', { path, base });
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = applyMobileApiHeaders(init);
  const requestInit: RequestInit = { ...init, headers };

  try {
    let res = await fetchOnce(url, requestInit, timeoutMs);
    let preview = await responsePreview(res);
    if (isLikelyHtmlEdgeResponse(res, preview)) {
      logHtmlEdge(path, url, res, preview);
      await new Promise((r) => setTimeout(r, 300));
      res = await fetchOnce(url, requestInit, timeoutMs);
      preview = await responsePreview(res);
      if (isLikelyHtmlEdgeResponse(res, preview)) logHtmlEdge(path, url, res, preview);
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if ((e as Error & { isNetworkTimeout?: true })?.isNetworkTimeout) throw e;
    if (msg.includes('Network request failed') || e instanceof TypeError) {
      console.warn('[fetchWebApiMobile] connection failed before any response', { url, base });
      throw new Error(CONNECTION_ERROR_MESSAGE);
    }
    throw e;
  }
}
