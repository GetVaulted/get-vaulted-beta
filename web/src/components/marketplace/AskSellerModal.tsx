"use client";

import { useEffect, useId, useRef, useState } from "react";

type AskSellerModalProps = {
  open: boolean;
  onClose: () => void;
  listingTitle: string;
  sellerUsername: string;
  onSubmit: (body: string, imageUrl?: string) => Promise<void>;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function AskSellerModal({ open, onClose, listingTitle, sellerUsername, onSubmit }: AskSellerModalProps) {
  const titleId = useId();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setBody("");
      setError(null);
      setSubmitting(false);
      setImageFile(null);
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickImage = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("Use JPG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Photo must be 8MB or smaller.");
      return;
    }
    setImageFile(file);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    setError(null);
    const t = body.trim();
    if (!t && !imageFile) {
      setError("Write a message or attach a photo before sending.");
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const form = new FormData();
        form.append("file", imageFile);
        const uploadRes = await fetch("/api/uploads/message-image", { method: "POST", body: form });
        const uploadData = (await uploadRes.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!uploadRes.ok || !uploadData.url) {
          throw new Error(typeof uploadData.error === "string" ? uploadData.error : "Photo upload failed.");
        }
        imageUrl = uploadData.url;
      }
      await onSubmit(t, imageUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0a0a0d] p-5 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.9)] sm:p-6"
      >
        <h2 id={titleId} className="font-display text-lg font-bold text-foreground">
          Message seller
        </h2>
        <p className="mt-2 text-sm font-medium text-zinc-400">
          To <span className="text-zinc-200">@{sellerUsername}</span>
        </p>
        <p className="mt-1 text-sm leading-snug text-zinc-300 line-clamp-2">{listingTitle}</p>

        <div className="mt-5 space-y-1.5">
          <label htmlFor="ask-seller-body" className="text-xs font-medium text-zinc-300">
            Message
          </label>
          <textarea
            id="ask-seller-body"
            rows={5}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setError(null);
            }}
            className="min-h-[120px] w-full resize-y rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 py-2.5 text-sm text-foreground outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
            placeholder="Ask about condition, shipping, or authenticity…"
          />
        </div>

        {imagePreviewUrl ? (
          <div className="mt-3 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset. */}
            <img src={imagePreviewUrl} alt="Selected photo preview" className="h-14 w-14 rounded-lg object-cover" />
            <button
              type="button"
              onClick={clearImage}
              className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300"
            >
              Remove photo
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                pickImage(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 text-xs font-semibold text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
            >
              Attach photo
            </button>
          </div>
        )}

        {error ? <p className="mt-3 text-xs font-medium text-rose-300">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/[0.14] px-6 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.04] sm:min-w-[7rem]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || (!body.trim() && !imageFile)}
            onClick={() => void handleSend()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110 disabled:opacity-60 sm:min-w-[10rem]"
          >
            {submitting ? "Sending…" : "Send message"}
          </button>
        </div>
      </div>
    </div>
  );
}
