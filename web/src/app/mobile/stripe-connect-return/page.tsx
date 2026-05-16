import Link from "next/link";

/** Return target after Stripe Connect hosted onboarding (mobile users switch back to the app). */
export default function MobileStripeConnectReturnPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 560, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: "1.25rem" }}>Payout setup</h1>
      <p style={{ marginTop: "1rem", lineHeight: 1.5, color: "#333" }}>
        If you finished in Stripe, return to the Get Vaulted app — your payout status refreshes when Seller HQ opens.
      </p>
      <p style={{ marginTop: "0.75rem", lineHeight: 1.5, color: "#555" }}>
        Didn&apos;t finish? Open the app and tap <strong>Set up payouts</strong> again.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/" style={{ color: "#b8860b", fontWeight: 600 }}>
          Back to Get Vaulted
        </Link>
      </p>
    </main>
  );
}
