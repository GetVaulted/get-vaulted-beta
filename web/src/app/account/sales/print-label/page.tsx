import { redirect } from "next/navigation";
import { LabelPrintPageClient } from "@/components/account/LabelPrintPageClient";
import { buildLabelPdfProxyPath, isAllowedShippoLabelUrl } from "@/lib/shippo-label-format";

type SearchParams = Promise<{ src?: string; format?: string }>;

export default async function PrintLabelPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const src = sp.src?.trim();
  if (!src || !isAllowedShippoLabelUrl(src)) {
    redirect("/account/sales");
  }

  const format = sp.format === "4x6" ? "4x6" : "letter";
  const pdfSrc = buildLabelPdfProxyPath(src);

  return <LabelPrintPageClient pdfSrc={pdfSrc} format={format} />;
}
