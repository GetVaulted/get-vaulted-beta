import { StripeOnboardingEmbed } from "@/components/seller/StripeOnboardingEmbed";
import {
  WizardCard,
  WizardPrimaryButton,
  WizardSecondaryButton,
  WizardStepActions,
} from "@/components/account/sellerSetup/WizardShell";

type PayoutPhase = "not_connected" | "connecting" | "connected" | "confirming" | "error";

const PAYOUT_INFO = [
  {
    title: "Why Stripe is required",
    body: "Stripe verifies your identity and links a payout destination so Get Vaulted can send marketplace and live-sale earnings securely.",
  },
  {
    title: "How payouts work",
    body: "When an order is paid, your share is tracked in Seller HQ. Funds move to your connected bank or debit card on Stripe’s payout schedule after the sale clears.",
  },
  {
    title: "Payout tiers",
    body: "Standard sellers receive funds after delivery confirmation. Fast Payout unlocks release at the first carrier acceptance scan. Instant Payout releases funds when you create a valid shipping label.",
  },
  {
    title: "Building toward faster payouts",
    body: "Eligibility is based on account age, lifetime GMV, completed orders, seller rating, cancellation and chargeback rates, fulfillment performance, and risk review. Instant Payout requires Get Vaulted approval.",
  },
] as const;

export function PayoutStep({
  phase,
  stripePlatformConfigured,
  busy,
  embedOpen,
  loadError,
  reconcileError,
  onBack,
  onConnect,
  onContinue,
  onRetry,
  onCancelConfirm,
  onEmbedClose,
  onEmbedSessionEnd,
  onEmbedFallback,
}: {
  phase: PayoutPhase;
  stripePlatformConfigured: boolean;
  busy: boolean;
  embedOpen: boolean;
  loadError: string | null;
  reconcileError?: string | null;
  onBack: () => void;
  onConnect: () => void;
  onContinue: () => void;
  onRetry?: () => void;
  onCancelConfirm?: () => void;
  onEmbedClose: () => void;
  onEmbedSessionEnd: () => void;
  onEmbedFallback: () => void;
}) {
  const errorMessage = reconcileError ?? loadError;

  return (
    <WizardCard className="flex flex-1 flex-col">
      <h2 className="font-display text-xl font-black tracking-tight text-foreground sm:text-2xl">Payout setup</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Connect Stripe once to receive marketplace sales and live auction payouts. You can list and go live after payout
        setup is complete.
      </p>

      <ul className="mt-5 space-y-3">
        {PAYOUT_INFO.map((block) => (
          <li key={block.title} className="rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{block.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{block.body}</p>
          </li>
        ))}
      </ul>

      {phase === "connected" ? (
        <div className="mt-6 flex flex-1 flex-col">
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
        <div className="mt-6 flex flex-1 flex-col">
          {phase === "confirming" ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-5 py-6 text-center">
              <p className="text-xs font-semibold text-amber-100">Confirming payout setup…</p>
              <p className="mt-2 text-xs text-amber-200/70">This usually takes a few seconds after Stripe.</p>
              {onCancelConfirm ? (
                <button
                  type="button"
                  className="mt-4 text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                  onClick={onCancelConfirm}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          ) : phase === "connecting" || embedOpen ? (
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
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-6 text-center">
              <p className="text-sm text-zinc-400">
                Stripe securely collects tax, identity, and bank details. Get Vaulted never stores your full banking
                credentials.
              </p>
            </div>
          )}

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3">
              <p className="text-sm font-medium text-rose-200">{errorMessage}</p>
              {onRetry ? (
                <button
                  type="button"
                  className="mt-2 text-xs font-bold text-gold-bright hover:underline"
                  onClick={onRetry}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <WizardStepActions
            onBack={onBack}
            primary={
              !embedOpen ? (
                <WizardPrimaryButton
                  disabled={(!stripePlatformConfigured && phase === "not_connected") || busy || phase === "confirming"}
                  onClick={onConnect}
                >
                  {busy || phase === "connecting"
                    ? "Opening…"
                    : phase === "confirming"
                      ? "Confirming…"
                      : "Connect payouts"}
                </WizardPrimaryButton>
              ) : (
                <WizardPrimaryButton onClick={onEmbedClose}>Close Stripe setup</WizardPrimaryButton>
              )
            }
            below={
              onRetry && errorMessage ? (
                <WizardSecondaryButton onClick={onRetry}>Retry status check</WizardSecondaryButton>
              ) : undefined
            }
          />
        </div>
      )}
    </WizardCard>
  );
}
