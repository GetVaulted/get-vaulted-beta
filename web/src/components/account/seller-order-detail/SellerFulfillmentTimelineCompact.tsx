import type { SellerMilestone } from "@/lib/order-timeline";

function dotClass(s: SellerMilestone["state"]) {
  if (s === "complete") return "border-emerald-400/50 bg-emerald-500/15 text-emerald-200";
  if (s === "current") return "border-gold/45 bg-gold/12 text-gold-bright shadow-[0_0_14px_-4px_rgba(201,162,39,0.4)]";
  return "border-zinc-700/80 bg-zinc-900/60 text-zinc-600";
}

function barClass(left: SellerMilestone["state"], right: SellerMilestone["state"]) {
  if (left === "complete" && (right === "complete" || right === "current")) return "bg-emerald-500/35";
  if (left === "complete" && right === "upcoming") return "bg-gradient-to-r from-emerald-500/35 to-zinc-700/40";
  if (left === "current") return "bg-gradient-to-r from-gold/35 to-zinc-700/40";
  return "bg-zinc-800/60";
}

export function SellerFulfillmentTimelineCompact({ steps }: { steps: SellerMilestone[] }) {
  return (
    <section
      className="rounded-2xl border border-white/[0.07] bg-[#0a0a0d]/90 p-4 sm:p-5"
      aria-label="Fulfillment timeline"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Fulfillment</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Timeline</p>
      </div>
      <ol className="mt-4 flex items-start justify-between gap-1 sm:gap-2">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
              {!last ? (
                <span
                  className={`absolute left-[calc(50%+0.75rem)] top-[0.65rem] h-px w-[calc(100%-1.5rem)] ${barClass(step.state, steps[i + 1]!.state)}`}
                  aria-hidden
                />
              ) : null}
              <div
                className={`relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold sm:size-7 sm:text-[10px] ${dotClass(step.state)}`}
              >
                {step.state === "complete" ? "✓" : i + 1}
              </div>
              <p
                className={`mt-2 text-[10px] font-bold leading-tight sm:text-[11px] ${step.state === "upcoming" ? "text-zinc-500" : "text-zinc-100"}`}
              >
                {step.title}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
