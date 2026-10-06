"use client";

import { useState } from "react";
import { TRADE_BUYER_PITCH } from "@/lib/trade-trust-copy";

/** Compact selectable pitch with copy button for messaging buyers. */
export function TradeBuyerPitchCard() {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(TRADE_BUYER_PITCH);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mt-6 rounded-3xl border border-white/[0.1] bg-[#0a0a0d]/90 p-6 sm:p-8">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/85">Message a buyer</p>
      <h2 className="font-display mt-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
        Paste-ready trade pitch
      </h2>
      <p className="mt-2 text-sm text-zinc-400">
        Send this so they know exactly how Trade Center works — structured terms, fees, labels, and no escrow on items
        or cash.
      </p>
      <p className="mt-4 select-text rounded-2xl border border-white/[0.08] bg-[#09090c]/75 p-4 text-sm leading-relaxed text-zinc-200">
        {TRADE_BUYER_PITCH}
      </p>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-semibold text-zinc-100 transition hover:border-gold/40 hover:text-gold-bright"
      >
        {copied ? "Copied" : "Copy pitch"}
      </button>
    </section>
  );
}
