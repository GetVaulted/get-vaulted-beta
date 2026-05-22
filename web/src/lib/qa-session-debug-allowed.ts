/** Gate for `/api/qa/*` and `/qa/diagnostics` — off in production unless explicitly enabled. */
export function isQaSessionDebugAllowed(): boolean {
  if (process.env.GV_ALLOW_QA_SESSION_DEBUG?.trim() === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}
