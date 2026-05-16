export type VaultMode =
  | "auction_night"
  | "vault_drop"
  | "break_room"
  | "marketplace_showcase"
  | "collector_lounge";

export const VAULT_MODE_META: Record<
  VaultMode,
  { label: string; description: string; accent: string; glow: string }
> = {
  auction_night: {
    label: "Auction Night",
    description: "Gold pulse · bid-forward overlays",
    accent: "from-amber-200/90 via-yellow-400/80 to-amber-600/90",
    glow: "shadow-[0_0_40px_-8px_rgba(251,191,36,0.45)]",
  },
  vault_drop: {
    label: "Vault Drop",
    description: "Cool tension · drop countdown emphasis",
    accent: "from-cyan-200/85 via-sky-400/75 to-indigo-600/85",
    glow: "shadow-[0_0_36px_-10px_rgba(34,211,238,0.4)]",
  },
  break_room: {
    label: "Break Room",
    description: "Violet arena energy · team-forward",
    accent: "from-violet-200/85 via-fuchsia-400/70 to-violet-900/80",
    glow: "shadow-[0_0_38px_-10px_rgba(167,139,250,0.45)]",
  },
  marketplace_showcase: {
    label: "Marketplace Showcase",
    description: "Emerald trust · catalog clarity",
    accent: "from-emerald-200/85 via-teal-400/75 to-emerald-900/80",
    glow: "shadow-[0_0_34px_-10px_rgba(52,211,153,0.38)]",
  },
  collector_lounge: {
    label: "Collector Lounge",
    description: "Warm copper · conversational luxury",
    accent: "from-orange-200/80 via-amber-500/70 to-rose-900/75",
    glow: "shadow-[0_0_36px_-10px_rgba(251,146,60,0.35)]",
  },
};

export function vaultModeRootClass(mode: VaultMode): string {
  switch (mode) {
    case "vault_drop":
      return "[--vault-chrome-tint:rgba(6,182,212,0.12)] [--vault-pulse:rgba(34,211,238,0.35)]";
    case "break_room":
      return "[--vault-chrome-tint:rgba(139,92,246,0.14)] [--vault-pulse:rgba(167,139,250,0.38)]";
    case "marketplace_showcase":
      return "[--vault-chrome-tint:rgba(16,185,129,0.12)] [--vault-pulse:rgba(52,211,153,0.32)]";
    case "collector_lounge":
      return "[--vault-chrome-tint:rgba(249,115,22,0.11)] [--vault-pulse:rgba(251,146,60,0.3)]";
    case "auction_night":
    default:
      return "[--vault-chrome-tint:rgba(245,158,11,0.14)] [--vault-pulse:rgba(251,191,36,0.4)]";
  }
}
