import { z } from "zod";

const stationStatusSchema = z.enum(["active", "planning", "inactive", "error"]);
const stationVisibilitySchema = z.enum(["public", "private"]);

/**
 * POST /stations request body.
 *
 * - name: required, non-empty
 * - external_id: optional reference to an external system
 * - location_id: optional FK to a location
 * - status: optional (DB defaults to 'active')
 * - visibility: optional (DB defaults to 'public')
 */
export const CreateStationBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  external_id: z.string().max(255).optional(),
  location_id: z.string().uuid().optional(),
  status: stationStatusSchema.optional(),
  visibility: stationVisibilitySchema.optional(),
});

export type CreateStationBody = z.infer<typeof CreateStationBodySchema>;

/**
 * PATCH /stations/:id request body.
 *
 * All fields optional; at least one must be present.
 * Setting external_id or location_id to null clears the value.
 */
export const UpdateStationBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    external_id: z.string().max(255).nullable().optional(),
    location_id: z.string().uuid().nullable().optional(),
    status: stationStatusSchema.optional(),
    visibility: stationVisibilitySchema.optional(),
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

export type UpdateStationBody = z.infer<typeof UpdateStationBodySchema>;

/**
 * Station resource response shape.
 */
export const StationResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  externalId: z.string().nullable(),
  locationId: z.string().nullable(),
  status: stationStatusSchema,
  visibility: stationVisibilitySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type StationResponse = z.infer<typeof StationResponseSchema>;
