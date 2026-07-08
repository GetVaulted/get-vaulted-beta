import { APP_STORE_BADGE_ASSETS } from "@/lib/app-store-badge-assets";
import { googlePlayUrl, iosAppStoreUrl } from "@/lib/app-store-links";

type AppDownloadBadgesProps = {
  className?: string;
  size?: "default" | "large";
};

/** Apple badge is tight to the artwork; Google’s official PNG includes outer padding — scale up to match. */
const STORE_BADGE_HEIGHTS = {
  default: { apple: 40, google: 48 },
  large: { apple: 48, google: 58 },
} as const;

function StoreBadgeLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex shrink-0 items-center transition hover:brightness-110"
    >
      {children}
    </a>
  );
}

function StoreBadgePlaceholder({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span
      aria-label={`${label} — coming soon`}
      title="Coming soon"
      className="inline-flex shrink-0 cursor-default items-center opacity-70"
    >
      {children}
    </span>
  );
}

export function AppDownloadBadges({ className, size = "default" }: AppDownloadBadgesProps) {
  const large = size === "large";
  const ios = iosAppStoreUrl();
  const android = googlePlayUrl();
  const heights = large ? STORE_BADGE_HEIGHTS.large : STORE_BADGE_HEIGHTS.default;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      {ios ? (
        <StoreBadgeLink href={ios} label="Download on the App Store">
          {/* eslint-disable-next-line @next/next/no-img-element -- official Apple marketing badge SVG */}
          <img
            src={APP_STORE_BADGE_ASSETS.appStoreDownloadBlack}
            alt="Download on the App Store"
            width={120}
            height={heights.apple}
            style={{ height: heights.apple, width: "auto" }}
            className="block w-auto max-w-none"
            decoding="async"
          />
        </StoreBadgeLink>
      ) : (
        <StoreBadgePlaceholder label="Download on the App Store">
          <img
            src={APP_STORE_BADGE_ASSETS.appStoreDownloadBlack}
            alt="Download on the App Store — coming soon"
            width={120}
            height={heights.apple}
            style={{ height: heights.apple, width: "auto" }}
            className="block w-auto max-w-none"
            decoding="async"
          />
        </StoreBadgePlaceholder>
      )}

      {android ? (
        <StoreBadgeLink href={android} label="Get it on Google Play">
          {/* eslint-disable-next-line @next/next/no-img-element -- official Google Play badge PNG */}
          <img
            src={APP_STORE_BADGE_ASSETS.googlePlayGetIt}
            alt="Get it on Google Play"
            width={155}
            height={heights.google}
            style={{ height: heights.google, width: "auto" }}
            className="block w-auto max-w-none"
            decoding="async"
          />
        </StoreBadgeLink>
      ) : (
        <StoreBadgePlaceholder label="Get it on Google Play">
          <img
            src={APP_STORE_BADGE_ASSETS.googlePlayGetIt}
            alt="Get it on Google Play — coming soon"
            width={155}
            height={heights.google}
            style={{ height: heights.google, width: "auto" }}
            className="block w-auto max-w-none"
            decoding="async"
          />
        </StoreBadgePlaceholder>
      )}
    </div>
  );
}
