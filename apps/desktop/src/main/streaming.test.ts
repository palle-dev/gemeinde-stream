import { afterEach, describe, expect, it, vi } from "vitest";
import { settlesWithin } from "./streaming";

afterEach(() => vi.useRealTimers());

describe("stream shutdown timeout", () => {
  it("reports a completed or rejected write queue as settled", async () => {
    await expect(settlesWithin(Promise.resolve(), 100)).resolves.toBe(true);
    await expect(
      settlesWithin(Promise.reject(new Error("pipe closed")), 100),
    ).resolves.toBe(true);
  });

  it("releases shutdown when a write queue no longer responds", async () => {
    vi.useFakeTimers();
    const result = settlesWithin(new Promise(() => undefined), 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe(false);
  });
});
