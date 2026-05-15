"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type FollowStatus = {
  following: boolean;
  followerCount: number;
  isSelf: boolean;
};

type Variant = "profile" | "overlay" | "inline";

function formatFollowerCount(n: number, variant: Variant): string {
  if (variant === "overlay") {
    return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;
  }
  return n.toLocaleString("en-US");
}

const baseByVariant: Record<Variant, string> = {
  profile:
    "inline-flex h-10 items-center justify-center rounded-full border px-5 text-xs font-semibold transition disabled:opacity-50",
  overlay:
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition disabled:opacity-50",
  inline:
    "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition disabled:opacity-50",
};

const idleByVariant: Record<Variant, string> = {
  profile: "border-white/[0.1] bg-white/[0.03] text-zinc-100 hover:border-gold/35 hover:bg-gold/10 hover:text-gold-bright",
  overlay: "border-gold/40 bg-gold/10 text-gold-bright hover:bg-gold/18",
  inline: "border-white/[0.12] bg-white/[0.04] text-zinc-200 hover:border-gold/30 hover:text-gold-bright",
};

const activeByVariant: Record<Variant, string> = {
  profile: "border-gold/40 bg-gold/15 text-gold-bright",
  overlay: "border-zinc-500/50 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-800",
  inline: "border-gold/35 bg-gold/10 text-gold-bright",
};

type Props = {
  sellerUserId: string;
  variant?: Variant;
  className?: string;
  /** When false, only the Follow / Following control is shown (e.g. cramped toolbars). */
  showFollowerCount?: boolean;
};

export function SellerFollowButton({
  sellerUserId,
  variant = "profile",
  className,
  showFollowerCount = true,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<FollowStatus | null>(null);

  const basePath = `/api/sellers/${encodeURIComponent(sellerUserId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${basePath}/follow-status`, { cache: "no-store" });
      if (!res.ok) {
        setSt(null);
        return;
      }
      const j = (await res.json()) as FollowStatus;
      setSt(j);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    void load();
  }, [load]);

  const returnTo = pathname || "/";

  const onClick = async () => {
    if (status === "unauthenticated" || !session?.user?.id) {
      router.push(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (!st || st.isSelf) return;
    setBusy(true);
    try {
      const next = st.following ? "DELETE" : "POST";
      const res = await fetch(`${basePath}/follow`, { method: next });
      if (res.status === 401) {
        router.push(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      if (!res.ok && res.status !== 409) return;
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!st) {
    return (
      <button
        type="button"
        disabled
        className={`${baseByVariant[variant]} border-white/[0.06] text-zinc-600 ${className ?? ""}`}
      >
        …
      </button>
    );
  }

  if (st.isSelf) {
    return null;
  }

  const showFollowing = st.following && !loading;
  const loadingLabel = variant === "overlay" ? "…" : "Loading";
  const label = loading ? loadingLabel : busy ? "…" : showFollowing ? "Following" : "Follow";
  const style = showFollowing ? activeByVariant[variant] : idleByVariant[variant];

  const countStr = formatFollowerCount(st.followerCount, variant);
  const countClass =
    variant === "overlay"
      ? "tabular-nums text-[9px] font-semibold text-zinc-400"
      : variant === "inline"
        ? "tabular-nums text-[11px] text-zinc-500"
        : "tabular-nums text-xs text-zinc-500";

  if (!showFollowerCount) {
    return (
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => void onClick()}
        className={`${baseByVariant[variant]} ${style} ${className ?? ""}`}
        aria-pressed={showFollowing}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={`inline-flex items-center ${variant === "overlay" ? "gap-1" : "gap-2"} ${className ?? ""}`}>
      <span className={countClass} title={`${st.followerCount.toLocaleString("en-US")} followers`}>
        {variant === "overlay" ? countStr : `${countStr} followers`}
      </span>
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => void onClick()}
        className={`${baseByVariant[variant]} ${style}`}
        aria-pressed={showFollowing}
      >
        {label}
      </button>
    </span>
  );
}
