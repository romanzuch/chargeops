import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../../../src/security/password.js";

describe("validatePasswordStrength", () => {
  it("accepts a password at exactly the minimum length", () => {
    const result = validatePasswordStrength("a".repeat(PASSWORD_MIN_LENGTH));
    expect(result.ok).toBe(true);
  });

  it("accepts a password above the minimum length", () => {
    const result = validatePasswordStrength("a".repeat(PASSWORD_MIN_LENGTH + 10));
    expect(result.ok).toBe(true);
  });

  it("rejects a password below the minimum length", () => {
    const result = validatePasswordStrength("a".repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.ok).toBe(false);
  });

  it("includes the minimum length in the rejection reason", () => {
    const result = validatePasswordStrength("short");
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toContain(String(PASSWORD_MIN_LENGTH));
  });
});

describe("hashPassword", () => {
  it("returns a non-empty string", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("does not return the plain-text password", async () => {
    const plain = "correct-horse-battery-staple";
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
    expect(hash).not.toContain(plain);
  });

  it("produces a unique hash on every call (salted)", async () => {
    const plain = "same-password-every-time";
    const [h1, h2] = await Promise.all([hashPassword(plain), hashPassword(plain)]);
    expect(h1).not.toBe(h2);
  });
});

describe("verifyPassword", () => {
  it("returns true when the password matches the hash", async () => {
    const plain = "correct-horse-battery-staple";
    const hash = await hashPassword(plain);
    await expect(verifyPassword(plain, hash)).resolves.toBe(true);
  });

  it("returns false when the password does not match", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password-000", hash)).resolves.toBe(false);
  });

  it("returns false for an empty string against a real hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("verifies hashes produced from the same password", async () => {
    const plain = "same-password-every-time";
    const [h1, h2] = await Promise.all([hashPassword(plain), hashPassword(plain)]);
    await expect(verifyPassword(plain, h1)).resolves.toBe(true);
    await expect(verifyPassword(plain, h2)).resolves.toBe(true);
  });
});
