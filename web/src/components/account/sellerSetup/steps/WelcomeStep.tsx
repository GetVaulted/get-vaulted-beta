import { WizardCard, WizardPrimaryButton } from "@/components/account/sellerSetup/WizardShell";

const WHY_SELL = [
  {
    label: "Lower seller fees",
    desc: "Keep more of every sale with marketplace pricing built for collectors, not big-box margins.",
  },
  {
    label: "Live auctions & breaks",
    desc: "Run real-time shows, rips, and spot sales with bids that close in the room — not in a stale listing.",
  },
  {
    label: "Marketplace + vault listings",
    desc: "Sell buy-now inventory alongside live events from one seller profile buyers already trust.",
  },
  {
    label: "OBS & mobile streaming",
    desc: "Go live from your phone or pipe in OBS so your community gets a premium broadcast experience.",
  },
  {
    label: "Seller growth tools",
    desc: "Seller HQ tracks revenue, fulfillment, and show performance so you can scale with clarity.",
  },
] as const;

const UNLOCKS = [
  { label: "Listings", desc: "Create and manage buy-now and auction inventory" },
  { label: "Live selling", desc: "Host live shows and run breaks" },
  { label: "Payouts", desc: "Get paid when your items sell" },
  { label: "Seller HQ", desc: "Your command center for sales and live events" },
] as const;

export function WelcomeStep({ onStart, starting }: { onStart: () => void; starting?: boolean }) {
  return (
    <WizardCard className="flex flex-1 flex-col">
      <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/90">
        Sell on Get Vaulted
      </p>
      <h1 className="font-display mt-2 text-center text-2xl font-black tracking-tight text-foreground sm:text-3xl">
        Why sellers choose Get Vaulted
      </h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-zinc-400">
        The premium live collectible marketplace — built for hosts, breakers, and shops who want real-time selling with
        transparent payouts.
      </p>
      <ul className="mt-6 space-y-2.5">
        {WHY_SELL.map((item) => (
          <li
            key={item.label}
            className="rounded-xl border border-gold/15 bg-[linear-gradient(165deg,rgba(201,162,39,0.06)_0%,rgba(0,0,0,0.35)_55%)] px-4 py-3"
          >
            <p className="text-sm font-semibold text-zinc-100">{item.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{item.desc}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">What you unlock next</p>
      <ul className="mt-2 space-y-2">
        {UNLOCKS.map((item) => (
          <li key={item.label} className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-2.5">
            <p className="text-sm font-semibold text-zinc-200">{item.label}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{item.desc}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs text-zinc-500">
        Setup takes about <span className="text-zinc-300">2 minutes</span> — payout, ship-from, and seller profile.
      </p>
      <div className="mt-auto pt-6">
        <WizardPrimaryButton onClick={onStart} disabled={starting}>
          {starting ? "Starting…" : "Start seller setup"}
        </WizardPrimaryButton>
      </div>
    </WizardCard>
  );
}
