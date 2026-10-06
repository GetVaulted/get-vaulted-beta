"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import {
  PROFILE_BIO_MAX,
  PROFILE_LINK_KEYS,
  PROFILE_LINK_LABELS,
  type ProfileLinkKey,
} from "@/lib/seller-profile-fields";
import { SELLER_HQ_PATH, SELLER_SETUP_PATH } from "@/lib/seller-setup-state";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";

const LINK_PLACEHOLDERS: Record<ProfileLinkKey, string> = {
  instagram: "@yourhandle",
  tiktok: "@yourhandle",
  youtube: "@yourchannel",
  x: "@yourhandle",
  website: "yoursite.com",
};

export function AccountProfileSettingsPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const { phase: setupPhase } = useSellerSetupState(status === "authenticated");
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [initialUsername, setInitialUsername] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<Partial<Record<ProfileLinkKey, string>>>({});
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
          user?: {
            username?: string;
            name?: string | null;
            image?: string | null;
            bio?: string | null;
            bannerUrl?: string | null;
            links?: Partial<Record<ProfileLinkKey, string>>;
          };
          error?: string;
        };
        if (!res.ok || !j.user) {
          if (!cancelled) setError(j.error ?? "Could not load profile.");
          return;
        }
        if (!cancelled) {
          setUsername(j.user.username ?? session?.user?.username ?? "");
          setInitialUsername(j.user.username ?? session?.user?.username ?? "");
          setProfileImage(j.user.image?.trim() || null);
          setBannerUrl(j.user.bannerUrl?.trim() || null);
          setBio(j.user.bio ?? "");
          setLinks(j.user.links ?? {});
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
      const res = await fetch("/api/uploads/avatar", { method: "POST", body: fd });
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

  const onPickBanner = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBannerBusy(true);
    try {
      const blob = await compressImageFileToBlob(file);
      const fd = new FormData();
      fd.set("file", blob, "banner.jpg");
      const res = await fetch("/api/uploads/avatar?kind=banner", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || typeof j.url !== "string") {
        setError(j.error ?? "Could not upload banner.");
        return;
      }
      setBannerUrl(j.url);
    } catch {
      setError("Could not upload banner.");
    } finally {
      setBannerBusy(false);
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

      const body = {
        image: profileImage,
        bio: bio.trim() ? bio : null,
        bannerUrl,
        links,
      };
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { bio?: string | null; bannerUrl?: string | null; links?: Partial<Record<ProfileLinkKey, string>> };
      };
      if (!res.ok) {
        setError(j.error ?? "Could not save profile.");
        return;
      }
      if (j.user) {
        setBio(j.user.bio ?? "");
        setBannerUrl(j.user.bannerUrl?.trim() || null);
        setLinks(j.user.links ?? {});
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
            Your username is your public name and @handle. Seller payouts and shipping are separate.
          </p>
        </header>

        <div className="mt-6 space-y-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Banner</span>
            <div className="relative mt-1 h-28 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#121218] sm:h-32">
              {bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                  No banner yet
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bannerBusy}
                onClick={() => bannerFileRef.current?.click()}
                className="inline-flex h-9 items-center justify-center rounded-full border border-white/12 px-4 text-xs font-semibold text-zinc-200 transition hover:border-gold/35 disabled:opacity-50"
              >
                {bannerBusy ? "Uploading…" : bannerUrl ? "Change banner" : "Add banner"}
              </button>
              {bannerUrl ? (
                <button
                  type="button"
                  onClick={() => setBannerUrl(null)}
                  className="inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold text-zinc-500 transition hover:text-zinc-300"
                >
                  Remove
                </button>
              ) : null}
              <input
                ref={bannerFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPickBanner(e.target.files?.[0] ?? null)}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">Wide photos work best. Shown at the top of your public profile.</p>
          </div>

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
            <p className="mt-1 text-xs text-zinc-500">
              Shown everywhere as @{username.trim() || "username"} — including mentions.
            </p>
            {usernameEligibility?.canClaimOfficialPlatformUsername ? (
              <p className="mt-1 text-xs text-zinc-500">
                Platform admin accounts can claim the official <span className="text-zinc-300">@getvaulted</span> username.
              </p>
            ) : null}
            {usernameLockHint ? <p className="mt-1 text-xs text-zinc-500">{usernameLockHint}</p> : null}
          </label>

          <label className="block" htmlFor="profile-bio">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Bio</span>
            <textarea
              id="profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, PROFILE_BIO_MAX))}
              rows={3}
              maxLength={PROFILE_BIO_MAX}
              placeholder="What do you sell and break? Where are you based?"
              className="mt-1 w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/35"
            />
            <p className="mt-1 text-right text-xs tabular-nums text-zinc-500">
              {Array.from(bio).length}/{PROFILE_BIO_MAX}
            </p>
          </label>

          <fieldset className="space-y-3">
            <legend className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Links</legend>
            {PROFILE_LINK_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3">
                <label htmlFor={`profile-link-${key}`} className="w-20 shrink-0 text-xs font-medium text-zinc-400">
                  {PROFILE_LINK_LABELS[key]}
                </label>
                <input
                  id={`profile-link-${key}`}
                  value={links[key] ?? ""}
                  onChange={(e) => setLinks((prev) => ({ ...prev, [key]: e.target.value }))}
                  inputMode={key === "website" ? "url" : "text"}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={LINK_PLACEHOLDERS[key]}
                  className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/35"
                />
              </div>
            ))}
            <p className="text-xs text-zinc-500">Handles or full links. Only the networks above are shown.</p>
          </fieldset>

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
