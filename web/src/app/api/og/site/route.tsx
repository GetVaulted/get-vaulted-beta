import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

async function loadBrandLogoDataUrl(): Promise<string> {
  const bytes = await readFile(join(process.cwd(), "public/brand/white-logo-og.png"));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/** Branded 1200×630 share card for site-wide / referral Open Graph previews. */
export async function GET() {
  const logoSrc = await loadBrandLogoDataUrl();

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
            background: "rgba(212,175,55,0.14)",
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
          {/* eslint-disable-next-line @next/next/no-img-element -- OG renderer requires img */}
          <img
            src={logoSrc}
            alt="Get Vaulted"
            width={820}
            height={231}
            style={{
              width: 820,
              height: 231,
              objectFit: "contain",
            }}
          />
          <div
            style={{
              marginTop: 36,
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
