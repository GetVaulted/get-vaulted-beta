"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import {
  AdminCommandShell,
  adminButtonPrimaryClassName,
  adminPanelClassName,
} from "@/components/admin/AdminCommandShell";
import {
  APP_BANNER_BODY_MAX,
  APP_BANNER_CTA_MAX,
  APP_BANNER_DISMISS_KEY_MAX,
  APP_BANNER_HREF_MAX,
  APP_BANNER_TITLE_MAX,
  type PlatformAppBannerDTO,
} from "@/lib/platform-app-banner-shared";
import { uploadAppBannerImageBlob } from "@/lib/upload-app-banner-image-client";

const inputClassName =
  "mt-1.5 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2.5 text-sm text-zinc-100 outline-none ring-gold/30 focus:border-gold/40 focus:ring-2";

export function AdminAppBannerPage() {
  const [banner, setBanner] = useState<PlatformAppBannerDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [href, setHref] = useState("");
  const [dismissKey, setDismissKey] = useState("referral-v1");
  const [uploadingImage, setUploadingImage] = useState(false);

  const applyBanner = useCallback((b: PlatformAppBannerDTO) => {
    setBanner(b);
    setEnabled(b.enabled);
    setTitle(b.title);
    setBody(b.body);
    setImageUrl(b.imageUrl);
    setCtaLabel(b.ctaLabel);
    setHref(b.href);
    setDismissKey(b.dismissKey);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/app-banner", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        banner?: PlatformAppBannerDTO;
        error?: string;
      };
      if (!res.ok || !json.banner) {
        setError(typeof json.error === "string" ? json.error : "Could not load banner.");
        return;
      }
      applyBanner(json.banner);
    } finally {
      setLoading(false);
    }
  }, [applyBanner]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/app-banner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          title: title.trim(),
          body: body.trim(),
          imageUrl: imageUrl.trim(),
          ctaLabel: ctaLabel.trim(),
          href: href.trim(),
          dismissKey: dismissKey.trim() || "default",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        banner?: PlatformAppBannerDTO;
        error?: string;
      };
      if (!res.ok || !json.banner) {
        setError(typeof json.error === "string" ? json.error : "Could not save.");
        return;
      }
      applyBanner(json.banner);
      setSuccess(enabled ? "Banner is live on the app home screen." : "Banner saved (currently off).");
    } finally {
      setSaving(false);
    }
  };

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploadingImage(true);
    try {
      const url = await uploadAppBannerImageBlob(file, file.name);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
  };

  const fillReferralPreset = () => {
    setEnabled(true);
    setTitle("Invite friends. Earn credit.");
    setBody("Share your referral link — when friends join and buy, you earn store credit.");
    setCtaLabel("Get my link");
    setHref("/account/referrals");
    setDismissKey(`referral-${Date.now().toString(36)}`);
    setSuccess(null);
    setError(null);
  };

  return (
    <AdminCommandShell
      title="Home banner"
      subtitle="Remote promo on the app front page — edit anytime, no rebuild. Great for referral campaigns."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className={adminPanelClassName}>
          {loading && !banner ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <div className="space-y-4">
              <label className="flex items-center gap-3 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="size-4 rounded border-white/20 bg-black text-gold"
                />
                Show on app home
              </label>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Title ({title.length}/{APP_BANNER_TITLE_MAX})
                </label>
                <input
                  className={inputClassName}
                  value={title}
                  maxLength={APP_BANNER_TITLE_MAX}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Invite friends. Earn credit."
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Body ({body.length}/{APP_BANNER_BODY_MAX})
                </label>
                <textarea
                  className={`${inputClassName} min-h-[96px] resize-y`}
                  value={body}
                  maxLength={APP_BANNER_BODY_MAX}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Share your referral link…"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Promo image (optional)
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                    />
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    <label className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-gold/30 hover:text-gold-bright">
                      {uploadingImage ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={uploadingImage}
                        onChange={(e) => void onPickImage(e)}
                      />
                    </label>
                    {imageUrl ? (
                      <button
                        type="button"
                        className="text-left text-xs font-semibold text-zinc-500 hover:text-rose-400"
                        onClick={() => setImageUrl("")}
                      >
                        Remove image
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-xs text-zinc-600">JPG, PNG, or WebP, up to 8MB. Leave empty for the text-only look.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Button label ({ctaLabel.length}/{APP_BANNER_CTA_MAX})
                  </label>
                  <input
                    className={inputClassName}
                    value={ctaLabel}
                    maxLength={APP_BANNER_CTA_MAX}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder="Get my link"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Link ({href.length}/{APP_BANNER_HREF_MAX})
                  </label>
                  <input
                    className={inputClassName}
                    value={href}
                    maxLength={APP_BANNER_HREF_MAX}
                    onChange={(e) => setHref(e.target.value)}
                    placeholder="/account/referrals"
                  />
                  <p className="mt-1 text-xs text-zinc-600">
                    Use <code className="text-zinc-400">/account/referrals</code> for Vault Wallet referral
                    credit on mobile.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Dismiss key ({dismissKey.length}/{APP_BANNER_DISMISS_KEY_MAX})
                </label>
                <input
                  className={inputClassName}
                  value={dismissKey}
                  maxLength={APP_BANNER_DISMISS_KEY_MAX}
                  onChange={(e) => setDismissKey(e.target.value)}
                  placeholder="referral-v1"
                />
                <p className="mt-1 text-xs text-zinc-600">
                  Change this when you want the banner to reappear for people who dismissed an older version.
                </p>
              </div>

              {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  className={adminButtonPrimaryClassName}
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save banner"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:border-gold/30 hover:text-gold-bright"
                  onClick={fillReferralPreset}
                >
                  Fill referral preset
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className={adminPanelClassName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preview</p>
          <div className="mt-3 rounded-xl border border-gold/25 bg-gradient-to-br from-gold/15 via-[#14110a] to-[#0c0c10] p-4">
            {(title.trim() || body.trim() || imageUrl) && enabled ? (
              <>
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="mb-3 aspect-[16/9] w-full rounded-lg border border-white/10 object-cover"
                  />
                ) : null}
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">Promo</p>
                {title.trim() ? (
                  <p className="mt-2 text-base font-bold text-zinc-50">{title.trim()}</p>
                ) : null}
                {body.trim() ? <p className="mt-1 text-sm text-zinc-400">{body.trim()}</p> : null}
                {ctaLabel.trim() ? (
                  <span className="mt-3 inline-flex rounded-full bg-gold px-3 py-1.5 text-xs font-bold text-black">
                    {ctaLabel.trim()}
                  </span>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                {enabled ? "Add a title, body, or image to preview." : "Banner is off — nothing shows on home."}
              </p>
            )}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-zinc-600">
            After the next app build that includes this feature, toggling Save here updates the live home
            screen within about a minute — no EAS rebuild for copy changes.
          </p>
        </aside>
      </div>
    </AdminCommandShell>
  );
}
