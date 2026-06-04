/** Structured logs for Create Vault Event → Seller Host Room (command center). */
export function logVaultCommandCenter(
  step: string,
  data?: Record<string, unknown>,
): void {
  console.info('[vault-command-center]', step, data ? JSON.stringify(data) : '');
}
