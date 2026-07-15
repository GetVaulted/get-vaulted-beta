import { useRef, useState } from "react";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import {
  WizardCard,
  WizardPrimaryButton,
  WizardSecondaryButton,
  WizardStepActions,
} from "@/components/account/sellerSetup/WizardShell";
import { SellerAgreementField } from "@/components/account/sellerSetup/SellerAgreementField";

export function ProfileStep({
  imageUrl,
  saveBusy,
  saveError,
  sellerAgreementAccepted,
  onSellerAgreementChange,
  onBack,
  onImageChange,
  onSave,
  onSkip,
}: {
  imageUrl: string | null;
  saveBusy: boolean;
  saveError: string | null;
  sellerAgreementAccepted: boolean;
  onSellerAgreementChange: (value: boolean) => void;
  onBack: () => void;
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
      const res = await fetch("/api/uploads/avatar", { method: "POST", body: fd });
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
        Optional — add a photo so buyers recognize your shop. Your username is your public name and @handle.
        Favorite categories are set when you create listings.
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
      </div>

      {saveError ? <p className="mt-4 text-sm font-medium text-amber-200">{saveError}</p> : null}

      <SellerAgreementField
        checked={sellerAgreementAccepted}
        onChange={onSellerAgreementChange}
        disabled={saveBusy}
      />

      <WizardStepActions
        onBack={onBack}
        backDisabled={saveBusy}
        primary={
          <WizardPrimaryButton disabled={saveBusy || !sellerAgreementAccepted} onClick={onSave}>
            {saveBusy ? "Saving…" : "Save & continue"}
          </WizardPrimaryButton>
        }
        below={
          <WizardSecondaryButton disabled={saveBusy || !sellerAgreementAccepted} onClick={onSkip}>
            Skip for now
          </WizardSecondaryButton>
        }
      />
    </WizardCard>
  );
}
