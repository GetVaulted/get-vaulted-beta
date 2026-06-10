import { AccountStanding, SellerFraudStatus } from "@/generated/prisma/enums";

export type AccountStandingInput = {
  completedOrders: number;
  cancellationRate: number;
  chargebackRate: number;
  disputeRate: number;
  trackingComplianceRate: number;
  fraudStatus: SellerFraudStatus;
  unresolvedDisputeCount: number;
  excessiveShippingDelayCount: number;
  accountSuspended: boolean;
};

const NEEDS_ATTENTION_CANCEL = 0.02;
const NEEDS_ATTENTION_DISPUTE = 0.02;
const NEEDS_ATTENTION_CHARGEBACK = 0.01;
const GOOD_TRACKING_FLOOR = 0.85;

/** Operational trust signal until a dedicated buyer review system exists. */
export function computeAccountStanding(input: AccountStandingInput): AccountStanding {
  if (input.accountSuspended || input.fraudStatus === SellerFraudStatus.flagged) {
    return AccountStanding.restricted;
  }
  if (input.fraudStatus === SellerFraudStatus.investigation) {
    return AccountStanding.restricted;
  }
  if (input.chargebackRate > NEEDS_ATTENTION_CHARGEBACK) {
    return AccountStanding.restricted;
  }
  if (
    input.cancellationRate > NEEDS_ATTENTION_CANCEL ||
    input.disputeRate > NEEDS_ATTENTION_DISPUTE ||
    input.unresolvedDisputeCount >= 2
  ) {
    return AccountStanding.needs_attention;
  }
  if (
    input.excessiveShippingDelayCount > 0 ||
    input.unresolvedDisputeCount > 0 ||
    input.trackingComplianceRate < GOOD_TRACKING_FLOOR ||
    input.chargebackRate > 0.005 ||
    input.cancellationRate > 0.01 ||
    input.disputeRate > 0.01
  ) {
    return AccountStanding.good;
  }
  if (input.completedOrders === 0) {
    return AccountStanding.good;
  }
  return AccountStanding.excellent;
}

export function accountStandingLabel(standing: AccountStanding): string {
  switch (standing) {
    case AccountStanding.excellent:
      return "Excellent";
    case AccountStanding.good:
      return "Good";
    case AccountStanding.needs_attention:
      return "Needs Attention";
    case AccountStanding.restricted:
      return "Restricted";
    default:
      return "Good";
  }
}

export function accountStandingMeetsFast(standing: AccountStanding): boolean {
  return standing === AccountStanding.excellent || standing === AccountStanding.good;
}

export function accountStandingMeetsInstant(standing: AccountStanding): boolean {
  return standing === AccountStanding.excellent;
}
