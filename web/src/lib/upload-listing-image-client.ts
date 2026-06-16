/** Browser-side upload to `/api/uploads/listing-image`. */
export async function uploadListingImageBlob(blob: Blob, filename = "listing-image.jpg"): Promise<string> {
  const fd = new FormData();
  fd.set("file", blob, filename);
  const res = await fetch("/api/uploads/listing-image", { method: "POST", body: fd });
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || typeof j.url !== "string") {
    throw new Error(typeof j.error === "string" ? j.error : "Upload failed");
  }
  return j.url;
}
