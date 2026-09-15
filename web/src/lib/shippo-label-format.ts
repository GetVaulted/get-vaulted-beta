/** Seller-facing label print / purchase format. */
export type SellerLabelPrintFormat = "letter" | "thermal_4x6";

/** Shippo `label_file_type` values used at transaction purchase. */
export type ShippoLabelFileType = "PDF" | "PDF_4x6";

export const LABEL_PRINT_FORMAT_STORAGE_KEY = "gv_seller_label_print_format";

export function shippoLabelFileTypeForPrintFormat(format: SellerLabelPrintFormat): ShippoLabelFileType {
  return format === "thermal_4x6" ? "PDF_4x6" : "PDF";
}

export function parseSellerLabelPrintFormat(raw: string | null | undefined): SellerLabelPrintFormat {
  return raw === "thermal_4x6" ? "thermal_4x6" : "letter";
}

export function readStoredLabelPrintFormat(): SellerLabelPrintFormat {
  if (typeof window === "undefined") return "thermal_4x6";
  const raw = localStorage.getItem(LABEL_PRINT_FORMAT_STORAGE_KEY);
  if (raw == null) return "thermal_4x6";
  return parseSellerLabelPrintFormat(raw);
}

export function storeLabelPrintFormat(format: SellerLabelPrintFormat): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LABEL_PRINT_FORMAT_STORAGE_KEY, format);
}

export function buildLabelPrintPagePath(labelUrl: string, format: SellerLabelPrintFormat): string {
  const params = new URLSearchParams({
    src: labelUrl,
    format: format === "thermal_4x6" ? "4x6" : "letter",
  });
  return `/account/sales/print-label?${params.toString()}`;
}

/** Restrict print proxy to known Shippo label hosts (avoid open redirects). */
export function isAllowedShippoLabelUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith(".goshippo.com") ||
      host.includes("shippo") ||
      host.endsWith(".amazonaws.com")
    );
  } catch {
    return false;
  }
}

export function labelDownloadFilename(orderId: string, format: SellerLabelPrintFormat): string {
  const suffix = format === "thermal_4x6" ? "4x6" : "letter";
  return `shipping-label-${orderId.slice(0, 8)}-${suffix}.pdf`;
}

/** Parse optional `labelFormat` from create-label POST bodies. Defaults to 4×6 thermal. */
export function parseCreateLabelRequestBody(body: unknown): SellerLabelPrintFormat {
  if (!body || typeof body !== "object") return "thermal_4x6";
  const raw = (body as { labelFormat?: unknown }).labelFormat;
  if (typeof raw !== "string") return "thermal_4x6";
  return parseSellerLabelPrintFormat(raw);
}

export function buildLabelPdfProxyPath(labelUrl: string): string {
  return `/api/account/sales/label-pdf?src=${encodeURIComponent(labelUrl)}`;
}
