import { describe, expect, it } from "vitest";
import { normalizeEmail } from "../../../src/security/email.js";

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeEmail("USER@EXAMPLE.COM")).toBe("user@example.com");
  });

  it("trims leading whitespace", () => {
    expect(normalizeEmail("  user@example.com")).toBe("user@example.com");
  });

  it("trims trailing whitespace", () => {
    expect(normalizeEmail("user@example.com  ")).toBe("user@example.com");
  });

  it("trims and lowercases together", () => {
    expect(normalizeEmail("  ADMIN@Company.IO  ")).toBe("admin@company.io");
  });

  it("leaves an already-normalized email unchanged", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });

  it("handles mixed-case domain", () => {
    expect(normalizeEmail("user@Example.COM")).toBe("user@example.com");
  });
});
