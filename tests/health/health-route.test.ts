import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, readSnapshot } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  readSnapshot: vi.fn(),
}));

vi.mock("../../src/lib/db/client", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("../../src/lib/public/content", () => ({
  getRuntimeSnapshotStore: () => ({ read: readSnapshot, write: vi.fn() }),
}));

import { GET } from "../../src/app/api/health/route";

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([{ ok: 1 }]);
  readSnapshot.mockResolvedValue({ schemaVersion: 2 });
});

describe("GET /api/health", () => {
  it("reports a healthy database-backed service", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "up", publicSource: "database" });
  });

  it("reports degraded service when the database is down but a snapshot exists", async () => {
    queryRaw.mockRejectedValue(new Error("database credentials should not be returned"));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "degraded", database: "down", publicSource: "snapshot" });
  });

  it("reports unavailable service when both database and snapshot are unavailable", async () => {
    queryRaw.mockRejectedValue(new Error("database down"));
    readSnapshot.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable", database: "down", publicSource: "none" });
  });
});
