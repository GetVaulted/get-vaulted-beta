import Link from "next/link";

/** Return target after Stripe Connect hosted onboarding (in-app auth session on mobile). */
export default function MobileStripeConnectReturnPage() {
  return (
    <main
      style={{
        padding: "2rem 1.25rem",
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#050505",
        color: "#f4f4f5",
        minHeight: "100vh",
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#d4af37" }}>
        Get Vaulted
      </p>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 800, marginTop: "0.75rem" }}>Payout setup</h1>
      <p style={{ marginTop: "1rem", lineHeight: 1.55, color: "#a1a1aa" }}>
        You can close this screen — the Get Vaulted app should return automatically. Open Seller HQ to see your updated
        payout status.
      </p>
      <p style={{ marginTop: "0.75rem", lineHeight: 1.55, color: "#71717a", fontSize: 14 }}>
        Need to finish later? In the app, tap <strong style={{ color: "#e4e4e7" }}>Set up payouts</strong> again.
      </p>
      <p style={{ marginTop: "1.75rem" }}>
        <Link href="/" style={{ color: "#d4af37", fontWeight: 600, textDecoration: "none" }}>
          Continue on web →
        </Link>
      </p>
    </main>
  );
}
