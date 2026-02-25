import { z } from "zod";

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * Common query parameters for paginated list endpoints.
 *
 * - limit: number of items to return (default 20, max 100)
 * - offset: number of items to skip (default 0)
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * Wraps a paginated response with data and total count.
 */
export function paginatedResponse<T>(data: T[], total: number) {
  return { data, total };
}

export type PaginatedResponse<T> = { data: T[]; total: number };
