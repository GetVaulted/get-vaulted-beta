/**
 * Plain-language messages for live-bundle label results. Mirrors web `formatBundledLabelError`
 * (AccountSalesPage), with app-appropriate wording for where to fix things.
 */
export function formatBundledLabelError(error: string | undefined, code: string | undefined): string {
  if (code === 'SHIPPO_NOT_CONFIGURED') {
    return 'Shipping labels are temporarily unavailable. Try again in a few minutes.';
  }
  if (code === 'SELLER_SHIP_FROM_INCOMPLETE') {
    return 'Complete your ship-from address in Seller HQ setup before creating labels.';
  }
  if (code === 'SELLER_CONTACT_INCOMPLETE') {
    return 'Add a contact phone in Seller HQ setup before creating USPS labels.';
  }
  if (code === 'BUYER_CONTACT_INCOMPLETE') {
    return 'The buyer’s ship-to is missing a contact phone. Ask the buyer to update their address in their Wallet.';
  }
  if (code === 'NO_ELIGIBLE_ORDERS') {
    return 'No paid, unlabeled orders in this bundle. Wait for buyer payment or use per-order labels for ship-alone items.';
  }
  if (code === 'NOT_A_COMBINED_BUNDLE_SESSION') {
    return 'This session is ship-alone only — create a label on each order instead.';
  }
  if (code === 'ALL_LABELS_BOUGHT') {
    return 'You’ve already bought a label for every order in this bundle.';
  }
  if (code === 'ADDITIONAL_LABELS_UNAVAILABLE') {
    return 'Extra labels are only available when the buyer has more than one Surprise Set spin and the first label is bought.';
  }
  if (code === 'NO_PRIMARY_LABEL_YET') {
    return 'Buy the first label for this bundle before adding extra ones.';
  }
  if (error?.includes('No Shippo rates')) {
    return 'No USPS/UPS rates came back. Check your ship-from address and the buyer’s address.';
  }
  return error ?? 'Bundled label creation failed.';
}

export type BundleFeedback = { tone: 'error' | 'success' | 'warning'; message: string };

/** Result message after a bundled label purchase. Mirrors the web messages. */
export function bundledLabelSuccessFeedback(args: {
  warning?: string;
  alreadyExisted?: boolean;
  labelUrl: string | null;
}): BundleFeedback {
  if (typeof args.warning === 'string' && args.warning.trim()) {
    return { tone: 'warning', message: args.warning };
  }
  if (args.alreadyExisted) {
    return { tone: 'success', message: 'Bundled label already exists for this session.' };
  }
  return {
    tone: 'success',
    message: args.labelUrl
      ? 'Bundled label created — tap Print to open it.'
      : 'Label purchase recorded. Pull to refresh if the Print button does not appear.',
  };
}

/** Result message after buying one more label for a bundle. */
export function additionalLabelSuccessFeedback(args: {
  warning?: string;
  labelUrl: string | null;
  packagesBought: number;
  maxPackages: number;
}): BundleFeedback {
  if (typeof args.warning === 'string' && args.warning.trim()) {
    return { tone: 'warning', message: args.warning };
  }
  const count =
    args.packagesBought > 0 && args.maxPackages > 0
      ? ` (${args.packagesBought} of ${args.maxPackages} bought)`
      : '';
  return {
    tone: 'success',
    message: args.labelUrl
      ? `Extra label bought${count} — tap Print to open it.`
      : `Extra label purchase recorded${count}. Pull to refresh if the Print button does not appear.`,
  };
}
