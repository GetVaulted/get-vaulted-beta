import { OAUTH_BRAND_ASSETS } from "@/lib/oauth-brand-assets";

type MarkProps = {
  className?: string;
};

/** Official multicolor Google "G" on a white pad (Identity branding requirement). */
export function GoogleOAuthMark({ className }: MarkProps) {
  return (
    <span
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-white p-[2px] ${className ?? ""}`}
      aria-hidden
    >
      <img
        src={OAUTH_BRAND_ASSETS.googleGOnWhite}
        alt=""
        width={16}
        height={16}
        className="size-4 object-contain"
        decoding="async"
      />
    </span>
  );
}

/** Official Sign in with Apple logo mark (for dark buttons). */
export function AppleOAuthMark({ className }: MarkProps) {
  return (
    <img
      src={OAUTH_BRAND_ASSETS.appleLogoWhite}
      alt=""
      width={18}
      height={18}
      className={`size-[18px] shrink-0 object-contain ${className ?? ""}`}
      decoding="async"
      aria-hidden
    />
  );
}
