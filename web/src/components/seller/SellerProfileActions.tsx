"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { AskSellerModal } from "@/components/marketplace/AskSellerModal";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";
import { UserReportLink } from "@/components/trust/TrustReportLinks";

type SellerProfileActionsProps = {
  sellerId: string;
  sellerUsername: string;
  isOwnShop?: boolean;
  messageListing?: { id: string; title: string } | null;
};

export function SellerProfileActions({
  sellerId,
  sellerUsername,
  isOwnShop = false,
  messageListing = null,
}: SellerProfileActionsProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [askOpen, setAskOpen] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const returnTo = pathname || `/seller/${encodeURIComponent(sellerUsername)}`;

  const handleAskSubmit = async (text: string) => {
    const payload = messageListing?.id
      ? { listingId: messageListing.id, body: text }
      : { recipientUserId: sellerId, body: text };
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; threadId?: string; inbox?: string };
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Message could not be sent.");
    }
    if (typeof data.threadId !== "string") {
      throw new Error("Unexpected response.");
    }
    window.dispatchEvent(new Event("gv-messages-updated"));
    router.push(`/account/messages/${encodeURIComponent(data.threadId)}`);
  };

  const openMessageSeller = () => {
    setMessageError(null);
    if (status === "unauthenticated" || !session?.user?.id) {
      router.push(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setAskOpen(true);
  };

  if (isOwnShop) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href="/account/profile"
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
        onClick={openMessageSeller}
        className="inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-5 text-xs font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
      >
        Message
      </button>
      {messageError ? (
        <p className="text-[11px] leading-snug text-amber-200/90 sm:max-w-xs">{messageError}</p>
      ) : null}
      <Link
        href="/marketplace"
        className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] px-5 text-xs font-medium text-zinc-400 transition hover:border-white/15 hover:text-zinc-200"
      >
        Browse marketplace
      </Link>
      <UserReportLink userId={sellerId} className="inline-flex h-10 items-center px-2" />
      <AskSellerModal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        listingTitle={messageListing?.title ?? "Direct message from profile"}
        sellerUsername={sellerUsername}
        onSubmit={handleAskSubmit}
      />
    </div>
  );
}
