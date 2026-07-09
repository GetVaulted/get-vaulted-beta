"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import { SELLER_HQ_PATH, SELLER_SETUP_PATH } from "@/lib/seller-setup-state";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";

export function AccountProfileSettingsPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const { phase: setupPhase } = useSellerSetupState(status === "authenticated");
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [initialUsername, setInitialUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [usernameEligibility, setUsernameEligibility] = useState<{
    canChange: boolean;
    reason: "lock" | "open_orders" | null;
    lockExpiresAt: string | null;
    canClaimOfficialPlatformUsername?: boolean;
  } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin?returnTo=/account/profile");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/account/profile", { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as {
          user?: { username?: string; name?: string | null; image?: string | null };
          error?: string;
        };
        if (!res.ok || !j.user) {
          if (!cancelled) setError(j.error ?? "Could not load profile.");
          return;
        }
        if (!cancelled) {
          setUsername(j.user.username ?? session?.user?.username ?? "");
          setInitialUsername(j.user.username ?? session?.user?.username ?? "");
          setDisplayName(j.user.name?.trim() ?? "");
          setProfileImage(j.user.image?.trim() || null);
        }
        const usernameRes = await fetch("/api/account/username", { cache: "no-store" });
        if (usernameRes.ok && !cancelled) {
          const usernameBody = (await usernameRes.json()) as {
            canChange?: boolean;
            reason?: "lock" | "open_orders" | null;
            lockExpiresAt?: string | null;
            canClaimOfficialPlatformUsername?: boolean;
          };
          setUsernameEligibility({
            canChange: usernameBody.canChange === true,
            reason: usernameBody.reason ?? null,
            lockExpiresAt: usernameBody.lockExpiresAt ?? null,
            canClaimOfficialPlatformUsername: usernameBody.canClaimOfficialPlatformUsername,
          });
        }
      } catch {
        if (!cancelled) setError("Could not load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.username, status]);

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploadBusy(true);
    try {
      const blob = await compressImageFileToBlob(file);
      const fd = new FormData();
      fd.set("file", blob, "profile.jpg");
      const res = await fetch("/api/uploads/listing-image", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || typeof j.url !== "string") {
        setError(j.error ?? "Could not upload photo.");
        return;
      }
      setProfileImage(j.url);
    } catch {
      setError("Could not upload photo.");
    } finally {
      setUploadBusy(false);
    }
  };

  const onSave = async () => {
    setError(null);
    setSaved(false);
    setSaveBusy(true);
    try {
      const trimmedUsername = username.trim();
      const usernameChanged = trimmedUsername !== initialUsername.trim();
      if (usernameChanged) {
        const canChangeUsername =
          usernameEligibility?.canChange === true ||
          (usernameEligibility?.canClaimOfficialPlatformUsername === true &&
            trimmedUsername.toLowerCase() === "getvaulted");
        if (!canChangeUsername) {
          setError(
            usernameEligibility?.reason === "open_orders"
              ? "You cannot change your username while you have open orders."
              : "Usernames can only be changed once every 60 days.",
          );
          return;
        }
        const usernameRes = await fetch("/api/account/username", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmedUsername }),
        });
        const usernameBody = (await usernameRes.json().catch(() => ({}))) as { error?: string; username?: string };
        if (!usernameRes.ok) {
          setError(usernameBody.error ?? "Could not update username.");
          return;
        }
        if (usernameBody.username) {
          setUsername(usernameBody.username);
          setInitialUsername(usernameBody.username);
        }
      }

      const body: { name?: string; image?: string | null } = {};
      body.name = displayName.trim();
      body.image = profileImage;
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not save profile.");
        return;
      }
      setSaved(true);
      await update();
    } finally {
      setSaveBusy(false);
    }
  };

  const usernameLocked = Boolean(
    usernameEligibility &&
      !usernameEligibility.canChange &&
      !usernameEligibility.canClaimOfficialPlatformUsername,
  );
  const usernameLockHint = (() => {
    if (!usernameEligibility || usernameEligibility.canChange || usernameEligibility.canClaimOfficialPlatformUsername) {
      return null;
    }
    if (usernameEligibility.reason === "open_orders") {
      return "Username locked while you have open orders.";
    }
    if (usernameEligibility.lockExpiresAt) {
      return `Username can be changed again after ${new Date(usernameEligibility.lockExpiresAt).toLocaleDateString()}.`;
    }
    return "Usernames can only be changed once every 60 days.";
  })();

  if (status === "unauthenticated") return null;

  if (status === "loading" || loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-[#030303] px-4 py-24 text-sm text-zinc-500">
        Loading…
      </main>
    );
  }

  const sellerSettingsHref = setupPhase === "ready" ? SELLER_HQ_PATH : SELLER_SETUP_PATH;
  const profileHref = `/seller/${encodeURIComponent(username || session?.user?.username || "")}`;
  const initials =
    (username || session?.user?.username || "?")
      .slice(0, 2)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 2) || "?";

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-lg px-4 py-8 sm:py-10">
        <Link
          href="/account"
          className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 transition hover:text-gold-bright"
        >
          ← My Account
        </Link>

        <header className="mt-5 border-b border-white/[0.08] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Profile</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground">Edit profile</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Update what buyers see on your public storefront. Seller payouts and shipping are separate.
          </p>
        </header>

        <div className="mt-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#121218]">
              {profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-display text-xl font-black text-gold-bright/90">
                  {initials}
                </span>
              )}
            </div>
            <div>
              <button
                type="button"
                disabled={uploadBusy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 px-4 text-xs font-semibold text-zinc-200 transition hover:border-gold/35 disabled:opacity-50"
              >
                {uploadBusy ? "Uploading…" : profileImage ? "Change photo" : "Add photo"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={usernameLocked}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-gold/35 disabled:opacity-55"
            />
            {usernameEligibility?.canClaimOfficialPlatformUsername ? (
              <p className="mt-1 text-xs text-zinc-500">
                Platform admin accounts can claim the official <span className="text-zinc-300">@getvaulted</span> username.
              </p>
            ) : null}
            {usernameLockHint ? <p className="mt-1 text-xs text-zinc-500">{usernameLockHint}</p> : null}
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Shown on your public profile"
              className="mt-1 w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-gold/35"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100">
              Profile saved.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void onSave()}
              className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-50"
            >
              {saveBusy ? "Saving…" : "Save profile"}
            </button>
            <Link
              href={profileHref}
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 px-5 text-sm font-medium text-zinc-300 transition hover:border-gold/35 hover:text-gold-bright"
            >
              View public profile
            </Link>
          </div>
        </div>

        <section className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-sm font-semibold text-zinc-200">Seller settings</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Payouts, ship-from address, and live selling setup live under seller tools — not here.
          </p>
          <Link
            href={sellerSettingsHref}
            className="mt-3 inline-flex text-xs font-semibold text-gold-bright hover:underline"
          >
            {setupPhase === "ready" ? "Open Seller HQ →" : "Start seller setup →"}
          </Link>
        </section>
      </div>
    </main>
  );
}
