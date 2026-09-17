import { buildPublicContent } from "../../domain/content/publication";
import { SNAPSHOT_SCHEMA_VERSION } from "./snapshot-schema";
import type { EditableContent, PublicContent } from "../../domain/content/types";
import { logSourceStatus, type SourceLogger } from "./source-status";
import type { SnapshotStore } from "./snapshot-store";

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
  logger?: SourceLogger,
): Promise<{ content: PublicContent; source: "database" | "snapshot" }> {
  try {
    const content = buildPublicContent(await loadLive());
    logSourceStatus({ event: "public_content_source", source: "database" }, logger);
    return { content, source: "database" };
  } catch (databaseError) {
    try {
      const snapshot = await snapshotStore.read();
      if (snapshot) {
        logSourceStatus({ event: "public_content_fallback", source: "snapshot" }, logger);
        return { content: snapshot.content, source: "snapshot" };
      }
    } catch (snapshotError) {
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
