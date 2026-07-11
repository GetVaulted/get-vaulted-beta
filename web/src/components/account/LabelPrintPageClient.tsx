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
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pdfSrc]);

  const isThermal = format === "4x6";
  const pageSize = isThermal ? "4in 6in" : "letter";

  return (
    <>
      <style>{`
        @page { size: ${pageSize}; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          ${isThermal ? "width: 4in; height: 6in;" : ""}
        }
        @media print {
          .no-print { display: none !important; }
          html, body {
            margin: 0;
            padding: 0;
            ${isThermal ? "width: 4in; height: 6in;" : "width: 100%; height: 100%;"}
          }
          .label-shell {
            margin: 0;
            padding: 0;
            ${isThermal ? "width: 4in; height: 6in;" : "width: 100%; height: 100%;"}
            overflow: hidden;
          }
          .label-frame {
            border: none;
            display: block;
            ${isThermal ? "width: 4in; height: 6in;" : "width: 100%; height: 100%;"}
          }
        }
        @media screen {
          html, body {
            margin: 0;
            background: #0a0a0d;
            ${isThermal ? "min-height: 100vh;" : "width: 100%; height: 100%;"}
          }
          ${
            isThermal
              ? `
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px 80px;
            box-sizing: border-box;
          }
          .label-shell {
            width: 4in;
            height: 6in;
            background: #fff;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
          }
          .label-frame { width: 4in; height: 6in; border: none; display: block; }
          `
              : `
          .label-shell { width: 100vw; height: 100vh; }
          .label-frame { width: 100%; height: 100%; border: none; display: block; }
          `
          }
        }
      `}</style>
      <div className="label-shell">
        <embed title="Shipping label" className="label-frame" src={pdfSrc} type="application/pdf" />
      </div>
      <p className="no-print fixed bottom-4 left-1/2 w-full max-w-lg -translate-x-1/2 px-4 text-center text-sm text-zinc-400">
        {isThermal ? (
          <>
            4×6 thermal — set your printer paper size to <strong className="text-zinc-200">4×6</strong>. If the
            preview still looks like a full letter page, this label was purchased as letter; create a new label with
            4×6 selected.
          </>
        ) : (
          <>Letter print — dialog should open automatically.</>
        )}{" "}
        <button type="button" className="font-semibold text-gold-bright underline" onClick={() => window.print()}>
          Print again
        </button>
      </p>
    </>
  );
}
