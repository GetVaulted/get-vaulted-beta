/** Apple Team ID + bundle id for Universal Links (must match App Store build). */
export const IOS_APP_LINK_APP_ID = "6BJ9R4C598.com.getvaulted.app";

export const ANDROID_APP_LINK_PACKAGE = "com.getvaulted.app";

/** HTTPS paths that should open in the native app when installed. */
export const APP_LINK_PATH_PREFIXES = ["/live/", "/listing/", "/marketplace/", "/join"] as const;

export function joinReferralCustomSchemeUrl(referralCode: string): string {
  const code = referralCode.trim();
  if (!code) return "getvaulted://join";
  return `getvaulted://join?ref=${encodeURIComponent(code)}`;
}

export function liveRoomCustomSchemeUrl(roomId: string): string {
  return `getvaulted://live/${encodeURIComponent(roomId.trim())}`;
}

export function appleAppSiteAssociationDocument(): Record<string, unknown> {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [IOS_APP_LINK_APP_ID],
          paths: ["/live/*", "/listing/*", "/marketplace/*", "/join", "/join/*"],
        },
      ],
    },
  };
}

export function androidAssetLinksDocument(sha256CertFingerprints: string[]): Record<string, unknown>[] {
  if (sha256CertFingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_APP_LINK_PACKAGE,
        sha256_cert_fingerprints: sha256CertFingerprints,
      },
    },
  ];
}

export function androidAppLinkSha256FingerprintsFromEnv(): string[] {
  const raw =
    process.env.ANDROID_APP_LINK_SHA256?.trim() ||
    process.env.NEXT_PUBLIC_ANDROID_APP_LINK_SHA256?.trim() ||
    "";
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((f) => f.trim())
    .filter(Boolean);
}
