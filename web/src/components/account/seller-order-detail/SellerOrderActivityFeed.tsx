type ActivityRow = { id: string; title: string; body: string; createdAt: string };

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function SellerOrderActivityFeed({ events }: { events: ActivityRow[] }) {
  if (events.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-[#0a0a0d]/90 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Activity</p>
        <p className="mt-3 text-sm text-zinc-500">No activity recorded yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0a0a0d]/90 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Activity log</p>
      <ul className="mt-4 space-y-0">
        {events.map((ev, i) => (
          <li key={ev.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 ? (
              <span className="absolute left-[0.35rem] top-3 h-[calc(100%-0.25rem)] w-px bg-white/[0.06]" aria-hidden />
            ) : null}
            <span className="relative z-[1] mt-1.5 size-2 shrink-0 rounded-full bg-gold/50" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">{ev.title}</p>
                <time className="shrink-0 font-mono text-[10px] text-zinc-600">{formatWhen(ev.createdAt)}</time>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{ev.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
