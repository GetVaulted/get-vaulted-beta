"use client";

import { useEffect } from "react";

type LabelPrintPageFormat = "letter" | "4x6";

type Props = {
  pdfSrc: string;
  format: LabelPrintPageFormat;
};

export function LabelPrintPageClient({ pdfSrc, format }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.focus();
      window.print();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [pdfSrc]);

  const pageSize = format === "4x6" ? "4in 6in" : "letter";

  return (
    <>
      <style>{`
        @page { size: ${pageSize}; margin: 0; }
        @media print {
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
          .no-print { display: none !important; }
          .label-frame { border: none; width: 100%; height: 100%; }
        }
        @media screen {
          html, body { margin: 0; background: #0a0a0d; }
          .label-frame { width: 100vw; height: 100vh; border: none; }
        }
      `}</style>
      <iframe title="Shipping label" className="label-frame" src={pdfSrc} />
      <p className="no-print fixed bottom-4 left-1/2 w-full max-w-md -translate-x-1/2 px-4 text-center text-sm text-zinc-400">
        {format === "4x6" ? "4×6 thermal" : "Letter"} print — dialog should open automatically.{" "}
        <button type="button" className="font-semibold text-gold-bright underline" onClick={() => window.print()}>
          Print again
        </button>
      </p>
    </>
  );
}
