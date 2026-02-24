import { describe, expect, it } from "vitest";
import { safeEqual } from "../../../src/security/safe-compare.js";

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for strings of the same length but different content", () => {
    expect(safeEqual("aaaaaa", "bbbbbb")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeEqual("short", "muchlongerstring")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });

  it("returns false when one string is empty", () => {
    expect(safeEqual("notempty", "")).toBe(false);
    expect(safeEqual("", "notempty")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(safeEqual("Secret", "secret")).toBe(false);
    expect(safeEqual("SECRET", "SECRET")).toBe(true);
  });

  it("handles unicode strings correctly", () => {
    expect(safeEqual("héllo", "héllo")).toBe(true);
    expect(safeEqual("héllo", "hello")).toBe(false);
  });

  it("handles hex token hashes (typical use case)", () => {
    const hash = "a".repeat(64); // 64-char hex string
    expect(safeEqual(hash, hash)).toBe(true);
    expect(safeEqual(hash, "b".repeat(64))).toBe(false);
  });
});
