"use client";

import { storeLabelPrintFormat, type SellerLabelPrintFormat } from "@/lib/shippo-label-format";

export const LABEL_SIZE_PURCHASE_DISCLAIMER =
  "Important: Label size is locked at purchase and cannot be changed later. Choose 4×6 only if you have a thermal label printer. Choose Letter for a regular home/office printer. Buying the wrong size means the label will not print correctly and you will need to purchase a new one.";

export function LabelSizePurchaseDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-[11px] leading-snug text-amber-100/95 ${className}`}
      role="note"
    >
      {LABEL_SIZE_PURCHASE_DISCLAIMER}
    </p>
  );
}

export function LabelSizePicker({
  value,
  onChange,
  className = "",
}: {
  value: SellerLabelPrintFormat;
  onChange: (format: SellerLabelPrintFormat) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Label size</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {(
          [
            ["thermal_4x6", "4×6 thermal", "For thermal label printers"],
            ["letter", "Letter (8.5×11)", "For regular home/office printers"],
          ] as const
        ).map(([format, title, hint]) => (
          <button
            key={format}
            type="button"
            onClick={() => {
              onChange(format);
              storeLabelPrintFormat(format);
            }}
            className={`rounded-lg border px-2.5 py-2 text-left transition ${
              value === format
                ? "border-amber-400/55 bg-amber-500/15 text-amber-50"
                : "border-white/[0.08] bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:bg-zinc-800/60"
            }`}
          >
            <p className="text-[11px] font-semibold leading-tight">{title}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-zinc-400">{hint}</p>
          </button>
        ))}
      </div>
      <LabelSizePurchaseDisclaimer className="mt-2" />
    </div>
  );
}
