import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLiveMarketplaceBetaDeploy,
  isLiveMarketplaceBlocked,
  isLiveMarketplacePubliclyAvailable,
} from "./live-coming-soon";

describe("live-coming-soon", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks when no flags and not a beta deploy host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_MARKETPLACE_ENABLED", "");
    vi.stubEnv("URL", "https://shopgetvaulted.com");
    expect(isLiveMarketplacePubliclyAvailable()).toBe(false);
    expect(isLiveMarketplaceBlocked()).toBe(true);
  });

  it("allows when LIVE_MARKETPLACE_ENABLED is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_MARKETPLACE_ENABLED", "1");
    expect(isLiveMarketplacePubliclyAvailable()).toBe(true);
  });

  it("allows beta.shopgetvaulted.com via URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_MARKETPLACE_ENABLED", "");
    vi.stubEnv("URL", "https://beta.shopgetvaulted.com");
    expect(isLiveMarketplaceBetaDeploy()).toBe(true);
    expect(isLiveMarketplacePubliclyAvailable()).toBe(true);
  });

  it("COMING_SOON kills even on beta", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("URL", "https://beta.shopgetvaulted.com");
    vi.stubEnv("LIVE_MARKETPLACE_COMING_SOON", "1");
    expect(isLiveMarketplacePubliclyAvailable()).toBe(false);
  });
});
