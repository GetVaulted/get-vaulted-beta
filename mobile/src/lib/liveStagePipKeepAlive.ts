/**
 * While Amazon IVS Stage remote PiP is keeping the subscribe alive across home-swipe,
 * AppState → active must NOT park transport to `none` / force a cold rejoin — that tears
 * down the same Stage session PiP was preserving and makes return feel like a new show.
 */
let stagePipKeepAlive = false;

export function setLiveStagePipKeepAlive(active: boolean): void {
  stagePipKeepAlive = active;
}

export function isLiveStagePipKeepAliveActive(): boolean {
  return stagePipKeepAlive;
}

/** Test-only reset. */
export function resetLiveStagePipKeepAliveForTests(): void {
  stagePipKeepAlive = false;
}
