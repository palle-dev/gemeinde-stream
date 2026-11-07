import { describe, expect, it } from "vitest";
import {
  normalizeAuthEmail,
  normalizeOtpCode,
  validOtpCode,
  verifyAndLoginRegistration,
} from "./authRegistration";

describe("registration input normalization", () => {
  it("uses one canonical email for registration, resend and verification", () => {
    expect(normalizeAuthEmail("  Gemeinde.User@Example.DE ")).toBe(
      "gemeinde.user@example.de",
    );
  });

  it("removes formatting and invisible characters from copied OTP codes", () => {
    expect(normalizeOtpCode("１２３\u200B ４５-６")).toBe("123456");
  });

  it("accepts only a complete six-digit Base44 OTP", () => {
    expect(validOtpCode("123456")).toBe(true);
    expect(validOtpCode("12345")).toBe(false);
    expect(validOtpCode("1234567")).toBe(false);
  });

  it("verifies a fresh code before logging in", async () => {
    const calls: string[] = [];
    const result = await verifyAndLoginRegistration(
      {
        async verifyOtp() {
          calls.push("verify");
        },
        async loginViaEmailPassword() {
          calls.push("login");
          return { user: "anna" };
        },
      },
      "anna@example.de",
      "password",
      "123456",
    );

    expect(calls).toEqual(["verify", "login"]);
    expect(result).toEqual({ user: "anna" });
  });

  it("recovers when the single-use code was already consumed", async () => {
    const result = await verifyAndLoginRegistration(
      {
        async verifyOtp() {
          throw new Error("Invalid or expired code");
        },
        async loginViaEmailPassword() {
          return { user: "anna" };
        },
      },
      "anna@example.de",
      "password",
      "123456",
    );

    expect(result).toEqual({ user: "anna" });
  });

  it("preserves the verification error for a genuinely invalid code", async () => {
    const verificationError = new Error("Invalid or expired code");
    await expect(
      verifyAndLoginRegistration(
        {
          async verifyOtp() {
            throw verificationError;
          },
          async loginViaEmailPassword() {
            throw new Error("Login failed");
          },
        },
        "anna@example.de",
        "password",
        "000000",
      ),
    ).rejects.toBe(verificationError);
  });
});
