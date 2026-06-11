"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { BuyerWalletReadinessBanner } from "@/components/account/BuyerWalletReadinessBanner";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";
import {
  buyerWalletStatusLabel,
  type BuyerWalletReadinessSnapshot,
} from "@/lib/buyer-wallet-readiness-display";
import {
  SELLER_HQ_PATH,
  SELLER_SETUP_PATH,
  sellerSetupMenuLabel,
} from "@/lib/seller-setup-state";

type HubTile = {
  href: string;
  title: string;
  description: string;
  accent?: boolean;
};

function HubCard({ tile }: { tile: HubTile }) {
  return (
    <Link
      href={tile.href}
      className={`group rounded-2xl border p-4 transition sm:p-5 ${
        tile.accent
          ? "border-gold/30 bg-gold/10 hover:border-gold/45 hover:bg-gold/15"
          : "border-white/[0.08] bg-zinc-950/60 hover:border-white/15 hover:bg-zinc-950/80"
      }`}
    >
      <p className={`text-sm font-semibold ${tile.accent ? "text-gold-bright" : "text-zinc-100"}`}>{tile.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 group-hover:text-zinc-400">{tile.description}</p>
    </Link>
  );
}

export function MyAccountPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { phase: setupPhase } = useSellerSetupState(status === "authenticated");
  const [walletSnapshot, setWalletSnapshot] = useState<BuyerWalletReadinessSnapshot | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin?returnTo=/account");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/account/wallet-readiness", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as BuyerWalletReadinessSnapshot;
      if (!cancelled) {
        setWalletSnapshot({
          paymentReady: j.paymentReady === true,
          shippingReady: j.shippingReady === true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "unauthenticated") {
    return null;
  }

  if (status === "loading") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  const username = session?.user?.username ?? "";
  const profileHref = `/seller/${encodeURIComponent(username)}`;

  const activityTiles: HubTile[] = [
    {
      href: "/account/notifications",
      title: "Notifications",
      description: "Order updates, bids, and account alerts.",
    },
    {
      href: "/account/messages",
      title: "Messages",
      description: "Buyer and seller conversations.",
    },
    {
      href: "/account/orders",
      title: "Orders",
      description: "Purchases you have made on Get Vaulted.",
    },
    {
      href: "/account/watchlist",
      title: "Watchlist",
      description: "Listings and auctions you are tracking.",
    },
    {
      href: "/account/following",
      title: "Following",
      description: "Sellers and hosts you follow.",
    },
  ];

  const sellerTiles: HubTile[] =
    setupPhase === "ready"
      ? [
          {
            href: SELLER_HQ_PATH,
            title: "Seller HQ",
            description: "Listings, sales, live shows, and seller overview.",
            accent: true,
          },
          {
            href: "/account/listings",
            title: "My Listings",
            description: "Draft, active, and sold inventory.",
          },
          {
            href: "/account/sales",
            title: "Sales",
            description: "Orders to fulfill and recent sales.",
          },
          {
            href: "/account/offers",
            title: "Offers",
            description: "Incoming and outgoing offers.",
          },
          {
            href: "/seller/live",
            title: "Go Live",
            description: "Schedule or start a live show.",
            accent: true,
          },
        ]
      : [
          {
            href: SELLER_SETUP_PATH,
            title: setupPhase === "loading" ? "Start Seller Setup" : sellerSetupMenuLabel(setupPhase),
            description: "Connect payouts, add shipping, and unlock Seller HQ.",
            accent: true,
          },
        ];

  const accountTiles: HubTile[] = [
    {
      href: "/account/payment-methods",
      title: "Wallet",
      description: walletSnapshot
        ? buyerWalletStatusLabel(walletSnapshot)
        : "Saved cards and shipping for live + checkout.",
      accent: walletSnapshot ? !walletSnapshot.paymentReady || !walletSnapshot.shippingReady : false,
    },
    {
      href: profileHref,
      title: "View Profile",
      description: "Your public storefront — what other users see.",
    },
    {
      href: setupPhase === "ready" ? SELLER_HQ_PATH : SELLER_SETUP_PATH,
      title: "Account Settings",
      description: "Shipping address, payouts, and seller preferences.",
    },
    {
      href: "/account/delete",
      title: "Delete account",
      description: "Permanently delete your account and sign out.",
    },
  ];

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Private account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">My Account</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Your control center for purchases, wallet, messages, and seller tools — separate from your public profile.
          </p>
        </header>

        <div className="mt-6">
          <BuyerWalletReadinessBanner />
        </div>

        <section className="mt-8">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Activity</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activityTiles.map((tile) => (
              <HubCard key={tile.href} tile={tile} />
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Selling</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sellerTiles.map((tile) => (
              <HubCard key={`${tile.href}-${tile.title}`} tile={tile} />
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account management</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accountTiles.map((tile) => (
              <HubCard key={`${tile.href}-${tile.title}`} tile={tile} />
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-zinc-600">
          Need help?{" "}
          <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-zinc-400 hover:text-gold-bright">
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}
