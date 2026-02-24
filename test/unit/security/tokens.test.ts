import { describe, expect, it } from "vitest";
import { randomTokenBytes } from "../../../src/security/tokens.js";

describe("randomTokenBytes", () => {
  it("returns a Buffer", () => {
    expect(Buffer.isBuffer(randomTokenBytes())).toBe(true);
  });

  it("returns 32 bytes by default", () => {
    expect(randomTokenBytes().byteLength).toBe(32);
  });

  it("returns the requested byte count", () => {
    expect(randomTokenBytes(16).byteLength).toBe(16);
    expect(randomTokenBytes(64).byteLength).toBe(64);
  });

  it("produces different values on every call", () => {
    const a = randomTokenBytes();
    const b = randomTokenBytes();
    expect(a.equals(b)).toBe(false);
  });

  it("produces base64url-encodable output (typical client token format)", () => {
    const token = randomTokenBytes().toString("base64url");
    // base64url: A-Z a-z 0-9 - _  (no + / =)
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
