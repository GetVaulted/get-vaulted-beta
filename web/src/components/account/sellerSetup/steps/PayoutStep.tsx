import { StripeOnboardingEmbed } from "@/components/seller/StripeOnboardingEmbed";
import {
  WizardCard,
  WizardPrimaryButton,
  WizardSecondaryButton,
  WizardStepActions,
} from "@/components/account/sellerSetup/WizardShell";

type PayoutPhase = "not_connected" | "connecting" | "connected";

export function PayoutStep({
  phase,
  stripePlatformConfigured,
  busy,
  embedOpen,
  loadError,
  onBack,
  onConnect,
  onContinue,
  onEmbedClose,
  onEmbedSessionEnd,
  onEmbedFallback,
}: {
  phase: PayoutPhase;
  stripePlatformConfigured: boolean;
  busy: boolean;
  embedOpen: boolean;
  loadError: string | null;
  onBack: () => void;
  onConnect: () => void;
  onContinue: () => void;
  onEmbedClose: () => void;
  onEmbedSessionEnd: () => void;
  onEmbedFallback: () => void;
}) {
  return (
    <WizardCard className="flex flex-1 flex-col">
      <h2 className="font-display text-xl font-black tracking-tight text-foreground sm:text-2xl">Payout setup</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Connect Stripe so you can receive payouts when items sell. This is required before you can list or go live.
      </p>

      {phase === "connected" ? (
        <div className="mt-8 flex flex-1 flex-col">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-5 py-6 text-center">
            <p className="text-2xl" aria-hidden>
              ✓
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-200">Payouts connected</p>
            <p className="mt-1 text-xs text-emerald-200/70">Stripe is linked and ready for seller payouts.</p>
          </div>
          <WizardStepActions
            onBack={onBack}
            primary={<WizardPrimaryButton onClick={onContinue}>Continue</WizardPrimaryButton>}
          />
        </div>
      ) : (
        <div className="mt-8 flex flex-1 flex-col">
          {phase === "connecting" || embedOpen ? (
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c10]">
              <div className="border-b border-white/[0.06] px-4 py-2.5">
                <p className="text-xs font-semibold text-zinc-400">Connecting to Stripe…</p>
              </div>
              <div className="max-h-[min(52vh,480px)] overflow-y-auto p-3">
                <StripeOnboardingEmbed
                  active={embedOpen}
                  onSessionEnd={onEmbedSessionEnd}
                  onNeedsFallbackHint={onEmbedFallback}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-8 text-center">
              <p className="text-sm text-zinc-400">Stripe securely handles identity verification and payout details.</p>
            </div>
          )}

          {loadError ? <p className="mt-4 text-sm font-medium text-amber-200">{loadError}</p> : null}

          <WizardStepActions
            onBack={onBack}
            primary={
              !embedOpen ? (
                <WizardPrimaryButton
                  disabled={(!stripePlatformConfigured && phase === "not_connected") || busy}
                  onClick={onConnect}
                >
                  {busy ? "Opening…" : phase === "connecting" ? "Connecting…" : "Connect payouts"}
                </WizardPrimaryButton>
              ) : (
                <WizardPrimaryButton onClick={onEmbedClose}>Close Stripe setup</WizardPrimaryButton>
              )
            }
          />
        </div>
      )}
    </WizardCard>
  );
}
