import Link from "next/link";

/** Return target after mobile Google OAuth (in-app auth session). */
export default function MobileAuthCallbackPage() {
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
        Sign-in complete
      </h1>
      <p style={{ marginTop: "1.25rem", lineHeight: 1.6, color: "#e4e4e7", fontSize: 16 }}>
        You can close this browser to return to the Get Vaulted app.
      </p>
      <p style={{ marginTop: "1rem", lineHeight: 1.55, color: "#71717a", fontSize: 14 }}>
        If the app does not open automatically, switch back to Get Vaulted manually.
      </p>
      <p style={{ marginTop: "2rem" }}>
        <Link href="/" style={{ color: "#d4af37", fontWeight: 600, textDecoration: "none" }}>
          Continue on web →
        </Link>
      </p>
    </main>
  );
}
