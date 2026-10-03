import { useAppPresenceHeartbeat } from '../hooks/useAppPresenceHeartbeat';

/** Mounts signed-in foreground presence heartbeats for admin online counts. */
export function AppPresenceHeartbeatEffect() {
  useAppPresenceHeartbeat();
  return null;
}
