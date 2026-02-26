import type { Kysely, Selectable } from "kysely";
import type { ChargingSessionsTable, Database } from "../db/types.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../http/errors.js";
import {
  createSession,
  findSessionById,
  findActiveSessionByPlug,
  findSessionsByUser,
  findSessionsByTenant,
  endSession,
  type PaginationInput,
  type PaginatedSessions,
} from "../repositories/sessions.repo.js";
import { findPlugById } from "../repositories/plugs.repo.js";
import { findLocationById } from "../repositories/locations.repo.js";
import { findStationById } from "../repositories/stations.repo.js";
import { resolveApplicableTariff } from "../repositories/tariff-zones.repo.js";

export type { PaginatedSessions };

export class SessionsService {
  constructor(private db: Kysely<Database>) {}

  async startSession(
    userId: string,
    tenantId: string,
    plugId: string,
  ): Promise<Selectable<ChargingSessionsTable>> {
    // Validate plug exists
    const plug = await findPlugById(this.db, plugId);
    if (!plug) {
      throw new NotFoundError("Plug not found");
    }

    // Check no active session on this plug
    const activeSession = await findActiveSessionByPlug(this.db, plugId);
    if (activeSession) {
      throw new ConflictError("This plug already has an active session");
    }

    // Resolve tariff: need the location via station
    const station = await findStationById(this.db, plug.station_id, tenantId);
    let tariffId: string | null = null;
    if (station?.location_id) {
      tariffId = await resolveApplicableTariff(this.db, userId, tenantId, station.location_id);
    }

    return createSession(this.db, { userId, plugId, tenantId, tariffId });
  }

  async getSession(
    sessionId: string,
    userId: string,
    tenantId: string,
    isAdmin: boolean,
  ): Promise<Selectable<ChargingSessionsTable>> {
    const session = await findSessionById(this.db, sessionId);
    if (!session || session.tenant_id !== tenantId) {
      throw new NotFoundError("Session not found");
    }
    if (!isAdmin && session.user_id !== userId) {
      throw new ForbiddenError("Access denied");
    }
    return session;
  }

  async getUserSessions(
    userId: string,
    tenantId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedSessions> {
    return findSessionsByUser(this.db, userId, tenantId, pagination);
  }

  async getTenantSessions(
    tenantId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedSessions> {
    return findSessionsByTenant(this.db, tenantId, pagination);
  }

  async endSession(
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<Selectable<ChargingSessionsTable>> {
    // Verify session belongs to this user/tenant
    const session = await findSessionById(this.db, sessionId);
    if (!session || session.tenant_id !== tenantId) {
      throw new NotFoundError("Session not found");
    }
    if (session.user_id !== userId) {
      throw new ForbiddenError("You can only end your own sessions");
    }
    if (session.status !== "active") {
      throw new ConflictError("Session is not active");
    }

    const ended = await endSession(this.db, sessionId);
    if (!ended) {
      throw new ConflictError("Session could not be ended");
    }
    return ended;
  }
}
