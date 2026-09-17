import type { EditableContent, PublicContent, PublicProject } from "../../domain/content/types";
import { prisma } from "../db/client";
import { ContentRepository } from "../db/repositories/content-repository";
import { readPublicContent as readWithFallback } from "../fallback/snapshot-service";
import { createS3SnapshotStore, type SnapshotObjectClient, type SnapshotStore } from "../fallback/snapshot-store";

type Reader = () => Promise<{ content: PublicContent; source: "database" | "snapshot" }>;
export class PublicSnapshotConfigurationError extends Error {
  constructor() {
    super("published snapshot store is not configured");
    this.name = "PublicSnapshotConfigurationError";
  }
}

type RuntimeSnapshotOptions = { env?: Partial<NodeJS.ProcessEnv>; client?: SnapshotObjectClient };

export function getRuntimeSnapshotStore(options: RuntimeSnapshotOptions = {}): SnapshotStore {
  const env = options.env ?? process.env;
  const client = options.client ?? (globalThis as typeof globalThis & { __publicSnapshotClient?: SnapshotObjectClient }).__publicSnapshotClient;
  const bucket = env.S3_SNAPSHOT_BUCKET;
  if (!bucket || !client) throw new PublicSnapshotConfigurationError();
  return createS3SnapshotStore({ client, bucket, key: env.S3_SNAPSHOT_KEY ?? "public/content.json" });
}

export function createPublicContentReader(options: { loadLive: () => Promise<EditableContent>; readPublicContent?: typeof readWithFallback; snapshotStore?: SnapshotStore }): Reader {
  const readPublicContent = options.readPublicContent ?? readWithFallback;
  const snapshotStore = options.snapshotStore;
  if (!snapshotStore) throw new PublicSnapshotConfigurationError();
  return () => readPublicContent(options.loadLive, snapshotStore);
}

export function getPublicContent(): ReturnType<Reader> {
  return createPublicContentReader({ loadLive: () => new ContentRepository(prisma).listPublished(), snapshotStore: getRuntimeSnapshotStore() })();
}

export async function findPublicProject(slug: string, content: PublicContent): Promise<PublicProject | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return content.projects.find((project) => project.slug === slug) ?? null;
}
