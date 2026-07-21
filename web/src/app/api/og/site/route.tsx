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
          backgroundColor: "#050506",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(160deg, #0c0b09 0%, #050506 42%, #12100a 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -120,
            left: "50%",
            marginLeft: -280,
            width: 560,
            height: 560,
            borderRadius: "50%",
            background: "rgba(212,175,55,0.16)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 28,
            borderRadius: 28,
            border: "2px solid rgba(212,175,55,0.28)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            padding: "56px 72px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 44,
              border: "3px solid rgba(212,175,55,0.75)",
              background: "rgba(212,175,55,0.12)",
              marginBottom: 28,
              fontSize: 42,
              fontWeight: 800,
              color: "#d4af37",
            }}
          >
            V
          </div>
          <div
            style={{
              fontSize: 78,
              fontWeight: 800,
              color: "#f0d78c",
              letterSpacing: -1.5,
              lineHeight: 1,
              marginBottom: 20,
            }}
          >
            Get Vaulted
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "rgba(255,255,255,0.78)",
              textAlign: "center",
              maxWidth: 780,
              lineHeight: 1.3,
            }}
          >
            Live auctions, breaks, and collectibles
          </div>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 28px",
              borderRadius: 999,
              background: "rgba(212,175,55,0.16)",
              border: "1px solid rgba(212,175,55,0.35)",
              fontSize: 24,
              fontWeight: 700,
              color: "#e8c96a",
            }}
          >
            Friend invite · $10 credit each
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    },
  );
}
