import { z } from "zod";

export const CreateCustomerGroupBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

export type CreateCustomerGroupBody = z.infer<typeof CreateCustomerGroupBodySchema>;

export const UpdateCustomerGroupBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
  })
  .superRefine((data, ctx) => {
    const hasFields = Object.values(data).some((v) => v !== undefined);
    if (!hasFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided",
      });
    }
  });

export type UpdateCustomerGroupBody = z.infer<typeof UpdateCustomerGroupBodySchema>;

export const CustomerGroupResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CustomerGroupResponse = z.infer<typeof CustomerGroupResponseSchema>;

export const AddMemberBodySchema = z.object({
  user_id: z.string().uuid(),
});

export type AddMemberBody = z.infer<typeof AddMemberBodySchema>;

export const AssignTariffBodySchema = z.object({
  tariff_id: z.string().uuid(),
});

export type AssignTariffBody = z.infer<typeof AssignTariffBodySchema>;

export const AssignTariffZoneBodySchema = z.object({
  tariff_zone_id: z.string().uuid(),
});

export type AssignTariffZoneBody = z.infer<typeof AssignTariffZoneBodySchema>;
