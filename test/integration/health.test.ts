import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns 200 and status ok", async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ status: "ok" });

    await app.close();
  });
});
