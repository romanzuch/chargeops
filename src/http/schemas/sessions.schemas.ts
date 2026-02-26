import { z } from "zod";

const sessionStatusSchema = z.enum(["active", "completed", "error"]);

export const StartSessionBodySchema = z.object({
  plug_id: z.string().uuid(),
});

export type StartSessionBody = z.infer<typeof StartSessionBodySchema>;

export const SessionResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  plugId: z.string(),
  tenantId: z.string(),
  tariffId: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  energyKwh: z.number().nullable(),
  cost: z.number().nullable(),
  currency: z.string().nullable(),
  status: sessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SessionResponse = z.infer<typeof SessionResponseSchema>;
