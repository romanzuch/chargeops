import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";

describe("problem details", () => {
  const app = buildApp();
  beforeAll(async () => {
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns problem+json for not found", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");

    const body = res.json();
    expect(body.status).toBe(404);
    expect(body.title).toBe("Not Found");
    expect(body.traceId).toBeTruthy();
    expect(body.instance).toBe("/nope");
  });
});
