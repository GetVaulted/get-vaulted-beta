"use client";

import { useState } from "react";
import { OBS_HELP_ARTICLES, OBS_STUDIO, type ObsHelpArticleId } from "@/lib/obs-studio-copy";

export function ObsHelpCenter() {
  const [open, setOpen] = useState<ObsHelpArticleId>("first-setup");

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{OBS_STUDIO.helpCenter}</p>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        <div className="flex shrink-0 flex-wrap gap-2 lg:w-52 lg:flex-col">
          {OBS_HELP_ARTICLES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpen(a.id)}
              className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${
                open === a.id
                  ? "border-gold/35 bg-gold/10 text-gold-bright"
                  : "border-white/10 text-zinc-400 hover:border-white/18 hover:text-zinc-200"
              }`}
            >
              {a.title}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/25 p-4">
          {OBS_HELP_ARTICLES.filter((a) => a.id === open).map((a) => (
            <div key={a.id}>
              <h3 className="font-display text-lg font-bold text-zinc-100">{a.title}</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-400">
                {a.body.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-gold/70">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
