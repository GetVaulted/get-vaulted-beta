import type { SellerWizardStep } from "@/lib/seller-setup-wizard";
import { SELLER_WIZARD_TOTAL_STEPS } from "@/lib/seller-setup-wizard";

const STEP_LABELS: Record<SellerWizardStep, string> = {
  1: "Welcome",
  2: "Payout setup",
  3: "Shipping address",
  4: "Seller profile",
  5: "Complete",
};

export function WizardShell({
  step,
  children,
}: {
  step: SellerWizardStep;
  children: React.ReactNode;
}) {
  const progressPct = Math.round((step / SELLER_WIZARD_TOTAL_STEPS) * 100);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(420px,55vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.08),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/90">Seller onboarding</p>
          <p className="mt-2 text-xs font-semibold text-zinc-500">
            Step {step} of {SELLER_WIZARD_TOTAL_STEPS}
            <span className="mx-1.5 text-zinc-700">·</span>
            {STEP_LABELS[step]}
          </p>
          <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </main>
  );
}

export function WizardCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.09] bg-[linear-gradient(180deg,rgba(18,18,22,0.95)_0%,rgba(8,8,10,0.98)_100%)] p-6 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.85)] sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

export function WizardPrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function WizardBackButton({
  onClick,
  disabled,
  label = "Back",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/15 bg-transparent px-6 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.03] hover:text-zinc-100 disabled:opacity-50 sm:w-auto"
    >
      {label}
    </button>
  );
}

/** Back (left) + primary action (right on desktop, bottom on mobile). */
export function WizardStepActions({
  onBack,
  showBack = true,
  backDisabled,
  primary,
  below,
}: {
  onBack?: () => void;
  showBack?: boolean;
  backDisabled?: boolean;
  primary: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <div className="mt-auto pt-8">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {showBack && onBack ? (
          <WizardBackButton onClick={onBack} disabled={backDisabled} />
        ) : (
          <span className="hidden sm:block" aria-hidden />
        )}
        <div className="w-full sm:ml-auto sm:max-w-xs sm:flex-1">{primary}</div>
      </div>
      {below ? <div className="mt-2.5">{below}</div> : null}
    </div>
  );
}

export function WizardSecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:text-zinc-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
