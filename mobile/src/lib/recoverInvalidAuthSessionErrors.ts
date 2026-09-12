/** True when Supabase Auth rejects a persisted refresh token (e.g. after beta wipe). */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') {
    const s = error.toLowerCase();
    if (s.includes('already used')) return false;
    return s.includes('invalid refresh token') || s.includes('refresh token not found');
  }
  if (typeof error !== 'object') return false;

  const obj = error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const message = typeof obj.message === 'string' ? obj.message.toLowerCase() : '';
  const code = typeof obj.code === 'string' ? obj.code.toLowerCase() : '';

  // Concurrent refreshSession() races — not a dead login. Caller should re-read getSession().
  if (message.includes('already used')) return false;

  if (message.includes('invalid refresh token') || message.includes('refresh token not found')) return true;
  if (code === 'refresh_token_not_found' || code === 'invalid_refresh_token') return true;

  return false;
}

/** True when a refresh failed because another concurrent refresh already rotated the token. */
export function isAlreadyUsedRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') return error.toLowerCase().includes('already used');
  if (typeof error !== 'object') return false;
  const message =
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';
  return message.includes('already used');
}
