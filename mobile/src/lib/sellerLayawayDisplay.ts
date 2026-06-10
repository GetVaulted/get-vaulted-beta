export function sellerLayawayStatusLabel(displayStatus: string): string {
  switch (displayStatus) {
    case 'active':
      return 'Active';
    case 'overdue':
      return 'Overdue';
    case 'completed':
      return 'Ready to ship';
    case 'defaulted':
      return 'Defaulted';
    default:
      return displayStatus.replace(/_/g, ' ');
  }
}

export function sellerLayawayPaymentKindLabel(kind: string): string {
  switch (kind) {
    case 'deposit':
      return 'Deposit';
    case 'installment':
      return 'Installment';
    case 'balance_payoff':
      return 'Balance payoff';
    default:
      return kind.replace(/_/g, ' ');
  }
}
