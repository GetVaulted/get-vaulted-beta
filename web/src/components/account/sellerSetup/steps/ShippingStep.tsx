import { WizardCard, WizardPrimaryButton, WizardStepActions } from "@/components/account/sellerSetup/WizardShell";

import {
  SELLER_SHIP_FROM_COUNTRY,
  SELLER_SHIP_FROM_COUNTRY_LABEL,
} from "@/lib/seller-shipping-readiness";

export function ShippingStep({
  shipName,
  shipStreet,
  shipCity,
  shipState,
  shipZip,
  saveBusy,
  saveError,
  saved,
  onBack,
  onChange,
  onSave,
  onContinue,
}: {
  shipName: string;
  shipStreet: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  saveBusy: boolean;
  saveError: string | null;
  saved: boolean;
  onBack: () => void;
  onChange: (field: "name" | "street" | "city" | "state" | "zip", value: string) => void;
  onSave: () => void;
  onContinue: () => void;
}) {
  const readOnlyClass =
    "h-11 w-full cursor-not-allowed rounded-xl border border-white/[0.08] bg-[#08080a] px-3 text-sm text-zinc-400 outline-none";
  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none transition focus:border-gold/40";

  return (
    <WizardCard className="flex flex-1 flex-col">
      <h2 className="font-display text-xl font-black tracking-tight text-foreground sm:text-2xl">Shipping address</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Where packages ship from when you fulfill orders. We use this for shipping labels and buyer estimates.
      </p>

      {saved ? (
        <div className="mt-8 flex flex-1 flex-col">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-5 py-6 text-center">
            <p className="text-2xl" aria-hidden>
              ✓
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-200">Address saved</p>
            <p className="mt-1 text-xs text-emerald-200/70">
              {[shipStreet, shipCity, shipState, shipZip, SELLER_SHIP_FROM_COUNTRY].filter(Boolean).join(", ")}
            </p>
          </div>
          <WizardStepActions
            onBack={onBack}
            primary={<WizardPrimaryButton onClick={onContinue}>Continue</WizardPrimaryButton>}
          />
        </div>
      ) : (
        <form
          className="mt-6 flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid gap-3">
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">Name / company</span>
              <input
                value={shipName}
                onChange={(e) => onChange("name", e.target.value)}
                className={inputClass}
                autoComplete="name"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">Street</span>
              <input
                value={shipStreet}
                onChange={(e) => onChange("street", e.target.value)}
                className={inputClass}
                autoComplete="street-address"
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-medium text-zinc-400">City</span>
                <input
                  value={shipCity}
                  onChange={(e) => onChange("city", e.target.value)}
                  className={inputClass}
                  autoComplete="address-level2"
                  required
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-zinc-400">State</span>
                <input
                  value={shipState}
                  onChange={(e) => onChange("state", e.target.value)}
                  className={inputClass}
                  autoComplete="address-level1"
                  required
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-medium text-zinc-400">ZIP</span>
                <input
                  value={shipZip}
                  onChange={(e) => onChange("zip", e.target.value)}
                  className={inputClass}
                  autoComplete="postal-code"
                  required
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-zinc-400">Country</span>
                <input
                  value={`${SELLER_SHIP_FROM_COUNTRY_LABEL} (${SELLER_SHIP_FROM_COUNTRY})`}
                  readOnly
                  tabIndex={-1}
                  aria-readonly
                  className={readOnlyClass}
                />
                <p className="mt-1 text-[11px] text-zinc-600">US-only selling during launch.</p>
              </label>
            </div>
          </div>
          {saveError ? <p className="mt-3 text-sm font-medium text-amber-200">{saveError}</p> : null}
          <WizardStepActions
            onBack={onBack}
            backDisabled={saveBusy}
            primary={
              <WizardPrimaryButton type="submit" disabled={saveBusy}>
                {saveBusy ? "Saving…" : "Save & continue"}
              </WizardPrimaryButton>
            }
          />
        </form>
      )}
    </WizardCard>
  );
}
