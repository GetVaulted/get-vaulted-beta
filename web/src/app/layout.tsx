import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { KeyboardDismissProvider } from "@/components/providers/KeyboardDismissProvider";
import { LiveMarketplaceGateProvider } from "@/components/providers/LiveMarketplaceGateProvider";
import { MarketplaceCatalogSyncProvider } from "@/components/providers/MarketplaceCatalogSyncProvider";
import { VaultEcosystemRealtimeProvider } from "@/components/providers/VaultEcosystemRealtimeProvider";
import { isLiveMarketplacePubliclyAvailable } from "@/lib/live-coming-soon";
import { publicSiteBaseUrl } from "@/lib/live-room-share-metadata";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_OG_IMAGE,
  SITE_NAME,
} from "@/lib/site-seo";
import "./globals.css";

// Fonts are bundled in ./fonts (Geist and Geist Mono: SIL OFL, Vercel; Cormorant Garamond: SIL OFL) instead of
// being downloaded from Google during `next build`. A Google Fonts hiccup used to fail the whole production deploy.
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const displaySerif = localFont({
  src: [
    { path: "./fonts/CormorantGaramond-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/CormorantGaramond-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/CormorantGaramond-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteBaseUrl()),
  title: {
    default: "Get Vaulted — Premium Collectibles Marketplace",
    template: "%s",
  },
  description: DEFAULT_SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Get Vaulted — Premium Collectibles Marketplace",
    description: DEFAULT_SITE_DESCRIPTION,
    images: [{ url: DEFAULT_SITE_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Get Vaulted — Premium Collectibles Marketplace",
    description: DEFAULT_SITE_DESCRIPTION,
    images: [DEFAULT_SITE_OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const liveMarketplaceEnabled = isLiveMarketplacePubliclyAvailable();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AuthProvider>
          <KeyboardDismissProvider>
            <VaultEcosystemRealtimeProvider>
              <MarketplaceCatalogSyncProvider>
                <LiveMarketplaceGateProvider enabled={liveMarketplaceEnabled}>
                  <AppShell liveMarketplaceEnabled={liveMarketplaceEnabled}>{children}</AppShell>
                </LiveMarketplaceGateProvider>
              </MarketplaceCatalogSyncProvider>
            </VaultEcosystemRealtimeProvider>
          </KeyboardDismissProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
