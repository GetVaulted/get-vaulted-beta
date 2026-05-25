import { WizardCard, WizardPrimaryButton } from "@/components/account/sellerSetup/WizardShell";

const UNLOCKS = [
  { label: "Listings", desc: "Create and manage buy-now and auction inventory" },
  { label: "Live selling", desc: "Host live shows and run breaks" },
  { label: "Payouts", desc: "Get paid when your items sell" },
  { label: "Seller HQ", desc: "Your command center for sales and live events" },
] as const;

export function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <WizardCard className="flex flex-1 flex-col">
      <h1 className="font-display text-center text-2xl font-black tracking-tight text-foreground sm:text-3xl">
        Become a Seller
      </h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-zinc-400">
        Set up your seller account to start listing products and hosting live shows on Get Vaulted.
      </p>
      <p className="mt-5 text-center text-xs font-medium text-zinc-500">
        Estimated setup time: <span className="text-zinc-300">~2 minutes</span>
      </p>
      <div className="mt-8 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">What you unlock</p>
        <ul className="space-y-2.5">
          {UNLOCKS.map((item) => (
            <li
              key={item.label}
              className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3"
            >
              <p className="text-sm font-semibold text-zinc-200">{item.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{item.desc}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto pt-8">
        <WizardPrimaryButton onClick={onStart}>Start setup</WizardPrimaryButton>
      </div>
    </WizardCard>
  );
}
