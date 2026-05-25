import Link from "next/link";

export function SellerAgreementField({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-left">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[#c9a227]"
      />
      <span className="text-sm leading-relaxed text-zinc-300">
        I agree to the Get Vaulted{" "}
        <Link href="/terms#seller-obligations" className="font-semibold text-gold-bright hover:underline">
          seller obligations
        </Link>
        ,{" "}
        <Link href="/terms" className="font-semibold text-gold-bright hover:underline">
          Terms of Service
        </Link>
        , and{" "}
        <Link href="/community-guidelines" className="font-semibold text-gold-bright hover:underline">
          Community Guidelines
        </Link>
        .
      </span>
    </label>
  );
}
