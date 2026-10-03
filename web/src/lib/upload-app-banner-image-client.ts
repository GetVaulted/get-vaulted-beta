/** Browser-side upload to `/api/admin/uploads/app-banner-image` (admin-only). */
export async function uploadAppBannerImageBlob(blob: Blob, filename = "banner-image.jpg"): Promise<string> {
  const fd = new FormData();
  fd.set("file", blob, filename);
  const res = await fetch("/api/admin/uploads/app-banner-image", { method: "POST", body: fd });
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || typeof j.url !== "string") {
    throw new Error(typeof j.error === "string" ? j.error : "Upload failed");
  }
  return j.url;
}
