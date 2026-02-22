import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("parseEnv", () => {
  it("uses defaults when vars are missing", () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
  });

  it("coerces PORT to number", () => {
    const env = parseEnv({ PORT: "4000" });
    expect(env.PORT).toBe(4000);
  });

  it("throws on invalid PORT", () => {
    expect(() => parseEnv({ PORT: "99999"})).toThrow(/Invalid environment variable/);
  });
});
