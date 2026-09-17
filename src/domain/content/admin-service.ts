import { AuthenticationError, type AdminIdentity } from "@/lib/auth/cognito";
import { ContentRepository } from "@/lib/db/repositories/content-repository";
import { prisma } from "@/lib/db/client";
import { PublicationState } from "@/lib/db/types";
import { createSnapshot } from "@/lib/fallback/snapshot-schema";
import type { SnapshotStore } from "@/lib/fallback/snapshot-store";
import { buildPublicContent, validatePublishableContent } from "./publication";
import type { EditableContent } from "./types";

export type ContentType = "profile" | "experience" | "project" | "skill" | "resumeSettings";
export type SaveDraftInput = {
  type: ContentType;
  id: string;
  data: Record<string, unknown>;
};
export type PublishResult = { published: true; snapshotRefreshed: true };
export type PreviewContent = EditableContent;

export type ContentRepositoryPort = {
  getDraftContent(): Promise<EditableContent>;
  saveDraft(input: SaveDraftInput): Promise<EditableContent>;
  setPublicationState(type: ContentType, id: string, state: string): Promise<void>;
  transaction<T>(callback: (repository: ContentRepositoryPort) => Promise<T>): Promise<T>;
};

export class AdminOperationError extends Error {
  constructor(readonly code: "TEMPORARY_DATABASE_ERROR" | "INVALID_CONTENT", message: string) {
    super(message);
    this.name = "AdminOperationError";
  }
}

function requireActor(actor: AdminIdentity | null): AdminIdentity {
  if (!actor) throw new AuthenticationError();
  return actor;
}

function withDatabaseError<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error) => {
    if (error instanceof AdminOperationError || error instanceof AuthenticationError) throw error;
    throw new AdminOperationError("TEMPORARY_DATABASE_ERROR", "The database is temporarily unavailable");
  });
}

function logOperation(actor: AdminIdentity, operation: string, type?: ContentType, id?: string) {
  console.info("admin_content_operation", { actorSubject: actor.subject, operation, type, id });
}

export class AdminContentService {
  constructor(
    private readonly repository: ContentRepositoryPort,
    private readonly snapshotStore?: SnapshotStore,
  ) {}

  async saveDraft(input: SaveDraftInput, actor: AdminIdentity | null): Promise<EditableContent> {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      const result = await this.repository.saveDraft(validateDraftInput(input));
      logOperation(identity, "save_draft", input.type, input.id);
      return result;
    });
  }

  async previewDraft(actor: AdminIdentity | null): Promise<PreviewContent> {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      const result = await this.repository.getDraftContent();
      logOperation(identity, "preview_draft");
      return result;
    });
  }

  async publishContent(actor: AdminIdentity | null): Promise<PublishResult> {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      const content = await this.repository.getDraftContent();
      const publishableContent = markAllPublishable(content);
      const validation = validatePublishableContent(publishableContent);
      if (!validation.valid) throw new AdminOperationError("INVALID_CONTENT", validation.errors.join(", "));
      const published = buildPublicContent(publishableContent);
      await this.repository.transaction(async (transactionRepository) => {
        await publishRecords(transactionRepository, content);
      });
      if (this.snapshotStore) await this.snapshotStore.write(createSnapshot(published));
      logOperation(identity, "publish");
      return { published: true, snapshotRefreshed: true };
    });
  }

  unpublishRecord(type: ContentType, id: string, actor: AdminIdentity | null): Promise<void> {
    return this.changeState(type, id, PublicationState.DRAFT, actor, "unpublish");
  }

  archiveRecord(type: ContentType, id: string, actor: AdminIdentity | null): Promise<void> {
    return this.changeState(type, id, PublicationState.ARCHIVED, actor, "archive");
  }

  private async changeState(type: ContentType, id: string, state: string, actor: AdminIdentity | null, operation: string) {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      await this.repository.setPublicationState(type, id, state);
      logOperation(identity, operation, type, id);
    });
  }
}

function validateDraftInput(input: SaveDraftInput): SaveDraftInput {
  if (!input.id.trim() || !input.type || !input.data || typeof input.data !== "object") {
    throw new AdminOperationError("INVALID_CONTENT", "A record type, id, and data are required");
  }
  const requiredByType: Partial<Record<ContentType, string[]>> = {
    profile: ["name", "headline", "summary", "email", "location"],
    experience: ["company", "role", "description", "startDate"],
    project: ["slug", "name", "description"],
    skill: ["name", "category"],
    resumeSettings: ["title", "intro"],
  };
  for (const field of requiredByType[input.type] ?? []) {
    if (typeof input.data[field] !== "string" || !String(input.data[field]).trim()) {
      throw new AdminOperationError("INVALID_CONTENT", `${input.type}.${field} is required`);
    }
  }
  return input;
}

function markAllPublishable(content: EditableContent): EditableContent {
  return {
    ...content,
    profile: content.profile && { ...content.profile, publicationState: PublicationState.PUBLISHED },
    experience: content.experience.map((record) => ({ ...record, publicationState: PublicationState.PUBLISHED })),
    projects: content.projects.map((record) => ({ ...record, publicationState: PublicationState.PUBLISHED })),
    skills: content.skills.map((record) => ({ ...record, publicationState: PublicationState.PUBLISHED })),
    resumeSettings: content.resumeSettings && { ...content.resumeSettings, publicationState: PublicationState.PUBLISHED },
  };
}

async function publishRecords(repository: ContentRepositoryPort, content: EditableContent) {
  if (content.profile) await repository.setPublicationState("profile", content.profile.id, PublicationState.PUBLISHED);
  for (const record of content.experience) await repository.setPublicationState("experience", record.id, PublicationState.PUBLISHED);
  for (const record of content.projects) await repository.setPublicationState("project", record.id, PublicationState.PUBLISHED);
  for (const record of content.skills) await repository.setPublicationState("skill", record.id, PublicationState.PUBLISHED);
  if (content.resumeSettings) await repository.setPublicationState("resumeSettings", content.resumeSettings.id, PublicationState.PUBLISHED);
}

export function createAdminContentService(snapshotStore?: SnapshotStore) {
  return new AdminContentService(new ContentRepositoryAdapter(), snapshotStore);
}

class ContentRepositoryAdapter implements ContentRepositoryPort {
  private readonly repository = new ContentRepository(prisma);
  getDraftContent() { return this.repository.getDraftContent(); }
  saveDraft(input: SaveDraftInput) { return this.repository.saveDraft(input); }
  setPublicationState(type: ContentType, id: string, state: string) { return this.repository.setPublicationState(type, id, state); }
  transaction<T>(callback: (repository: ContentRepositoryPort) => Promise<T>): Promise<T> { return this.repository.transaction((tx) => callback(new ContentRepositoryAdapterWith(tx))); }
}
class ContentRepositoryAdapterWith implements ContentRepositoryPort {
  constructor(private readonly repository: ContentRepository) {}
  getDraftContent() { return this.repository.getDraftContent(); }
  saveDraft(input: SaveDraftInput) { return this.repository.saveDraft(input); }
  setPublicationState(type: ContentType, id: string, state: string) { return this.repository.setPublicationState(type, id, state); }
  transaction<T>(callback: (repository: ContentRepositoryPort) => Promise<T>): Promise<T> { return this.repository.transaction((tx) => callback(new ContentRepositoryAdapterWith(tx))); }
}
