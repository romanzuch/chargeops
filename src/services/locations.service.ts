import type { Kysely, Selectable } from "kysely";
import type { Database, LocationsTable } from "../db/types.js";
import { NotFoundError } from "../http/errors.js";
import {
  createLocation,
  findLocationById,
  findPublicLocations,
  findPublicLocationById,
  findLocationsByTenant,
  findAccessibleLocations,
  updateLocation,
  softDeleteLocation,
  type CreateLocationInput,
  type UpdateLocationInput,
  type PaginationInput,
  type PaginatedLocations,
} from "../repositories/locations.repo.js";

export type { PaginatedLocations };

export class LocationsService {
  constructor(private db: Kysely<Database>) {}

  async createLocation(
    tenantId: string,
    input: Omit<CreateLocationInput, "tenantId">,
  ): Promise<Selectable<LocationsTable>> {
    return createLocation(this.db, { ...input, tenantId });
  }

  async updateLocation(
    locationId: string,
    tenantId: string,
    input: UpdateLocationInput,
  ): Promise<Selectable<LocationsTable>> {
    const location = await updateLocation(this.db, locationId, tenantId, input);
    if (!location) {
      throw new NotFoundError("Location not found");
    }
    return location;
  }

  async deleteLocation(locationId: string, tenantId: string): Promise<void> {
    const deleted = await softDeleteLocation(this.db, locationId, tenantId);
    if (!deleted) {
      throw new NotFoundError("Location not found");
    }
  }

  async getPublicLocations(pagination: PaginationInput): Promise<PaginatedLocations> {
    return findPublicLocations(this.db, pagination);
  }

  async getPublicLocation(locationId: string): Promise<Selectable<LocationsTable>> {
    const location = await findPublicLocationById(this.db, locationId);
    if (!location) {
      throw new NotFoundError("Location not found");
    }
    return location;
  }

  async getTenantLocations(
    tenantId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedLocations> {
    return findLocationsByTenant(this.db, tenantId, pagination);
  }

  async getAccessibleLocations(
    tenantId: string,
    userId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedLocations> {
    return findAccessibleLocations(this.db, tenantId, userId, pagination);
  }

  async getTenantLocation(
    locationId: string,
    tenantId: string,
  ): Promise<Selectable<LocationsTable>> {
    const location = await findLocationById(this.db, locationId, tenantId);
    if (!location) {
      throw new NotFoundError("Location not found");
    }
    return location;
  }
}
