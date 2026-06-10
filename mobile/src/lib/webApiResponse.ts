import { classifyApiResponse, type ApiFailureKind } from './betaApiResponse';

export function responseLooksHtml(contentType: string | null, bodyText: string): boolean {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('text/html')) return true;
  const t = bodyText.trim().toLowerCase();
  return t.startsWith('<!doctype html') || t.startsWith('<html');
}

export async function readWebApiResponseText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export function parseWebApiJsonBody<T extends Record<string, unknown>>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

export function webApiFailureLogFields(
  res: Response,
  opts: { url: string | null; bodyPreview?: string | null },
): {
  url: string | null;
  finalUrl: string | null;
  status: number;
  contentType: string | null;
  failureKind: ApiFailureKind;
  bodyPreview: string | null;
} {
  const preview = opts.bodyPreview?.slice(0, 120) ?? null;
  return {
    url: opts.url,
    finalUrl: res.url || opts.url,
    status: res.status,
    contentType: res.headers.get('content-type'),
    failureKind: classifyApiResponse(res, preview),
    bodyPreview: preview,
  };
}
