/** Temporary __DEV__ breadcrumbs for live viewer leave/re-enter debugging. */
export function viewerLifecycleLog(event: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (detail) {
    console.log(`[ViewerLifecycle] ${event}`, detail);
  } else {
    console.log(`[ViewerLifecycle] ${event}`);
  }
}
