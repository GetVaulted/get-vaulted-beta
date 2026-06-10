import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";

export type BuyerLayawayUiPhase =
  | "active"
  | "pending_deposit"
  | "completed"
  | "defaulted"
  | "refunded"
  | "inactive";

export type BuyerLayawayUiInput = {
  status: string;
  amountPaidUsd: number;
  depositAmountUsd: number;
  remainingBalanceUsd: number;
  orderPaymentStatus: string | null;
};

export type BuyerLayawayUi = {
  phase: BuyerLayawayUiPhase;
  canMakePayment: boolean;
  badgeLabel: string;
  message: string | null;
};

function depositConfirmed(amountPaidUsd: number, depositAmountUsd: number): boolean {
  return amountPaidUsd + 0.001 >= depositAmountUsd;
}

/** Single source of truth for buyer layaway badge, messages, and payment eligibility. */
export function deriveBuyerLayawayUi(input: BuyerLayawayUiInput): BuyerLayawayUi {
  const remaining = Math.max(0, input.remainingBalanceUsd);
  const status = input.status.trim().toLowerCase();

  if (status === "completed" || status === "paid_off" || remaining <= 0) {
    return {
      phase: "completed",
      canMakePayment: false,
      badgeLabel: "Paid in full",
      message: null,
    };
  }

  if (status === "defaulted") {
    return {
      phase: "defaulted",
      canMakePayment: false,
      badgeLabel: "Defaulted",
      message: "This layaway has defaulted. The deposit is non-refundable.",
    };
  }

  if (status === "refunded") {
    return {
      phase: "refunded",
      canMakePayment: false,
      badgeLabel: "Canceled",
      message: "This layaway was canceled.",
    };
  }

  if (status === "active") {
    const orderReady = input.orderPaymentStatus === PAYMENT_LAYAWAY_ACTIVE;
    if (!orderReady) {
      if (!depositConfirmed(input.amountPaidUsd, input.depositAmountUsd)) {
        return {
          phase: "pending_deposit",
          canMakePayment: false,
          badgeLabel: "Deposit pending",
          message:
            "Complete your deposit checkout to activate this layaway. Balance payments unlock after the deposit is confirmed.",
        };
      }
      return {
        phase: "inactive",
        canMakePayment: false,
        badgeLabel: "Inactive",
        message: "This layaway is not active for payments right now.",
      };
    }
    if (remaining > 0) {
      return {
        phase: "active",
        canMakePayment: true,
        badgeLabel: "Active",
        message: null,
      };
    }
  }

  return {
    phase: "inactive",
    canMakePayment: false,
    badgeLabel: "Inactive",
    message: "This layaway is not active.",
  };
}
