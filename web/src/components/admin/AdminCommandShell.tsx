import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminCommandShell({ title, subtitle, actions, children }: Props) {
  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/70">Get Vaulted Ops</p>
          <h1 className="mt-1 font-display text-2xl font-black tracking-tight text-foreground">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-8">{children}</div>
    </main>
  );
}

export const adminPanelClassName = "rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 backdrop-blur-sm";
export const adminTableClassName =
  "w-full min-w-[720px] border-collapse text-left text-xs [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2.5";
export const adminSelectClassName =
  "rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200";
export const adminButtonPrimaryClassName =
  "rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold-bright transition hover:bg-gold/25 disabled:opacity-50";
export const adminButtonDangerClassName =
  "rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50";

export function AdminStatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-300"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-300"
        : tone === "bad"
          ? "bg-rose-500/10 text-rose-300"
          : "bg-white/[0.06] text-zinc-400";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function formatAdminUsd(value: number | null | undefined, placeholder = "—") {
  if (value == null || !Number.isFinite(value)) return placeholder;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatAdminPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}
