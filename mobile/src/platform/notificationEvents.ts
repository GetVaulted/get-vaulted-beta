type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeNotificationBadge(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNotificationBadgeChanged(): void {
  for (const l of listeners) l();
}
