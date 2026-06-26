import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRememberMeCredentials,
  loadRememberedCredentials,
  loadRememberMePreference,
  persistRememberMeCredentials,
} from "@/lib/remember-me-credentials";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

describe("remember-me-credentials", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when nothing is stored", () => {
    expect(loadRememberMePreference()).toBe(false);
    expect(loadRememberedCredentials()).toBeNull();
  });

  it("saves and loads credentials when remember me is enabled", () => {
    persistRememberMeCredentials(true, "User@Example.com", "secret-pass");
    expect(loadRememberMePreference()).toBe(true);
    expect(loadRememberedCredentials()).toEqual({
      email: "user@example.com",
      password: "secret-pass",
    });
  });

  it("clears stored credentials when remember me is disabled", () => {
    persistRememberMeCredentials(true, "user@example.com", "secret-pass");
    persistRememberMeCredentials(false, "user@example.com", "secret-pass");
    expect(loadRememberMePreference()).toBe(false);
    expect(loadRememberedCredentials()).toBeNull();
  });

  it("clearRememberMeCredentials removes saved data", () => {
    persistRememberMeCredentials(true, "user@example.com", "secret-pass");
    clearRememberMeCredentials();
    expect(loadRememberMePreference()).toBe(false);
    expect(loadRememberedCredentials()).toBeNull();
  });
});
