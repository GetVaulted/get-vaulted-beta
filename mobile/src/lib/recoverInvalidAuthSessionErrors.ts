/** True when Supabase Auth rejects a persisted refresh token (e.g. after beta wipe). */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') {
    const s = error.toLowerCase();
    return s.includes('invalid refresh token') || s.includes('refresh token not found');
  }
  if (typeof error !== 'object') return false;

  const obj = error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const message = typeof obj.message === 'string' ? obj.message.toLowerCase() : '';
  const code = typeof obj.code === 'string' ? obj.code.toLowerCase() : '';

  if (message.includes('invalid refresh token') || message.includes('refresh token not found')) return true;
  if (code === 'refresh_token_not_found' || code === 'invalid_refresh_token') return true;
  if (obj.name === 'AuthApiError' && message.includes('refresh')) return true;

  return false;
}
