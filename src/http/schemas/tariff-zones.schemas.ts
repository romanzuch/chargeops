import { z } from "zod";

export const CreateTariffZoneBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

export type CreateTariffZoneBody = z.infer<typeof CreateTariffZoneBodySchema>;

export const UpdateTariffZoneBodySchema = z
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

export type UpdateTariffZoneBody = z.infer<typeof UpdateTariffZoneBodySchema>;

export const TariffZoneResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TariffZoneResponse = z.infer<typeof TariffZoneResponseSchema>;

export const AddLocationBodySchema = z.object({
  location_id: z.string().uuid(),
});

export type AddLocationBody = z.infer<typeof AddLocationBodySchema>;

export const AddTariffBodySchema = z.object({
  tariff_id: z.string().uuid(),
});

export type AddTariffBody = z.infer<typeof AddTariffBodySchema>;
