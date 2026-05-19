import Link from "next/link";

/** Return target after Stripe Connect hosted onboarding (in-app auth session on mobile). */
export default function MobileStripeConnectReturnPage({
  searchParams,
}: {
  searchParams?: { refresh?: string };
}) {
  const isRefresh = searchParams?.refresh === "1";

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
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#d4af37",
        }}
      >
        Get Vaulted
      </p>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "0.75rem", lineHeight: 1.25 }}>
        {isRefresh ? "Payout setup link expired" : "Thank you for completing your payout setup"}
      </h1>
      <p style={{ marginTop: "1.25rem", lineHeight: 1.6, color: "#e4e4e7", fontSize: 16 }}>
        {isRefresh
          ? "Stripe refresh links are one-time. Close this browser, return to Get Vaulted, and tap Finish Seller Setup to open a new onboarding session."
          : "You can close this browser to be redirected back to the app. Your payout status in Seller HQ will update automatically."}
      </p>
      <p style={{ marginTop: "1rem", lineHeight: 1.55, color: "#71717a", fontSize: 14 }}>
        If the app does not open on its own, switch back to Get Vaulted manually — we refresh your status when Seller HQ
        becomes active again.
      </p>
      <p style={{ marginTop: "2rem" }}>
        <Link href="/" style={{ color: "#d4af37", fontWeight: 600, textDecoration: "none" }}>
          Continue on web →
        </Link>
      </p>
    </main>
  );
}
