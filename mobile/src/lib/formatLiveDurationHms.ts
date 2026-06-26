/** Elapsed since room went live (H:MM:SS). */
export function formatLiveDurationHms(startedAtIso: string, nowMs: number): string {
  const t0 = Date.parse(startedAtIso);
  if (Number.isNaN(t0)) return '0:00:00';
  const sec = Math.max(0, Math.floor((nowMs - t0) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
