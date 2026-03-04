import { z } from "zod";

const locationVisibilitySchema = z.enum(["public", "private"]);

export const PlugSummarySchema = z.object({
  id: z.string(),
  connectorType: z.enum(["ccs", "chademo", "type2", "type1", "schuko", "other"]),
  maxPowerKw: z.number(),
  status: z.enum(["available", "occupied", "out_of_service", "reserved"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export const StationWithPlugsSchema = z.object({
  id: z.string(),
  name: z.string(),
  externalId: z.string().nullable(),
  status: z.enum(["active", "planning", "inactive", "error"]),
  visibility: z.enum(["public", "private"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  plugs: z.array(PlugSummarySchema),
});

export const CreateLocationBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  country: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  visibility: locationVisibilitySchema.optional(),
});

export type CreateLocationBody = z.infer<typeof CreateLocationBodySchema>;

export const UpdateLocationBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    address: z.string().max(500).nullable().optional(),
    city: z.string().max(255).nullable().optional(),
    country: z.string().max(100).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    visibility: locationVisibilitySchema.optional(),
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

export type UpdateLocationBody = z.infer<typeof UpdateLocationBodySchema>;

export const LocationResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  visibility: locationVisibilitySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  stations: z.array(StationWithPlugsSchema).optional(),
});

const connectorTypeSchema = z.enum(["ccs", "chademo", "type2", "type1", "schuko", "other"]);

export const PlugMapSummarySchema = z.object({
  total: z.number().int(),
  available: z.number().int(),
  maxPowerKw: z.number().nullable(),
  hasHighPowerCharging: z.boolean(),
  connectorTypes: z.array(connectorTypeSchema),
});

export const LocationListItemResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  visibility: locationVisibilitySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  stationCount: z.number().int(),
  activeStationCount: z.number().int(),
  plugSummary: PlugMapSummarySchema,
});

export type LocationResponse = z.infer<typeof LocationResponseSchema>;
export type LocationListItemResponse = z.infer<typeof LocationListItemResponseSchema>;
export type PlugSummary = z.infer<typeof PlugSummarySchema>;
export type PlugMapSummary = z.infer<typeof PlugMapSummarySchema>;
export type StationWithPlugs = z.infer<typeof StationWithPlugsSchema>;
