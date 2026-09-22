import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, transaction, readSnapshot } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  readSnapshot: vi.fn(),
}));

vi.mock("../../src/lib/db/client", () => ({ prisma: { $queryRaw: queryRaw, $transaction: transaction } }));
vi.mock("../../src/lib/public/content", () => ({
  getRuntimeSnapshotStore: () => ({ read: readSnapshot, write: vi.fn() }),
}));

import { GET } from "../../src/app/api/health/route";

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([{ ok: 1 }]);
  transaction.mockImplementation(async (callback: (client: { $queryRaw: typeof queryRaw }) => Promise<unknown>, options: unknown) => callback({ $queryRaw: queryRaw }));
  readSnapshot.mockResolvedValue({ schemaVersion: 2 });
});

describe("GET /api/health", () => {
  it("reports a healthy database-backed service", async () => {
    const response = await GET(new Request("https://example.com/api/health", { headers: { "x-request-id": "health-123" } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "up", publicSource: "database" });
    expect(response.headers.get("x-request-id")).toBe("health-123");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeout: expect.any(Number) }));
  });

  it("logs and returns a generated correlation ID", async () => {
    const response = await GET(new Request("https://example.com/api/health"));

    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));
  });

  it("reports degraded service when the database is down but a snapshot exists", async () => {
    queryRaw.mockRejectedValue(new Error("database credentials should not be returned"));

    const response = await GET(new Request("https://example.com/api/health", { headers: { "x-request-id": "health-degraded" } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "degraded", database: "down", publicSource: "snapshot" });
  });

  it("reports unavailable service when both database and snapshot are unavailable", async () => {
    queryRaw.mockRejectedValue(new Error("database down"));
    readSnapshot.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com/api/health", { headers: { "x-request-id": "health-degraded" } }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable", database: "down", publicSource: "none" });
  });
});
