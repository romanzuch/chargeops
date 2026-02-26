import { z } from "zod";

export const CreateTariffBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  price_per_kwh: z.number().nonnegative().optional(),
  price_per_minute: z.number().nonnegative().optional(),
  price_per_session: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
});

export type CreateTariffBody = z.infer<typeof CreateTariffBodySchema>;

export const UpdateTariffBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    price_per_kwh: z.number().nonnegative().nullable().optional(),
    price_per_minute: z.number().nonnegative().nullable().optional(),
    price_per_session: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).optional(),
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

export type UpdateTariffBody = z.infer<typeof UpdateTariffBodySchema>;

export const TariffResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  pricePerKwh: z.number().nullable(),
  pricePerMinute: z.number().nullable(),
  pricePerSession: z.number().nullable(),
  currency: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type TariffResponse = z.infer<typeof TariffResponseSchema>;
