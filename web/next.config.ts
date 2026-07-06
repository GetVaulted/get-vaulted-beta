import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { buildSecurityHeaders } from "./src/lib/security-headers";

function supabasePublicStorageHostname(): string | undefined {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).hostname;
  } catch {
    return undefined;
  }
}

/** Same LAN as NEXTAUTH_URL — avoids duplicating the IP in NEXT_DEV_ALLOWED_ORIGINS. */
function nextAuthUrlHostname(): string | undefined {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).hostname;
  } catch {
    return undefined;
  }
}

const supabaseHost = supabasePublicStorageHostname();

/**
 * Current machine LAN IPv4s (e.g. 192.168.x.x). Next.js dev blocks cross-origin RSC/HMR unless the
 * browser `Origin` host is in `allowedDevOrigins`; phones hit your PC IP, which often differs from
 * `NEXTAUTH_URL` after DHCP changes — so we merge live NIC addresses whenever `next dev` starts.
 */
function devLanIpv4Hostnames(): string[] {
  if (process.env.NODE_ENV === "production") return [];
  if (process.env.NEXT_DEV_DISABLE_AUTO_LAN_ORIGINS === "1") return [];
  const out: string[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      const fam = net.family as "IPv4" | "IPv6" | number;
      const v4 = fam === "IPv4" || fam === 4;
      if (v4 && !net.internal && typeof net.address === "string") {
        out.push(net.address);
      }
    }
  }
  return out;
}

/** Hostnames (no protocol/port) allowed as dev cross-origin clients — phones on Wi-Fi need your PC IP here. */
function devAllowedOrigins(): string[] {
  const fromEnv =
    process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean) ?? [];
  const authHost = nextAuthUrlHostname();
  const base = [
    "localhost",
    "127.0.0.1",
    ...(authHost ? [authHost] : []),
    ...fromEnv,
    ...devLanIpv4Hostnames(),
  ];
  return [...new Set(base)];
}

const repoRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  allowedDevOrigins: devAllowedOrigins(),
  turbopack: {
    // Help Center + other packages import from ../shared at repo root.
    root: repoRoot,
  },
  webpack: (config, { dev }) => {
    // OneDrive/Windows can lock webpack cache artifacts, causing random 500s in dev.
    if (dev) config.cache = false;
    return config;
  },
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

// Wraps the config to enable Sentry source-map upload — a no-op (no plugin, no build changes)
// until SENTRY_AUTH_TOKEN is set, so this is safe to ship before a Sentry org/project exists.
// See web/docs/production-error-monitoring.md.
const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  sourcemaps: {
    // No token → skip source map generation/upload entirely rather than attempting and warning.
    disable: !hasSentryAuthToken,
    // Uploaded maps stay in Sentry only; never ship raw .map files in the deployed bundle.
    deleteSourcemapsAfterUpload: true,
  },
  // Sentry's own build-time usage telemetry — unrelated to app error reporting; keep it off.
  telemetry: false,
});
