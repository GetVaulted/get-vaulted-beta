/** Shared Vault Reveal wheel payload — broadcast to every client in the room. */

export type VaultRevealSpinKind = "giveaway" | "break_pyt" | "random_reveal";

export type VaultRevealSpinPayload = {
  spinId: string;
  kind: VaultRevealSpinKind;
  title: string;
  labels: string[];
  winnerIndex: number;
  winnerLabel: string;
  durationMs: number;
  referenceId?: string;
  assignments?: { order: number; label: string }[];
  /** NFL abbr per label segment (random team reveals). */
  segmentAbbrs?: string[];
  /** Buyer who won this random spot (shown on wheel result). */
  buyerUsername?: string;
};

export const VAULT_REVEAL_DEFAULT_DURATION_MS = 2400;
/** How long the winning result stays visible after the spin stops (~4s total with default spin). */
export const VAULT_REVEAL_RESULT_HOLD_MS = 1600;
export const VAULT_REVEAL_TOTAL_DISPLAY_MS =
  VAULT_REVEAL_DEFAULT_DURATION_MS + VAULT_REVEAL_RESULT_HOLD_MS;

/** Giveaway Vault Seal reveal (legacy — wheel is used for all kinds in the UI). */
export const VAULT_SEAL_GLOW_MS = 400;
export const VAULT_SEAL_BREAK_MS = 600;
export const VAULT_SEAL_WINNER_HOLD_MS = 1600;
export const VAULT_SEAL_TOTAL_MS = VAULT_SEAL_GLOW_MS + VAULT_SEAL_BREAK_MS + VAULT_SEAL_WINNER_HOLD_MS;

export function isVaultSealRevealKind(kind: VaultRevealSpinKind): boolean {
  return kind === "giveaway" || kind === "break_pyt" || kind === "random_reveal";
}

export function vaultSealMetaLine(spin: VaultRevealSpinPayload): string {
  const n = spin.labels.length;
  if (spin.kind === "giveaway") {
    return `${n} ${n === 1 ? "entry" : "entries"} · verified draw`;
  }
  if (spin.kind === "random_reveal") {
    return `${n} remaining · verified reveal`;
  }
  return `${n} ${n === 1 ? "spot" : "spots"} · verified randomizer`;
}

export type VaultSealWinnerCopy = {
  kicker: string;
  primary: string;
  sub?: string;
  detail?: string;
};

function formatWinnerHandle(label: string): string {
  const bare = label.trim().replace(/^@/, "");
  return bare ? `@${bare}` : "@winner";
}

export function vaultSealWinnerCopy(spin: VaultRevealSpinPayload): VaultSealWinnerCopy {
  const winner = spin.winnerLabel.trim();
  const buyer = spin.buyerUsername?.trim().replace(/^@/, "");

  if (spin.kind === "giveaway") {
    return {
      kicker: "Winner",
      primary: formatWinnerHandle(spin.winnerLabel),
      sub: "Takes home",
      detail: spin.title,
    };
  }
  if (spin.kind === "random_reveal") {
    const left = Math.max(0, spin.labels.length - 1);
    return {
      kicker: "Your team",
      primary: winner || "—",
      sub: buyer ? `@${buyer}` : undefined,
      detail:
        left > 0
          ? `${left} ${left === 1 ? "spot" : "spots"} left in the pool`
          : "Final spot revealed",
    };
  }
  return {
    kicker: "First pick",
    primary: winner || "—",
    sub: spin.assignments?.length ? `${spin.assignments.length} spots randomized` : "Assignments locked",
  };
}

export function landingRotationDeg(winnerIndex: number, total: number, extraSpins = 5): number {
  if (total <= 0) return 0;
  const idx = Math.max(0, Math.min(winnerIndex, total - 1));
  const segment = 360 / total;
  const center = idx * segment + segment / 2;
  return extraSpins * 360 + (360 - center);
}

export function parseVaultRevealSpinPayload(raw: unknown): VaultRevealSpinPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const spin = (o.spin ?? o) as Record<string, unknown>;
  const labels = Array.isArray(spin.labels)
    ? spin.labels.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    : [];
  if (labels.length === 0) return null;
  const winnerIndex = typeof spin.winnerIndex === "number" ? spin.winnerIndex : 0;
  const spinId = typeof spin.spinId === "string" ? spin.spinId : typeof o.eventId === "string" ? o.eventId : "";
  if (!spinId) return null;
  const kind =
    spin.kind === "break_pyt"
      ? "break_pyt"
      : spin.kind === "random_reveal"
        ? "random_reveal"
        : "giveaway";
  return {
    spinId,
    kind,
    title:
      typeof spin.title === "string"
        ? spin.title
        : kind === "random_reveal"
          ? "Random reveal"
          : kind === "break_pyt"
            ? "PYT randomizer"
            : "Giveaway",
    labels,
    winnerIndex: Math.max(0, Math.min(winnerIndex, labels.length - 1)),
    winnerLabel: typeof spin.winnerLabel === "string" ? spin.winnerLabel : labels[winnerIndex] ?? "",
    durationMs:
      typeof spin.durationMs === "number" && spin.durationMs > 0
        ? spin.durationMs
        : VAULT_REVEAL_DEFAULT_DURATION_MS,
    referenceId: typeof spin.referenceId === "string" ? spin.referenceId : undefined,
    segmentAbbrs: Array.isArray(spin.segmentAbbrs)
      ? spin.segmentAbbrs.filter((a): a is string => typeof a === "string")
      : undefined,
    buyerUsername: typeof spin.buyerUsername === "string" ? spin.buyerUsername : undefined,
    assignments: Array.isArray(spin.assignments)
      ? spin.assignments
          .filter((a): a is { order: number; label: string } => {
            return (
              !!a &&
              typeof a === "object" &&
              typeof (a as { order?: unknown }).order === "number" &&
              typeof (a as { label?: unknown }).label === "string"
            );
          })
          .map((a) => ({ order: a.order, label: a.label }))
      : undefined,
  };
}
