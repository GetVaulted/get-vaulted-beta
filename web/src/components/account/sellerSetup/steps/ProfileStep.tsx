import { useRef, useState } from "react";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import {
  WizardCard,
  WizardPrimaryButton,
  WizardSecondaryButton,
  WizardStepActions,
} from "@/components/account/sellerSetup/WizardShell";

export function ProfileStep({
  displayName,
  imageUrl,
  saveBusy,
  saveError,
  onBack,
  onDisplayNameChange,
  onImageChange,
  onSave,
  onSkip,
}: {
  displayName: string;
  imageUrl: string | null;
  saveBusy: boolean;
  saveError: string | null;
  onBack: () => void;
  onDisplayNameChange: (value: string) => void;
  onImageChange: (url: string) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      const blob = await compressImageFileToBlob(file);
      const fd = new FormData();
      fd.set("file", blob, "profile.jpg");
      const res = await fetch("/api/uploads/listing-image", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || typeof j.url !== "string") {
        setUploadError(j.error ?? "Could not upload photo.");
        return;
      }
      onImageChange(j.url);
    } catch {
      setUploadError("Could not upload photo.");
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <WizardCard className="flex flex-1 flex-col">
      <h2 className="font-display text-xl font-black tracking-tight text-foreground sm:text-2xl">Seller profile</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Optional — photo and display name help buyers recognize your shop. Favorite categories are set when you create listings.
      </p>

      <div className="mt-6 space-y-5">
        <div className="flex flex-col items-center gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar
            <img src={imageUrl} alt="" className="size-20 rounded-full border border-white/10 object-cover" />
          ) : (
            <span className="inline-flex size-20 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-2xl font-bold text-gold-bright">
              ?
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={uploadBusy}
            onClick={() => fileRef.current?.click()}
            className="text-xs font-semibold text-gold-bright hover:underline disabled:opacity-50"
          >
            {uploadBusy ? "Uploading…" : imageUrl ? "Change photo" : "Add profile photo"}
          </button>
          {uploadError ? <p className="text-xs text-amber-200">{uploadError}</p> : null}
        </div>

        <label>
          <span className="mb-1 block text-xs font-medium text-zinc-400">Display name / bio</span>
          <textarea
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            rows={3}
            placeholder="Tell buyers a little about your shop…"
            className="w-full resize-none rounded-xl border border-white/10 bg-[#0c0c10] px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-gold/40"
          />
        </label>
      </div>

      {saveError ? <p className="mt-4 text-sm font-medium text-amber-200">{saveError}</p> : null}

      <WizardStepActions
        onBack={onBack}
        backDisabled={saveBusy}
        primary={
          <WizardPrimaryButton disabled={saveBusy} onClick={onSave}>
            {saveBusy ? "Saving…" : "Save & continue"}
          </WizardPrimaryButton>
        }
        below={
          <WizardSecondaryButton disabled={saveBusy} onClick={onSkip}>
            Skip for now
          </WizardSecondaryButton>
        }
      />
    </WizardCard>
  );
}
