import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WatchlistToastHost } from "@/components/marketplace/WatchlistToastHost";
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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const displaySerif = Cormorant_Garamond({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
                  <Navbar />
                  <WatchlistToastHost />
                  <div className="flex min-h-0 flex-1 flex-col">{children}</div>
                </LiveMarketplaceGateProvider>
                <SiteFooter liveMarketplaceEnabled={liveMarketplaceEnabled} />
              </MarketplaceCatalogSyncProvider>
            </VaultEcosystemRealtimeProvider>
          </KeyboardDismissProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
