import { ImageResponse } from "next/og";
import { fetchLiveRoomOgPayload, formatOgViewerLabel } from "@/lib/live-room-og-payload";

export async function GET(_request: Request, context: { params: Promise<{ showId: string }> }) {
  const { showId } = await context.params;
  const payload = await fetchLiveRoomOgPayload(showId ?? "");

  if (!payload) {
    return new Response("Live show not found.", { status: 404 });
  }

  const viewerLabel = formatOgViewerLabel(payload.viewerCount);
  const hasBackground = Boolean(payload.backgroundImageUrl);

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
        {hasBackground ? (
          // eslint-disable-next-line @next/next/no-img-element -- OG renderer requires img
          <img
            src={payload.backgroundImageUrl!}
            alt=""
            width={1200}
            height={630}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: hasBackground
              ? "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.82) 55%, rgba(0,0,0,0.94) 100%)"
              : "linear-gradient(135deg, #0a0a0a 0%, #14110a 45%, #0a0a0a 100%)",
          }}
        />
        {!hasBackground ? (
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
        ) : null}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "48px 56px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  color: "#d4af37",
                  letterSpacing: -0.5,
                }}
              >
                Get Vaulted
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
                Live auctions & breaks
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 999,
                background: payload.isLive ? "#dc2626" : "rgba(255,255,255,0.14)",
                border: "2px solid rgba(255,255,255,0.18)",
              }}
            >
              {payload.isLive ? (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "#ffffff",
                  }}
                />
              ) : null}
              <div style={{ fontSize: 24, fontWeight: 900, color: "#ffffff", letterSpacing: 1.2 }}>
                {payload.isLive ? "LIVE" : "SHOW"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {payload.hostAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- OG renderer requires img
              <img
                src={payload.hostAvatarUrl}
                alt=""
                width={112}
                height={112}
                style={{
                  borderRadius: "50%",
                  border: "4px solid rgba(212,175,55,0.85)",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: "50%",
                  border: "4px solid rgba(212,175,55,0.85)",
                  background: "rgba(212,175,55,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 42,
                  fontWeight: 800,
                  color: "#d4af37",
                }}
              >
                {payload.hostUsername.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 880 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: "#f4f4f5" }}>{payload.hostDisplayName}</div>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  color: "#ffffff",
                  lineHeight: 1.15,
                  letterSpacing: -0.5,
                }}
              >
                {payload.showTitle}
              </div>
              {viewerLabel ? (
                <div style={{ fontSize: 24, fontWeight: 700, color: "#d4af37" }}>{viewerLabel}</div>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.62)" }}>
                  Tap to join the live auction
                </div>
              )}
            </div>
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
