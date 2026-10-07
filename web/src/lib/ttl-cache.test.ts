import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "@/lib/ttl-cache";

describe("createTtlCache", () => {
  it("shares one in-flight load across concurrent callers", async () => {
    const cache = createTtlCache<number>();
    const load = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.get("k", 1000, load)));
    expect(results.every((r) => r === 42)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reuses the value until the TTL passes, then reloads", async () => {
    let t = 0;
    const cache = createTtlCache<string>(10, () => t);
    const load = vi.fn(async () => `v${t}`);
    expect(await cache.get("k", 100, load)).toBe("v0");
    t = 99;
    expect(await cache.get("k", 100, load)).toBe("v0");
    t = 101;
    expect(await cache.get("k", 100, load)).toBe("v101");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures", async () => {
    const cache = createTtlCache<number>();
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(7);
    await expect(cache.get("k", 1000, load)).rejects.toThrow("boom");
    expect(await cache.get("k", 1000, load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps keys separate and bounds its size", async () => {
    const cache = createTtlCache<number>(3);
    for (let i = 0; i < 10; i++) await cache.get(`k${i}`, 1000, async () => i);
    expect(cache.size()).toBeLessThanOrEqual(3);
  });
});
