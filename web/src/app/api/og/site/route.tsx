import { ImageResponse } from "next/og";

/** Branded 1200×630 share card for site-wide / referral Open Graph previews. */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          backgroundColor: "#09090b",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #0a0a0a 0%, #14110a 45%, #0a0a0a 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -40,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: "rgba(212,175,55,0.12)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            padding: "64px 72px",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              color: "rgba(212,175,55,0.85)",
              marginBottom: 18,
            }}
          >
            PREMIUM COLLECTIBLES
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 800,
              color: "#d4af37",
              letterSpacing: -1.5,
              lineHeight: 1.05,
              marginBottom: 22,
            }}
          >
            Get Vaulted
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: "rgba(255,255,255,0.72)",
              maxWidth: 820,
              lineHeight: 1.35,
            }}
          >
            Marketplace, live auctions and breaks. Join with a friend invite.
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
