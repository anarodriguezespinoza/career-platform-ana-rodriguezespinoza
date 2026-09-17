import type { EditableContent, PublicContent, PublicProject } from "../../domain/content/types";
import { prisma } from "../db/client";
import { ContentRepository } from "../db/repositories/content-repository";
import { readPublicContent as readWithFallback } from "../fallback/snapshot-service";
import type { SnapshotStore } from "../fallback/snapshot-store";

type Reader = () => Promise<{ content: PublicContent; source: "database" | "snapshot" }>;
const emptySnapshotStore: SnapshotStore = { read: async () => null, write: async () => undefined };

export function createPublicContentReader(options: { loadLive: () => Promise<EditableContent>; readPublicContent?: typeof readWithFallback; snapshotStore?: SnapshotStore }): Reader {
  const readPublicContent = options.readPublicContent ?? readWithFallback;
  return () => readPublicContent(options.loadLive, options.snapshotStore ?? emptySnapshotStore);
}

export function getPublicContent(): ReturnType<Reader> {
  return createPublicContentReader({ loadLive: () => new ContentRepository(prisma).listPublished() })();
}

export async function findPublicProject(slug: string, content: PublicContent): Promise<PublicProject | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return content.projects.find((project) => project.slug === slug) ?? null;
}
