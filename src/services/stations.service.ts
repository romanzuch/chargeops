import type { Kysely, Selectable } from "kysely";
import type { Database, StationsTable } from "../db/types.js";
import { NotFoundError } from "../http/errors.js";
import {
  createStation,
  updateStation,
  findPublicStations,
  findPublicStationById,
  findStationsByTenant,
  findStationByIdForTenant,
  type CreateStationInput,
  type UpdateStationInput,
  type PaginationInput,
  type PaginatedStations,
} from "../repositories/stations.repo.js";

export type { PaginatedStations };

export class StationsService {
  constructor(private db: Kysely<Database>) {}

  async createStation(
    tenantId: string,
    input: Omit<CreateStationInput, "tenantId">,
  ): Promise<Selectable<StationsTable>> {
    return createStation(this.db, { ...input, tenantId });
  }

  async updateStation(
    stationId: string,
    tenantId: string,
    input: UpdateStationInput,
  ): Promise<Selectable<StationsTable>> {
    const station = await updateStation(this.db, stationId, tenantId, input);
    if (!station) {
      throw new NotFoundError("Station not found");
    }
    return station;
  }

  async getPublicStations(pagination: PaginationInput): Promise<PaginatedStations> {
    return findPublicStations(this.db, pagination);
  }

  async getPublicStation(stationId: string): Promise<Selectable<StationsTable>> {
    const station = await findPublicStationById(this.db, stationId);
    if (!station) {
      throw new NotFoundError("Station not found");
    }
    return station;
  }

  async getTenantStations(
    tenantId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedStations> {
    return findStationsByTenant(this.db, tenantId, pagination);
  }

  async getTenantStation(stationId: string, tenantId: string): Promise<Selectable<StationsTable>> {
    const station = await findStationByIdForTenant(this.db, stationId, tenantId);
    if (!station) {
      throw new NotFoundError("Station not found");
    }
    return station;
  }
}
