import { z } from "zod";

export const UpdateUserRoleBodySchema = z.object({
  role: z.enum(["tenant_admin", "tenant_view"], {
    error: 'role must be "tenant_admin" or "tenant_view"',
  }),
});

export const TenantUserResponseSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.string(),
  memberSince: z.string(),
});
