import { buildPublicContent } from "../../domain/content/publication";
import { SNAPSHOT_SCHEMA_VERSION } from "./snapshot-schema";
import type { EditableContent, PublicContent } from "../../domain/content/types";
import { logSourceStatus, type SourceLogger } from "./source-status";
import type { SnapshotStore } from "./snapshot-store";
import { logger } from "@/lib/observability/logger";

export class PublicContentUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Public content is unavailable: database and published snapshot could not be read");
    this.name = "PublicContentUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

export async function readPublicContent(
  loadLive: () => Promise<EditableContent>,
  snapshotStore: SnapshotStore,
  sourceLogger?: SourceLogger,
): Promise<{ content: PublicContent; source: "database" | "snapshot" }> {
  try {
    const content = buildPublicContent(await loadLive());
    logSourceStatus({ event: "public_content_source", source: "database" }, sourceLogger);
    return { content, source: "database" };
  } catch (databaseError) {
    logger.warn("public_content_database_unavailable", { errorType: databaseError instanceof Error ? databaseError.name : "unknown" });
    try {
      const snapshot = await snapshotStore.read();
      if (snapshot) {
        logSourceStatus({ event: "public_content_fallback", source: "snapshot" }, sourceLogger);
        return { content: snapshot.content, source: "snapshot" };
      }
    } catch (snapshotError) {
      logger.warn("public_content_snapshot_unavailable", { errorType: snapshotError instanceof Error ? snapshotError.name : "unknown" });
      throw new PublicContentUnavailableError(snapshotError);
    }
    throw new PublicContentUnavailableError(databaseError);
  }
}

export async function refreshPublishedSnapshot(
  loadLive: () => Promise<EditableContent>,
  snapshotStore: SnapshotStore,
): Promise<void> {
  const content = buildPublicContent(await loadLive());
  await snapshotStore.write({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    content,
  });
}
