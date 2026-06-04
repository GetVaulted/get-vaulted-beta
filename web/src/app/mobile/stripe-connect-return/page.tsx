import Link from "next/link";

/** Shown inside the in-app browser when Stripe redirects after hosted Connect onboarding. */
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
        {isRefresh ? "Payout setup link expired" : "Payout setup submitted"}
      </h1>
      <p style={{ marginTop: "1.25rem", lineHeight: 1.6, color: "#e4e4e7", fontSize: 16 }}>
        {isRefresh
          ? "This Stripe link was already used. Close this window, return to Get Vaulted, and tap Connect payouts or Continue Stripe setup to open a new session."
          : "Payout setup submitted. You can close this window and return to Get Vaulted."}
      </p>
      {!isRefresh ? (
        <p style={{ marginTop: "1rem", lineHeight: 1.55, color: "#71717a", fontSize: 14 }}>
          Tap Done at the top of this screen when you are finished. Get Vaulted will check your payout status automatically.
        </p>
      ) : null}
      <p style={{ marginTop: "2rem" }}>
        <Link href="/" style={{ color: "#d4af37", fontWeight: 600, textDecoration: "none" }}>
          Continue on web →
        </Link>
      </p>
    </main>
  );
}
