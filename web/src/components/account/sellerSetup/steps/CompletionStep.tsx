import { WizardCard, WizardPrimaryButton, WizardStepActions } from "@/components/account/sellerSetup/WizardShell";

const UNLOCKED = [
  "Create listings",
  "Host live shows",
  "Manage orders",
  "Access Seller HQ",
] as const;

export function CompletionStep({
  onBack,
  onEnterHq,
}: {
  onBack: () => void;
  onEnterHq: () => void;
}) {
  return (
    <WizardCard className="flex flex-1 flex-col text-center">
      <p className="text-3xl" aria-hidden>
        ✅
      </p>
      <h2 className="font-display mt-4 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
        Seller setup complete
      </h2>
      <p className="mt-2 text-sm font-medium text-gold-bright/90">Welcome to Seller HQ</p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        You are ready to sell on Get Vaulted. Here is what is now unlocked:
      </p>
      <ul className="mt-6 space-y-2 text-left">
        {UNLOCKED.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-sm text-zinc-200"
          >
            <span className="text-emerald-400" aria-hidden>
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
      <WizardStepActions
        onBack={onBack}
        primary={<WizardPrimaryButton onClick={onEnterHq}>Enter Seller HQ</WizardPrimaryButton>}
      />
    </WizardCard>
  );
}
