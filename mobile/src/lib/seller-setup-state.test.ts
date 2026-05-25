import { describe, expect, it } from 'vitest';
import { resolveWizardCompleteFromSources } from './seller-setup-state';

describe('resolveWizardCompleteFromSources', () => {
  it('prefers server completion timestamp over local cache', () => {
    const r = resolveWizardCompleteFromSources({
      sellerSetupWizardCompletedAt: '2026-05-01T00:00:00.000Z',
      setupWizardComplete: true,
      localWizardComplete: false,
      stickyServerConfirmed: false,
      serverResponded: true,
    });
    expect(r.wizardComplete).toBe(true);
    expect(r.serverWizardConfirmed).toBe(true);
  });

  it('keeps sticky server confirmed when a refetch fails', () => {
    const r = resolveWizardCompleteFromSources({
      localWizardComplete: false,
      stickyServerConfirmed: true,
      serverResponded: false,
    });
    expect(r.wizardComplete).toBe(true);
    expect(r.serverWizardConfirmed).toBe(true);
  });

  it('does not let AsyncStorage override explicit server incomplete', () => {
    const r = resolveWizardCompleteFromSources({
      setupWizardComplete: false,
      localWizardComplete: true,
      stickyServerConfirmed: false,
      serverResponded: true,
    });
    expect(r.wizardComplete).toBe(true);
    expect(r.serverExplicitIncomplete).toBe(true);
  });

  it('uses setupWizardComplete boolean when timestamp omitted', () => {
    const r = resolveWizardCompleteFromSources({
      setupWizardComplete: true,
      localWizardComplete: false,
      stickyServerConfirmed: false,
      serverResponded: true,
    });
    expect(r.wizardComplete).toBe(true);
    expect(r.serverWizardConfirmed).toBe(true);
  });
});
