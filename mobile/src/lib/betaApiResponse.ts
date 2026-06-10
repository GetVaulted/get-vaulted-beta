/** How to interpret a failed mobile → Next.js API response. */
export type ApiFailureKind = 'app_auth' | 'api_forbidden' | 'html_edge' | 'other';

function contentType(res: Response): string {
  return (res.headers.get('content-type') ?? '').toLowerCase();
}

function bodyLooksHtml(bodyPreview?: string | null): boolean {
  if (!bodyPreview?.trim()) return false;
  const t = bodyPreview.trim().toLowerCase();
  return t.startsWith('<!doctype html') || t.startsWith('<html');
}

export function classifyApiResponse(res: Response, bodyPreview?: string | null): ApiFailureKind {
  const ct = contentType(res);
  const isJson = ct.includes('application/json');
  const isHtml = ct.includes('text/html') || bodyLooksHtml(bodyPreview);

  if (isHtml && res.status >= 400) return 'html_edge';
  if (res.status === 401 && isJson) return 'app_auth';
  if (res.status === 403 && isJson) return 'api_forbidden';
  return 'other';
}

/** HTML 4xx from edge/WAF or wrong host (static site) before Next.js JSON API runs. */
export function isLikelyHtmlEdgeResponse(res: Response, bodyPreview?: string | null): boolean {
  return classifyApiResponse(res, bodyPreview) === 'html_edge';
}

export function apiFailureLogFields(
  res: Response,
  bodyPreview?: string | null,
): {
  status: number;
  failureKind: ApiFailureKind;
  contentType: string | null;
  bodyPreview: string | null;
} {
  const preview = bodyPreview?.slice(0, 120) ?? null;
  return {
    status: res.status,
    failureKind: classifyApiResponse(res, preview),
    contentType: res.headers.get('content-type'),
    bodyPreview: preview,
  };
}

export function apiFailureErrorMessage(
  res: Response,
  parsedError?: string | null,
  bodyPreview?: string | null,
): string {
  const kind = classifyApiResponse(res, bodyPreview);
  const err = parsedError?.trim();
  switch (kind) {
    case 'html_edge':
      if (res.status === 404) {
        return 'API returned HTML 404 — set EXPO_PUBLIC_SITE_URL to https://beta.shopgetvaulted.com (not shopgetvaulted.com).';
      }
      return 'Edge/WAF returned HTML instead of JSON — verify EXPO_PUBLIC_SITE_URL is https://beta.shopgetvaulted.com.';
    case 'app_auth':
      return err || 'Unauthorized — sign in again or ensure the API route accepts mobile Bearer auth.';
    case 'api_forbidden':
      return err || 'Forbidden';
    default:
      return err || `Request failed (${res.status})`;
  }
}
