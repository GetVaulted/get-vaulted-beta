import { userHasOpenOrders } from "@/lib/open-orders";

export const USERNAME_CHANGE_LOCK_DAYS = 60;
const LOCK_MS = USERNAME_CHANGE_LOCK_DAYS * 24 * 60 * 60 * 1000;

export type UsernameChangeBlockReason = "lock" | "open_orders";

export type UsernameChangeEligibility = {
  canChange: boolean;
  reason: UsernameChangeBlockReason | null;
  lockExpiresAt: string | null;
  hasOpenOrders: boolean;
};

export function usernameChangeLockExpiresAt(chosenAt: Date): Date {
  return new Date(chosenAt.getTime() + LOCK_MS);
}

export function isUsernameChangeLocked(chosenAt: Date | null, now: Date = new Date()): boolean {
  if (!chosenAt) return false;
  return now.getTime() < usernameChangeLockExpiresAt(chosenAt).getTime();
}

export async function getUsernameChangeEligibility(args: {
  userId: string;
  usernameChosenAt: Date | null;
}): Promise<UsernameChangeEligibility> {
  const hasOpenOrders = await userHasOpenOrders(args.userId);
  if (hasOpenOrders) {
    return { canChange: false, reason: "open_orders", lockExpiresAt: null, hasOpenOrders: true };
  }
  if (isUsernameChangeLocked(args.usernameChosenAt)) {
    const lockExpiresAt = args.usernameChosenAt
      ? usernameChangeLockExpiresAt(args.usernameChosenAt).toISOString()
      : null;
    return { canChange: false, reason: "lock", lockExpiresAt, hasOpenOrders: false };
  }
  return { canChange: true, reason: null, lockExpiresAt: null, hasOpenOrders: false };
}

export function usernameChangeBlockMessage(reason: UsernameChangeBlockReason): string {
  if (reason === "open_orders") {
    return "You cannot change your username while you have open orders. Complete or resolve them first.";
  }
  return `Usernames can only be changed once every ${USERNAME_CHANGE_LOCK_DAYS} days.`;
}
