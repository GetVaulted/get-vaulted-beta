"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: {
      FUNDING: { VENMO: string };
      Buttons: (opts: {
        fundingSource: string;
        style?: Record<string, unknown>;
        createOrder: () => string;
        onApprove: () => Promise<void> | void;
        onCancel: () => void;
        onError: (err: unknown) => void;
      }) => { render: (el: HTMLElement) => void };
    };
  }
}

type Props = {
  clientId: string;
  idToken: string;
  orderId: string;
  approveUrl: string;
  cancelUrl: string;
  errorUrl: string;
};

const SDK_SCRIPT_ID = "paypal-venmo-connect-sdk";

/**
 * Renders PayPal's actual JS SDK Venmo button — this is the only thing that triggers the real
 * venmo:// app switch (per PayPal's docs: https://developer.paypal.com/sdk/js/save-with-purchase/venmo).
 * A bare REST-returned "approve" URL opened via redirect/Linking.openURL does NOT do this; it just
 * lands the buyer on a generic web page, which was the actual bug behind "Venmo opens a browser,
 * not the app."
 */
export function VenmoConnectButton({ clientId, idToken, orderId, approveUrl, cancelUrl, errorUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "redirecting" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function renderButton() {
      if (cancelled || !containerRef.current) return;
      if (!window.paypal?.Buttons) {
        setStatus("error");
        setErrorMsg("PayPal did not load correctly. Try again.");
        return;
      }
      try {
        window.paypal
          .Buttons({
            fundingSource: window.paypal.FUNDING.VENMO,
            style: { color: "blue", shape: "rect", height: 48 },
            createOrder: () => orderId,
            onApprove: () => {
              setStatus("redirecting");
              window.location.href = approveUrl;
              return Promise.resolve();
            },
            onCancel: () => {
              window.location.href = cancelUrl;
            },
            onError: (err: unknown) => {
              console.error("[venmo-connect] sdk error", err);
              window.location.href = errorUrl;
            },
          })
          .render(containerRef.current);
        setStatus("ready");
      } catch (e) {
        console.error("[venmo-connect] render", e);
        setStatus("error");
        setErrorMsg("Could not load the Venmo button. Try again.");
      }
    }

    const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.paypal) renderButton();
      else existing.addEventListener("load", renderButton);
      return () => existing.removeEventListener("load", renderButton);
    }

    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&enable-funding=venmo&currency=USD&intent=capture`;
    script.setAttribute("data-user-id-token", idToken);
    script.async = true;
    script.onload = renderButton;
    script.onerror = () => {
      setStatus("error");
      setErrorMsg("Could not reach PayPal. Check your connection and try again.");
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
    // Mount once — a fresh id_token/order means a fresh page load, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      {status === "loading" ? <p className="text-sm text-zinc-400">Loading Venmo…</p> : null}
      {status === "redirecting" ? <p className="text-sm text-zinc-400">Connecting your Venmo…</p> : null}
      {status === "error" ? <p className="text-sm text-rose-300">{errorMsg}</p> : null}
      <div ref={containerRef} className="w-full max-w-xs" />
    </div>
  );
}
