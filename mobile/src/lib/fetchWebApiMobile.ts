import { isLikelyHtmlEdgeResponse } from './betaApiResponse';
import { buildWebApiUrl, getWebApiBaseUrl, misconfiguredWebApiHostWarning } from './webApiBaseUrl';
import { readWebApiResponseText } from './webApiResponse';

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

async function fetchOnce(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store' });
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
export async function fetchWebApiMobile(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getWebApiBaseUrl();
  if (!base) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }
  warnMisconfiguredHostOnce(base);

  const { url } = buildWebApiUrl(path);
  if (!url) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }

  const headers = applyMobileApiHeaders(init);
  const requestInit: RequestInit = { ...init, headers };

  try {
    let res = await fetchOnce(url, requestInit);
    let preview = await responsePreview(res);
    if (isLikelyHtmlEdgeResponse(res, preview)) {
      logHtmlEdge(path, url, res, preview);
      await new Promise((r) => setTimeout(r, 300));
      res = await fetchOnce(url, requestInit);
      preview = await responsePreview(res);
      if (isLikelyHtmlEdgeResponse(res, preview)) logHtmlEdge(path, url, res, preview);
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      msg.includes('Network request failed') || e instanceof TypeError
        ? `Could not reach the Vaulted API at ${base}. Check your connection and env.`
        : msg,
    );
  }
}
