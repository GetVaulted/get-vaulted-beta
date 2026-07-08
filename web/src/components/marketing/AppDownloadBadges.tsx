import { APP_STORE_BADGE_ASSETS } from "@/lib/app-store-badge-assets";
import { googlePlayUrl, iosAppStoreUrl } from "@/lib/app-store-links";

type AppDownloadBadgesProps = {
  className?: string;
  size?: "default" | "large";
};

function badgeHeight(large: boolean): string {
  return large ? "h-12 sm:h-14" : "h-10 sm:h-11";
}

function StoreBadgeLink({
  href,
  label,
  large,
  children,
}: {
  href: string;
  label: string;
  large: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex shrink-0 transition hover:brightness-110 ${badgeHeight(large)}`}
    >
      {children}
    </a>
  );
}

function StoreBadgePlaceholder({ label, large, children }: { label: string; large: boolean; children: React.ReactNode }) {
  return (
    <span
      aria-label={`${label} — coming soon`}
      title="Coming soon"
      className={`inline-flex shrink-0 cursor-default opacity-70 ${badgeHeight(large)}`}
    >
      {children}
    </span>
  );
}

export function AppDownloadBadges({ className, size = "default" }: AppDownloadBadgesProps) {
  const large = size === "large";
  const ios = iosAppStoreUrl();
  const android = googlePlayUrl();
  const imgClass = `h-full w-auto object-contain ${large ? "max-h-14" : "max-h-11"}`;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      {ios ? (
        <StoreBadgeLink href={ios} label="Download on the App Store" large={large}>
          {/* eslint-disable-next-line @next/next/no-img-element -- official Apple marketing badge SVG */}
          <img
            src={APP_STORE_BADGE_ASSETS.appStoreDownloadBlack}
            alt="Download on the App Store"
            width={120}
            height={40}
            className={imgClass}
            decoding="async"
          />
        </StoreBadgeLink>
      ) : (
        <StoreBadgePlaceholder label="Download on the App Store" large={large}>
          <img
            src={APP_STORE_BADGE_ASSETS.appStoreDownloadBlack}
            alt="Download on the App Store — coming soon"
            width={120}
            height={40}
            className={imgClass}
            decoding="async"
          />
        </StoreBadgePlaceholder>
      )}

      {android ? (
        <StoreBadgeLink href={android} label="Get it on Google Play" large={large}>
          {/* eslint-disable-next-line @next/next/no-img-element -- official Google Play badge PNG */}
          <img
            src={APP_STORE_BADGE_ASSETS.googlePlayGetIt}
            alt="Get it on Google Play"
            width={135}
            height={40}
            className={imgClass}
            decoding="async"
          />
        </StoreBadgeLink>
      ) : (
        <StoreBadgePlaceholder label="Get it on Google Play" large={large}>
          <img
            src={APP_STORE_BADGE_ASSETS.googlePlayGetIt}
            alt="Get it on Google Play — coming soon"
            width={135}
            height={40}
            className={imgClass}
            decoding="async"
          />
        </StoreBadgePlaceholder>
      )}
    </div>
  );
}
