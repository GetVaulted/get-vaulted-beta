import { WizardCard, WizardPrimaryButton, WizardStepActions } from "@/components/account/sellerSetup/WizardShell";
import { AddressAutocompleteFields } from "@/components/address/AddressAutocompleteFields";

import {
  SELLER_SHIP_FROM_COUNTRY,
  SELLER_SHIP_FROM_COUNTRY_LABEL,
} from "@/lib/seller-shipping-readiness";

function combineStreet(line1: string, line2: string): string {
  const a = line1.trim();
  const b = line2.trim();
  if (!b) return a;
  return `${a} ${b}`;
}

export function ShippingStep({
  shipName,
  shipStreet,
  shipCity,
  shipState,
  shipZip,
  shipPhone,
  phoneOnlyCompletion = false,
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
  shipPhone: string;
  phoneOnlyCompletion?: boolean;
  saveBusy: boolean;
  saveError: string | null;
  saved: boolean;
  onBack: () => void;
  onChange: (field: "name" | "street" | "city" | "state" | "zip" | "phone", value: string) => void;
  onSave: () => void;
  onContinue: () => void;
}) {
  const readOnlyClass =
    "h-11 w-full cursor-not-allowed rounded-xl border border-white/[0.08] bg-[#08080a] px-3 text-sm text-zinc-400 outline-none";
  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none transition focus:border-gold/40";

  return (
    <WizardCard className="flex flex-1 flex-col">
      <h2 className="font-display text-xl font-black tracking-tight text-foreground sm:text-2xl">
        {phoneOnlyCompletion ? "Contact phone" : "Shipping address"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {phoneOnlyCompletion
          ? "Your ship-from address is already saved. USPS requires a phone number on every shipping label."
          : "Where packages ship from when you fulfill orders. We use this for shipping labels and buyer estimates."}
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
            {phoneOnlyCompletion ? (
              <div className="rounded-xl border border-white/[0.08] bg-[#08080a] px-4 py-3 text-sm text-zinc-300">
                {[shipStreet, shipCity, shipState, shipZip, SELLER_SHIP_FROM_COUNTRY].filter(Boolean).join(", ")}
              </div>
            ) : (
              <>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">Name / company</span>
              <input
                value={shipName}
                onChange={(e) => onChange("name", e.target.value)}
                className={inputClass}
                autoComplete="name"
              />
            </label>
            <AddressAutocompleteFields
              values={{
                line1: shipStreet,
                line2: "",
                city: shipCity,
                state: shipState,
                postalCode: shipZip,
                country: SELLER_SHIP_FROM_COUNTRY,
              }}
              onChange={(field, value) => {
                if (field === "line1") onChange("street", value);
                if (field === "city") onChange("city", value);
                if (field === "state") onChange("state", value);
                if (field === "postalCode") onChange("zip", value);
              }}
              onResolved={(resolved) => {
                onChange("street", combineStreet(resolved.line1, resolved.line2));
                onChange("city", resolved.city);
                onChange("state", resolved.state);
                onChange("zip", resolved.postalCode);
              }}
              line1Label="Street"
              showLine2={false}
              showCountry
              countryReadOnly
              className="grid gap-3"
              inputClassName={inputClass}
              labelClassName="block text-xs font-medium text-zinc-400"
            />
            <p className="text-[11px] text-zinc-600">US-only selling during launch ({SELLER_SHIP_FROM_COUNTRY_LABEL}).</p>
              </>
            )}
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">Contact phone (required for USPS labels)</span>
              <input
                value={shipPhone}
                onChange={(e) => onChange("phone", e.target.value)}
                className={inputClass}
                autoComplete="tel"
                inputMode="tel"
                placeholder="(555) 123-4567"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            USPS requires your email and phone on shipping labels. Your account email is used automatically.
          </p>
          <p className="text-xs text-zinc-500">
            We verify ship-from addresses with the carrier when you save so shipping labels do not fail at fulfillment.
          </p>
          {saveError ? (
            <p className="mt-3 whitespace-pre-line text-sm font-medium text-amber-200">{saveError}</p>
          ) : null}
          <WizardStepActions
            onBack={onBack}
            backDisabled={saveBusy}
            primary={
              <WizardPrimaryButton type="submit" disabled={saveBusy}>
                {saveBusy ? "Saving…" : phoneOnlyCompletion ? "Save phone" : "Save & continue"}
              </WizardPrimaryButton>
            }
          />
        </form>
      )}
    </WizardCard>
  );
}
