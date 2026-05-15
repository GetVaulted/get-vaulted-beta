import type { OrderTimelineStep, SellerMilestone, TimelineStepState } from "@/lib/order-timeline";

function dotClass(s: TimelineStepState) {
  if (s === "complete") return "border-emerald-400/60 bg-emerald-500/20 text-emerald-200";
  if (s === "current") return "border-gold/50 bg-gold/15 text-gold-bright shadow-[0_0_12px_-2px_rgba(201,162,39,0.35)]";
  return "border-zinc-600 bg-zinc-900/80 text-zinc-600";
}

function connectorClass(prev: TimelineStepState) {
  if (prev === "complete") return "bg-emerald-500/30";
  if (prev === "current") return "bg-gradient-to-b from-gold/35 to-zinc-700/30";
  return "bg-zinc-800/70";
}

export function OrderTimelineSteps({ steps, heading }: { steps: OrderTimelineStep[]; heading: string }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6" aria-label={heading}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{heading}</p>
      <ol className="mt-5 space-y-0">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          const lineDown = !last;
          return (
            <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
              {lineDown ? (
                <span
                  className={`absolute left-[0.6rem] top-6 h-[calc(100%-0.5rem)] w-px ${connectorClass(step.state)}`}
                  aria-hidden
                />
              ) : null}
              <div className={`relative z-[1] flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${dotClass(step.state)}`}>
                {step.state === "complete" ? "✓" : step.state === "current" ? "●" : i + 1}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm font-semibold ${step.state === "upcoming" ? "text-zinc-500" : "text-zinc-100"}`}>{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function SellerMilestoneSteps({ milestones, heading }: { milestones: SellerMilestone[]; heading: string }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6" aria-label={heading}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{heading}</p>
      <ol className="mt-5 space-y-0">
        {milestones.map((step, i) => {
          const last = i === milestones.length - 1;
          return (
            <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
              {!last ? (
                <span
                  className={`absolute left-[0.6rem] top-6 h-[calc(100%-0.5rem)] w-px ${connectorClass(step.state)}`}
                  aria-hidden
                />
              ) : null}
              <div className={`relative z-[1] flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${dotClass(step.state)}`}>
                {step.state === "complete" ? "✓" : step.state === "current" ? "●" : i + 1}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm font-semibold ${step.state === "upcoming" ? "text-zinc-500" : "text-zinc-100"}`}>{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
