/**
 * Seller applications: the questions we ask, the validation, and the status rules.
 * Pure (no database) so web, the API routes, and tests all share one source of truth.
 */

export type SellerApplicationStatusValue = "pending" | "info_requested" | "approved" | "rejected" | "revoked";

/** What the applicant sees when they have no application row at all. */
export type SellerApprovalState = "not_applied" | SellerApplicationStatusValue;

export type SellerApplicationAction = "approve" | "reject" | "request_info" | "revoke";

export const SELLER_MONTHLY_VOLUME_OPTIONS = [
  { value: "just_starting", label: "Just getting started" },
  { value: "under_500", label: "Under $500 / month" },
  { value: "500_2000", label: "$500 – $2,000 / month" },
  { value: "2000_10000", label: "$2,000 – $10,000 / month" },
  { value: "10000_plus", label: "$10,000+ / month" },
] as const;

export type SellerMonthlyVolume = (typeof SELLER_MONTHLY_VOLUME_OPTIONS)[number]["value"];

export const SELLER_APPLICATION_LIMITS = {
  whatTheySell: { min: 10, max: 1000 },
  whereTheySellNow: { min: 3, max: 1000 },
  experience: { min: 10, max: 2000 },
  adminNote: { max: 1000 },
} as const;

export type SellerApplicationInput = {
  whatTheySell: string;
  whereTheySellNow: string;
  experience: string;
  monthlyVolume: SellerMonthlyVolume;
};

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

export function volumeLabel(value: string): string {
  return SELLER_MONTHLY_VOLUME_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function validateSellerApplicationInput(
  raw: unknown,
): { ok: true; value: SellerApplicationInput } | { ok: false; error: string } {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const whatTheySell = clean(body.whatTheySell);
  const whereTheySellNow = clean(body.whereTheySellNow);
  const experience = clean(body.experience);
  const monthlyVolume = clean(body.monthlyVolume);

  const L = SELLER_APPLICATION_LIMITS;
  if (whatTheySell.length < L.whatTheySell.min) {
    return { ok: false, error: "Tell us what you sell (a sentence or two is fine)." };
  }
  if (whatTheySell.length > L.whatTheySell.max) {
    return { ok: false, error: `"What you sell" is too long (max ${L.whatTheySell.max} characters).` };
  }
  if (whereTheySellNow.length < L.whereTheySellNow.min) {
    return { ok: false, error: "Tell us where you sell today (or write “nowhere yet”)." };
  }
  if (whereTheySellNow.length > L.whereTheySellNow.max) {
    return { ok: false, error: `"Where you sell now" is too long (max ${L.whereTheySellNow.max} characters).` };
  }
  if (experience.length < L.experience.min) {
    return { ok: false, error: "Tell us a bit about your selling experience." };
  }
  if (experience.length > L.experience.max) {
    return { ok: false, error: `"Experience" is too long (max ${L.experience.max} characters).` };
  }
  if (!SELLER_MONTHLY_VOLUME_OPTIONS.some((o) => o.value === monthlyVolume)) {
    return { ok: false, error: "Pick your typical monthly sales volume." };
  }
  return {
    ok: true,
    value: { whatTheySell, whereTheySellNow, experience, monthlyVolume: monthlyVolume as SellerMonthlyVolume },
  };
}

/** Can the applicant (re)submit from this state? */
export function applicantCanSubmit(state: SellerApprovalState): boolean {
  return state === "not_applied" || state === "info_requested";
}

/** Result status of an admin action, or null when the action isn't allowed from this status. */
export function nextStatusForAction(
  current: SellerApplicationStatusValue,
  action: SellerApplicationAction,
): SellerApplicationStatusValue | null {
  switch (action) {
    case "approve":
      return current === "approved" ? null : "approved";
    case "reject":
      return current === "pending" || current === "info_requested" ? "rejected" : null;
    case "request_info":
      return current === "pending" ? "info_requested" : null;
    case "revoke":
      return current === "approved" ? "revoked" : null;
    default:
      return null;
  }
}

/** Actions that must carry a message to the applicant. */
export function actionRequiresNote(action: SellerApplicationAction): boolean {
  return action === "reject" || action === "request_info" || action === "revoke";
}

/** Plain-language reason shown to a seller who is not approved. `null` means no block. */
export function sellerApprovalBlockMessage(state: SellerApprovalState): string | null {
  switch (state) {
    case "approved":
      return null;
    case "not_applied":
      return "Apply to sell on Get Vaulted. New sellers are approved before they can list or go live — apply under Account → Seller.";
    case "pending":
      return "Your seller application is under review. We'll notify you as soon as it's decided.";
    case "info_requested":
      return "We need a little more information on your seller application. Open it under Account → Seller to reply.";
    case "rejected":
      return "Your seller application wasn't approved. Contact support if you have questions.";
    case "revoked":
      return "Your seller access is paused. Contact support for details.";
    default:
      return null;
  }
}

export const SELLER_APPLY_PATH = "/account/seller/apply";
