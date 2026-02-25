import type { Kysely, Selectable } from "kysely";
import type { Database, StationsTable } from "../db/types.js";
import { NotFoundError } from "../http/errors.js";
import {
  createStation,
  updateStation,
  type CreateStationInput,
  type UpdateStationInput,
} from "../repositories/stations.repo.js";

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
}
