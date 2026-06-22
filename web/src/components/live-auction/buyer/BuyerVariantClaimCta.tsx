"use client";

type BuyerVariantClaimCtaProps = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
};

/** Opens LiveVariantSelectionSheet — same CTA as mobile live feed. */
export function BuyerVariantClaimCta({ label, disabled, onClick, className }: BuyerVariantClaimCtaProps) {
  return (
    <button
      type="button"
      data-testid="live-variant-claim-button"
      disabled={disabled}
      onClick={onClick}
      className={
        className ??
        "min-h-10 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright px-3 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_22px_-8px_rgba(212,175,55,0.55)] transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
      }
    >
      {label}
    </button>
  );
}
