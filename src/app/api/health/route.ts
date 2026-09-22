import { prisma } from "@/lib/db/client";
import { getRuntimeSnapshotStore } from "@/lib/public/content";
import { logger } from "@/lib/observability/logger";

export type HealthResponse = {
  status: "ok" | "degraded" | "unavailable";
  database: "up" | "down";
  publicSource: "database" | "snapshot" | "none";
};

const DATABASE_TIMEOUT_MS = 1_500;

export async function GET(): Promise<Response> {
  const database = await probeDatabase();
  if (database === "up") {
    return Response.json({ status: "ok", database, publicSource: "database" } satisfies HealthResponse, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const snapshotAvailable = await probeSnapshot();
  const health: HealthResponse = snapshotAvailable
    ? { status: "degraded", database, publicSource: "snapshot" }
    : { status: "unavailable", database, publicSource: "none" };
  return Response.json(health, { status: snapshotAvailable ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

async function probeDatabase(): Promise<"up" | "down"> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("database probe timed out")), DATABASE_TIMEOUT_MS)),
    ]);
    return "up";
  } catch (error) {
    logger.warn("health_database_unavailable", { errorType: error instanceof Error ? error.name : "unknown" });
    return "down";
  }
}

async function probeSnapshot(): Promise<boolean> {
  try {
    return (await getRuntimeSnapshotStore().read()) !== null;
  } catch (error) {
    logger.warn("health_snapshot_unavailable", { errorType: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
