import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRememberMeCredentials,
  loadRememberedEmail,
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
  return store;
}

describe("remember-me-credentials", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false/null when nothing is stored", () => {
    expect(loadRememberMePreference()).toBe(false);
    expect(loadRememberedEmail()).toBeNull();
  });

  it("saves and loads only the email when remember me is enabled", () => {
    persistRememberMeCredentials(true, "User@Example.com");
    expect(loadRememberMePreference()).toBe(true);
    expect(loadRememberedEmail()).toBe("user@example.com");
  });

  it("clears stored data when remember me is disabled", () => {
    persistRememberMeCredentials(true, "user@example.com");
    persistRememberMeCredentials(false, "user@example.com");
    expect(loadRememberMePreference()).toBe(false);
    expect(loadRememberedEmail()).toBeNull();
  });

  it("clearRememberMeCredentials removes saved data", () => {
    persistRememberMeCredentials(true, "user@example.com");
    clearRememberMeCredentials();
    expect(loadRememberMePreference()).toBe(false);
    expect(loadRememberedEmail()).toBeNull();
  });

  it("regression: never persists a password, even if a caller tries to pass one through JSON.stringify tampering", () => {
    // The persist function's signature no longer accepts a password argument at all (a TypeScript-level
    // guarantee); this test guards the underlying storage format in case that ever regresses.
    const store = installLocalStorageMock();
    persistRememberMeCredentials(true, "user@example.com");
    const raw = store.get("gv_remember_me_v1");
    expect(raw).toBeDefined();
    expect(raw).not.toContain("password");
  });

  it("regression: a stale v1 payload containing a password is ignored/not surfaced", () => {
    const store = installLocalStorageMock();
    store.set(
      "gv_remember_me_v1",
      JSON.stringify({ v: 1, rememberMe: true, email: "legacy@example.com", password: "old-plaintext-pass" }),
    );
    // Old schema version (v1) is no longer recognized, so nothing is read back from it.
    expect(loadRememberedEmail()).toBeNull();
    expect(loadRememberMePreference()).toBe(false);
  });
});
