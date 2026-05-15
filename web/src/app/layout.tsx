import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WatchlistToastHost } from "@/components/marketplace/WatchlistToastHost";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LiveMarketplaceGateProvider } from "@/components/providers/LiveMarketplaceGateProvider";
import { isLiveMarketplacePubliclyAvailable } from "@/lib/live-coming-soon";
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
  title: "Get Vaulted — Premium Collectibles Marketplace",
  description:
    "Marketplace for graded cards, live breaks, and trades—dark, fast, and built for serious collectors.",
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
          <LiveMarketplaceGateProvider enabled={liveMarketplaceEnabled}>
            <Navbar />
            <WatchlistToastHost />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </LiveMarketplaceGateProvider>
          <SiteFooter liveMarketplaceEnabled={liveMarketplaceEnabled} />
        </AuthProvider>
      </body>
    </html>
  );
}
