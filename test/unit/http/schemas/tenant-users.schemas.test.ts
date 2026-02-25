import { describe, it, expect } from "vitest";
import { UpdateUserRoleBodySchema } from "../../../../src/http/schemas/tenant-users.schemas.js";

describe("UpdateUserRoleBodySchema", () => {
  it("accepts tenant_admin", () => {
    const result = UpdateUserRoleBodySchema.safeParse({ role: "tenant_admin" });
    expect(result.success).toBe(true);
  });

  it("accepts tenant_view", () => {
    const result = UpdateUserRoleBodySchema.safeParse({ role: "tenant_view" });
    expect(result.success).toBe(true);
  });

  it("rejects driver", () => {
    const result = UpdateUserRoleBodySchema.safeParse({ role: "driver" });
    expect(result.success).toBe(false);
  });

  it("rejects super_admin", () => {
    const result = UpdateUserRoleBodySchema.safeParse({ role: "super_admin" });
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = UpdateUserRoleBodySchema.safeParse({ role: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing role field", () => {
    const result = UpdateUserRoleBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string role", () => {
    const result = UpdateUserRoleBodySchema.safeParse({ role: 123 });
    expect(result.success).toBe(false);
  });
});
