"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";
import { UserReportLink } from "@/components/trust/TrustReportLinks";

type SellerProfileActionsProps = {
  sellerId: string;
  sellerUsername: string;
  isOwnShop?: boolean;
};

export function SellerProfileActions({ sellerId, sellerUsername, isOwnShop = false }: SellerProfileActionsProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [messageHint, setMessageHint] = useState(false);

  const returnTo = pathname || `/seller/${encodeURIComponent(sellerUsername)}`;

  if (isOwnShop) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href="/account/seller/setup"
          className="inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-5 text-xs font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
        >
          Edit profile & settings
        </Link>
        <Link
          href="/account"
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] px-5 text-xs font-medium text-zinc-400 transition hover:border-white/15 hover:text-zinc-200"
        >
          My Account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <SellerFollowButton sellerUserId={sellerId} variant="profile" />
      <button
        type="button"
        onClick={() => {
          if (status === "unauthenticated" || !session?.user?.id) {
            router.push(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
            return;
          }
          setMessageHint((v) => !v);
        }}
        className="inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-5 text-xs font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
      >
        Message seller
      </button>
      {messageHint ? (
        <p className="text-[11px] leading-snug text-zinc-500 sm:max-w-xs">
          To start a thread, open one of @{sellerUsername}&apos;s listings and use{" "}
          <span className="font-medium text-zinc-400">Ask seller</span> or{" "}
          <span className="font-medium text-zinc-400">Message</span> from checkout flows.
        </p>
      ) : null}
      <Link
        href="/marketplace"
        className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] px-5 text-xs font-medium text-zinc-400 transition hover:border-white/15 hover:text-zinc-200"
      >
        Browse marketplace
      </Link>
      <UserReportLink userId={sellerId} className="inline-flex h-10 items-center px-2" />
    </div>
  );
}
