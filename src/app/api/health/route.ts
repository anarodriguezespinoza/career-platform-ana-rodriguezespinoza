import { prisma } from "@/lib/db/client";
import { getRuntimeSnapshotStore } from "@/lib/public/content";
import { logger } from "@/lib/observability/logger";
import { getRequestContext } from "@/lib/observability/request-context";

export type HealthResponse = {
  status: "ok" | "degraded" | "unavailable";
  database: "up" | "down";
  publicSource: "database" | "snapshot" | "none";
};

const DATABASE_TIMEOUT_MS = 1_500;
const DATABASE_MAX_WAIT_MS = Math.floor(DATABASE_TIMEOUT_MS / 2);

export function GET(request: Request): Promise<Response>;
export function GET(): Promise<Response>;
export async function GET(request?: Request): Promise<Response> {
  const { requestId } = getRequestContext(request ?? new Request("https://internal.local/api/health"));
  const database = await probeDatabase(requestId);
  if (database === "up") {
    return Response.json({ status: "ok", database, publicSource: "database" } satisfies HealthResponse, {
      status: 200,
      headers: { "Cache-Control": "no-store", "x-request-id": requestId },
    });
  }

  const snapshotAvailable = await probeSnapshot(requestId);
  const health: HealthResponse = snapshotAvailable
    ? { status: "degraded", database, publicSource: "snapshot" }
    : { status: "unavailable", database, publicSource: "none" };
  return Response.json(health, { status: snapshotAvailable ? 200 : 503, headers: { "Cache-Control": "no-store", "x-request-id": requestId } });
}

async function probeDatabase(requestId: string): Promise<"up" | "down"> {
  try {
    const deadline = Date.now() + DATABASE_TIMEOUT_MS;
    const timeout = Math.max(1, deadline - Date.now() - DATABASE_MAX_WAIT_MS);
    await prisma.$transaction((transactionClient) => transactionClient.$queryRaw`SELECT 1`, {
      maxWait: DATABASE_MAX_WAIT_MS,
      timeout,
    });
    return "up";
  } catch (error) {
    logger.warn("health_database_unavailable", { requestId, errorType: error instanceof Error ? error.name : "unknown" });
    return "down";
  }
}

async function probeSnapshot(requestId: string): Promise<boolean> {
  try {
    return (await getRuntimeSnapshotStore().read()) !== null;
  } catch (error) {
    logger.warn("health_snapshot_unavailable", { requestId, errorType: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
