import type { EscrowStatus } from "@/generated/prisma/enums";

export type EscrowProviderName = "trustap";

export type CreateEscrowTransactionResult = {
  transactionId: string;
  checkoutUrl: string;
  raw?: unknown;
  /** Persisted on `Order.trustapBuyerUserId` when guest buyer is created. */
  trustapBuyerUserId?: string;
};

export type EscrowTransactionStatusResult = {
  status: EscrowStatus;
  raw?: unknown;
};

export type ReleaseFundsResult = {
  escrowStatus: EscrowStatus;
  raw?: unknown;
};

/**
 * Pluggable escrow provider (Trustap today, Escrow.com or others later).
 */
export interface EscrowProvider {
  readonly name: EscrowProviderName;

  createEscrowTransaction(orderId: string): Promise<CreateEscrowTransactionResult>;

  getEscrowTransactionStatus(transactionId: string): Promise<EscrowTransactionStatusResult>;

  releaseFunds(transactionId: string): Promise<ReleaseFundsResult>;

  cancelEscrowTransaction(transactionId: string): Promise<void>;
}
