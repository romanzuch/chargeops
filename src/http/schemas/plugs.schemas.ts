import { z } from "zod";

const connectorTypeSchema = z.enum(["ccs", "chademo", "type2", "type1", "schuko", "other"]);
const plugStatusSchema = z.enum(["available", "occupied", "out_of_service", "reserved"]);

export const CreatePlugBodySchema = z.object({
  connector_type: connectorTypeSchema,
  max_power_kw: z.number().positive("max_power_kw must be positive"),
  status: plugStatusSchema.optional(),
});

export type CreatePlugBody = z.infer<typeof CreatePlugBodySchema>;

export const UpdatePlugBodySchema = z
  .object({
    connector_type: connectorTypeSchema.optional(),
    max_power_kw: z.number().positive().optional(),
    status: plugStatusSchema.optional(),
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

export type UpdatePlugBody = z.infer<typeof UpdatePlugBodySchema>;

export const PlugResponseSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  connectorType: connectorTypeSchema,
  maxPowerKw: z.number(),
  status: plugStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type PlugResponse = z.infer<typeof PlugResponseSchema>;
