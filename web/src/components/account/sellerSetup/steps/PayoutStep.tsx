import { StripeOnboardingEmbed } from "@/components/seller/StripeOnboardingEmbed";
import {
  WizardCard,
  WizardPrimaryButton,
  WizardSecondaryButton,
  WizardStepActions,
} from "@/components/account/sellerSetup/WizardShell";

type PayoutPhase = "not_connected" | "connecting" | "connected" | "confirming" | "error";
type PayoutRail = "STRIPE" | "PAYPAL";

const STRIPE_ONLY_INFO = [
  {
    title: "Stripe Connect",
    body: "Stripe verifies your identity and pays out to your bank. Best for sellers who want automatic bank deposits.",
  },
] as const;

export function PayoutStep({
  phase,
  rail,
  paypalEnabled,
  paypalEmail,
  paypalReady,
  stripePlatformConfigured,
  busy,
  embedOpen,
  loadError,
  reconcileError,
  onSelectRail,
  onPaypalEmailChange,
  onSavePaypalEmail,
  onVerifyPaypal,
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
  rail: PayoutRail;
  paypalEnabled: boolean;
  paypalEmail: string;
  paypalReady: boolean;
  stripePlatformConfigured: boolean;
  busy: boolean;
  embedOpen: boolean;
  loadError: string | null;
  reconcileError?: string | null;
  onSelectRail: (rail: PayoutRail) => void;
  onPaypalEmailChange: (value: string) => void;
  onSavePaypalEmail: () => void;
  onVerifyPaypal: () => void;
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
  const payoutDone = phase === "connected" || paypalReady;

  return (
    <WizardCard className="flex flex-1 flex-col">
      <h2 className="font-display text-xl font-black tracking-tight text-foreground sm:text-2xl">Payout setup</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Choose how you want to get paid. Buyers still pay with card or wallet — this only controls where your seller
        earnings go.
      </p>

      {paypalEnabled ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onSelectRail("STRIPE")}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              rail === "STRIPE"
                ? "border-gold/50 bg-gold/10"
                : "border-white/[0.08] bg-black/25 hover:border-white/20"
            }`}
          >
            <p className="text-sm font-semibold text-zinc-100">Stripe Connect</p>
            <p className="mt-1 text-xs text-zinc-500">Bank payouts via Stripe</p>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSelectRail("PAYPAL")}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              rail === "PAYPAL"
                ? "border-gold/50 bg-gold/10"
                : "border-white/[0.08] bg-black/25 hover:border-white/20"
            }`}
          >
            <p className="text-sm font-semibold text-zinc-100">PayPal</p>
            <p className="mt-1 text-xs text-zinc-500">Payouts to your PayPal email</p>
          </button>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {STRIPE_ONLY_INFO.map((block) => (
            <li key={block.title} className="rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{block.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{block.body}</p>
            </li>
          ))}
        </ul>
      )}

      {payoutDone ? (
        <div className="mt-6 flex flex-1 flex-col">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-5 py-6 text-center">
            <p className="text-2xl" aria-hidden>
              ✓
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-200">Payouts connected</p>
            <p className="mt-1 text-xs text-emerald-200/70">
              {paypalReady
                ? "PayPal email verified — ready for seller payouts."
                : "Stripe is linked and ready for seller payouts."}
            </p>
          </div>
          <WizardStepActions
            onBack={onBack}
            primary={<WizardPrimaryButton onClick={onContinue}>Continue</WizardPrimaryButton>}
          />
        </div>
      ) : rail === "PAYPAL" && paypalEnabled ? (
        <div className="mt-6 flex flex-1 flex-col">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            PayPal payout email
          </label>
          <input
            type="email"
            value={paypalEmail}
            onChange={(e) => onPaypalEmailChange(e.target.value)}
            placeholder="you@paypal.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-gold/40"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Use the email on your PayPal account. Tap Verify to confirm — Get Vaulted will send your seller earnings
            there when orders clear payout.
          </p>
          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3">
              <p className="text-sm font-medium text-rose-200">{errorMessage}</p>
            </div>
          ) : null}
          <WizardStepActions
            onBack={onBack}
            primary={
              <WizardPrimaryButton disabled={busy || !paypalEmail.trim()} onClick={onVerifyPaypal}>
                {busy ? "Saving…" : "Verify PayPal email"}
              </WizardPrimaryButton>
            }
            below={
              <WizardSecondaryButton disabled={busy || !paypalEmail.trim()} onClick={onSavePaypalEmail}>
                Save email only
              </WizardSecondaryButton>
            }
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
                      : "Connect Stripe"}
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
