import { describe, expect, it } from 'vitest';
import {
  apiFailureErrorMessage,
  apiFailureLogFields,
  classifyApiResponse,
  isLikelyHtmlEdgeResponse,
} from './betaApiResponse';

describe('betaApiResponse', () => {
  it('classifies HTML edge/WAF 403', () => {
    const res = new Response('<!doctype html><html>', {
      status: 403,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    expect(classifyApiResponse(res)).toBe('html_edge');
    expect(isLikelyHtmlEdgeResponse(res)).toBe(true);
    expect(apiFailureErrorMessage(res)).toContain('EXPO_PUBLIC_SITE_URL');
    expect(apiFailureLogFields(res).failureKind).toBe('html_edge');
  });

  it('classifies HTML 404 wrong host via body preview', () => {
    const res = new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
    const preview = '<!DOCTYPE html><html><title>Page not found</title>';
    expect(classifyApiResponse(res, preview)).toBe('html_edge');
    expect(apiFailureErrorMessage(res, null, preview)).toContain('shopgetvaulted.com');
  });

  it('classifies app JSON 401', () => {
    const res = new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    expect(classifyApiResponse(res)).toBe('app_auth');
    expect(apiFailureLogFields(res).failureKind).toBe('app_auth');
    expect(apiFailureErrorMessage(res, 'Unauthorized')).toBe('Unauthorized');
  });

  it('classifies app JSON 403', () => {
    const res = new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    expect(classifyApiResponse(res)).toBe('api_forbidden');
    expect(isLikelyHtmlEdgeResponse(res)).toBe(false);
    expect(apiFailureErrorMessage(res, 'Forbidden')).toBe('Forbidden');
  });
});
