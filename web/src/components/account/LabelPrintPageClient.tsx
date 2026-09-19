"use client";

import { useEffect, useState } from "react";

type LabelPrintPageFormat = "letter" | "4x6";

type Props = {
  pdfSrc: string;
  format: LabelPrintPageFormat;
};

export function LabelPrintPageClient({ pdfSrc, format }: Props) {
  const [loadFailed, setLoadFailed] = useState(false);
  const isThermal = format === "4x6";
  const pageSize = isThermal ? "4in 6in" : "letter";

  useEffect(() => {
    if (loadFailed) return;
    const timer = window.setTimeout(() => {
      window.focus();
      window.print();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [pdfSrc, loadFailed]);

  return (
    <>
      <style>{`
        @page { size: ${pageSize}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            ${isThermal ? "width: 4in; height: 6in;" : "width: 100%; height: 100%;"}
          }
          .label-print-root {
            margin: 0;
            padding: 0;
            background: #fff;
            ${isThermal ? "width: 4in; height: 6in;" : "width: 100%; height: 100%;"}
            overflow: hidden;
          }
          .label-shell, .label-frame {
            border: none;
            display: block;
            ${isThermal ? "width: 4in; height: 6in;" : "width: 100%; height: 100%;"}
          }
        }
        @media screen {
          .label-print-root {
            box-sizing: border-box;
            min-height: 100dvh;
            width: 100%;
            margin: 0;
            background: #0a0a0d;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 24px 16px 96px;
          }
          .label-shell {
            width: ${isThermal ? "4in" : "min(100%, 8.5in)"};
            height: ${isThermal ? "6in" : "min(85dvh, 11in)"};
            background: #fff;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
            overflow: hidden;
          }
          .label-frame {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
            background: #fff;
          }
          .label-tip {
            position: fixed;
            bottom: 1rem;
            left: 50%;
            transform: translateX(-50%);
            width: min(100% - 2rem, 32rem);
            margin: 0;
            text-align: center;
            font-size: 0.875rem;
            line-height: 1.4;
            color: #a1a1aa;
          }
        }
      `}</style>
      <div className="label-print-root">
        <div className="label-shell">
          {loadFailed ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center text-sm text-zinc-300">
              <p>Couldn’t load the shipping label PDF.</p>
              <a href={pdfSrc} className="font-semibold text-amber-300 underline" target="_blank" rel="noreferrer">
                Open label in a new tab
              </a>
            </div>
          ) : (
            <iframe
              title="Shipping label"
              className="label-frame"
              src={pdfSrc}
              onError={() => setLoadFailed(true)}
            />
          )}
        </div>
        <p className="no-print label-tip">
          {isThermal ? (
            <>
              4×6 thermal — set your printer paper size to{" "}
              <strong style={{ color: "#e4e4e7" }}>4×6</strong>. If the preview still looks like a full letter
              page, this label was purchased as letter; create a new label with 4×6 selected.
            </>
          ) : (
            <>Letter print — dialog should open automatically.</>
          )}{" "}
          <button
            type="button"
            className="font-semibold text-amber-300 underline"
            onClick={() => window.print()}
          >
            Print again
          </button>
          {" · "}
          <a href={pdfSrc} className="font-semibold text-amber-300 underline" target="_blank" rel="noreferrer">
            Open PDF
          </a>
        </p>
      </div>
    </>
  );
}
