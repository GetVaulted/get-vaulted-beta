import { googlePlayUrl, iosAppStoreUrl } from "@/lib/app-store-links";

type AppDownloadBadgesProps = {
  className?: string;
  size?: "default" | "large";
};

function BadgeShell({
  children,
  href,
  label,
  large,
}: {
  children: React.ReactNode;
  href: string | null;
  label: string;
  large: boolean;
}) {
  const base =
    "inline-flex min-w-[10.5rem] items-center gap-3 rounded-xl border border-white/15 bg-[#0a0a0d] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition";
  const size = large ? "min-h-[3.25rem] py-3" : "min-h-[2.75rem] py-2.5";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={`${base} ${size} hover:border-gold/35 hover:bg-[#101014]`}
      >
        {children}
      </a>
    );
  }

  return (
    <span
      aria-label={`${label} — coming soon`}
      title="Coming soon"
      className={`${base} ${size} cursor-default opacity-75`}
    >
      {children}
    </span>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.89-1.96 1.58-3.088 1.48-.15-1.09.402-2.248 1.033-3.01.763-.92 2.09-1.6 3.232-1.55zM20.64 17.07c-.577 1.32-1.27 2.58-2.28 3.72-1.01 1.14-2.19 2.41-3.77 2.43-1.48.02-1.95-.87-3.64-.87-1.69 0-2.22.85-3.62.89-1.46.04-2.57-1.47-3.48-2.61-1.88-2.43-3.32-6.87-1.41-9.87 1.34-2.17 3.71-3.54 6.29-3.58 1.56-.03 3.03 1.05 3.98 1.05.95 0 2.73-1.3 4.6-1.11.78.03 2.97.32 4.37 2.4-.11.07-2.61 1.52-2.58 4.53.03 3.58 3.13 4.77 3.17 4.79-.03.1-.5 1.71-1.67 3.38z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.609 1.814 13.792 12 3.61 22.186a1.403 1.403 0 0 1-2.18-1.166V3.98a1.403 1.403 0 0 1 2.18-1.166zm5.404 10.893 7.845 4.546-7.845-4.546v-9.09l7.845 4.545-7.845 4.545v-.455z" />
    </svg>
  );
}

export function AppDownloadBadges({ className, size = "default" }: AppDownloadBadgesProps) {
  const large = size === "large";
  const ios = iosAppStoreUrl();
  const android = googlePlayUrl();

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      <BadgeShell href={ios} label="Download on the App Store" large={large}>
        <AppleIcon className={`shrink-0 text-foreground ${large ? "size-7" : "size-6"}`} />
        <span className="text-left leading-tight">
          <span className="block text-[9px] uppercase tracking-wide text-zinc-400">Download on the</span>
          <span className={`block font-semibold text-foreground ${large ? "text-sm" : "text-[13px]"}`}>
            App Store
          </span>
          {!ios ? <span className="block text-[9px] text-gold-bright/80">Coming soon</span> : null}
        </span>
      </BadgeShell>

      <BadgeShell href={android} label="Get it on Google Play" large={large}>
        <PlayIcon className={`shrink-0 text-foreground ${large ? "size-7" : "size-6"}`} />
        <span className="text-left leading-tight">
          <span className="block text-[9px] uppercase tracking-wide text-zinc-400">Get it on</span>
          <span className={`block font-semibold text-foreground ${large ? "text-sm" : "text-[13px]"}`}>
            Google Play
          </span>
          {!android ? <span className="block text-[9px] text-gold-bright/80">Coming soon</span> : null}
        </span>
      </BadgeShell>
    </div>
  );
}
