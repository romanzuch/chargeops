import { z } from "zod";

const stationStatusSchema = z.enum(["active", "planning", "inactive", "error"]);

/**
 * POST /stations request body.
 *
 * - name: required, non-empty
 * - external_id: optional reference to an external system
 * - latitude / longitude: both optional, but must be provided together
 * - status: optional (DB defaults to 'active')
 */
export const CreateStationBodySchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    external_id: z.string().max(255).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    status: stationStatusSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasLat = data.latitude !== undefined;
    const hasLon = data.longitude !== undefined;
    if (hasLat !== hasLon) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitude and longitude must be provided together",
        path: hasLat ? ["longitude"] : ["latitude"],
      });
    }
  });

export type CreateStationBody = z.infer<typeof CreateStationBodySchema>;

/**
 * PATCH /stations/:id request body.
 *
 * All fields optional; at least one must be present.
 * Setting external_id, latitude, or longitude to null clears the value.
 */
export const UpdateStationBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    external_id: z.string().max(255).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    status: stationStatusSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasFields = Object.values(data).some((v) => v !== undefined);
    if (!hasFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided",
      });
    }
    const hasLat = data.latitude !== undefined;
    const hasLon = data.longitude !== undefined;
    if (hasLat !== hasLon) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitude and longitude must be provided together",
        path: hasLat ? ["longitude"] : ["latitude"],
      });
    }
  });

export type UpdateStationBody = z.infer<typeof UpdateStationBodySchema>;

/**
 * Station resource response shape.
 */
export const StationResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  externalId: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  status: stationStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type StationResponse = z.infer<typeof StationResponseSchema>;
