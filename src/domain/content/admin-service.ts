import { AuthenticationError, type AdminIdentity } from "@/lib/auth/cognito";
import { ContentRepository } from "@/lib/db/repositories/content-repository";
import { prisma } from "@/lib/db/client";
import { PublicationState } from "@/lib/db/types";
import { createSnapshot } from "@/lib/fallback/snapshot-schema";
import type { SnapshotStore } from "@/lib/fallback/snapshot-store";
import { buildPublicContent, validatePublishableContent } from "./publication";
import type { EditableContent } from "./types";
import { logger } from "@/lib/observability/logger";

export type ContentType = "profile" | "experience" | "project" | "skill" | "resumeSettings";
export type SaveDraftInput = {
  type: ContentType;
  id: string;
  data: Record<string, unknown>;
};
export type PublishResult = { published: true; snapshotRefreshed: boolean };
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

function withDatabaseError<T>(operation: () => Promise<T>, operationName: string, requestId?: string): Promise<T> {
  return operation().catch((error) => {
    if (error instanceof AdminOperationError || error instanceof AuthenticationError) throw error;
    logger.error("admin_content_operation_failed", { operation: operationName, requestId, errorType: error instanceof Error ? error.name : "unknown" });
    throw new AdminOperationError("TEMPORARY_DATABASE_ERROR", "The database is temporarily unavailable");
  });
}

function logOperation(actor: AdminIdentity, operation: string, type?: ContentType, id?: string, requestId?: string) {
  logger.info("admin_content_operation", { actorSubject: actor.subject, operation, type, id, requestId });
}

export class AdminContentService {
  constructor(
    private readonly repository: ContentRepositoryPort,
    private readonly snapshotStore?: SnapshotStore,
  ) {}

  async saveDraft(input: SaveDraftInput, actor: AdminIdentity | null, requestId?: string): Promise<EditableContent> {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      const result = await this.repository.saveDraft(validateDraftInput(input));
      logOperation(identity, "save_draft", input.type, input.id, requestId);
      return result;
    }, "save_draft", requestId);
  }

  async previewDraft(actor: AdminIdentity | null, requestId?: string): Promise<PreviewContent> {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      const result = await this.repository.getDraftContent();
      logOperation(identity, "preview_draft", undefined, undefined, requestId);
      return result;
    }, "preview_draft", requestId);
  }

  async publishContent(actor: AdminIdentity | null, requestId?: string): Promise<PublishResult> {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      const published = await this.repository.transaction(async (transactionRepository) => {
        const content = await transactionRepository.getDraftContent();
        const publishableContent = markPublishableRecords(content);
        const validation = validatePublishableContent(publishableContent);
        if (!validation.valid) throw new AdminOperationError("INVALID_CONTENT", validation.errors.join(", "));
        await publishRecords(transactionRepository, content);
        return buildPublicContent(publishableContent);
      });
      const snapshotRefreshed = await this.refreshSnapshot(published);
      logOperation(identity, "publish", undefined, undefined, requestId);
      return { published: true, snapshotRefreshed };
    }, "publish", requestId);
  }

  unpublishRecord(type: ContentType, id: string, actor: AdminIdentity | null, requestId?: string): Promise<void> {
    return this.changeState(type, id, PublicationState.DRAFT, actor, "unpublish", requestId);
  }

  archiveRecord(type: ContentType, id: string, actor: AdminIdentity | null, requestId?: string): Promise<void> {
    return this.changeState(type, id, PublicationState.ARCHIVED, actor, "archive", requestId);
  }

  private async changeState(type: ContentType, id: string, state: string, actor: AdminIdentity | null, operation: string, requestId?: string) {
    const identity = requireActor(actor);
    return withDatabaseError(async () => {
      const content = await this.repository.transaction(async (transactionRepository) => {
        await transactionRepository.setPublicationState(type, id, state);
        return transactionRepository.getDraftContent();
      });
      await this.refreshSnapshot(buildPublicContent(content));
      logOperation(identity, operation, type, id, requestId);
    }, operation, requestId);
  }

  private async refreshSnapshot(content: ReturnType<typeof buildPublicContent>): Promise<boolean> {
    if (!this.snapshotStore) return false;
    await this.snapshotStore.write(createSnapshot(content));
    return true;
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

function markPublishableRecords(content: EditableContent): EditableContent {
  return {
    ...content,
    profile: content.profile && (content.profile.publicationState === PublicationState.ARCHIVED ? content.profile : { ...content.profile, publicationState: PublicationState.PUBLISHED }),
    experience: content.experience.map((record) => record.publicationState === PublicationState.ARCHIVED ? record : { ...record, publicationState: PublicationState.PUBLISHED }),
    projects: content.projects.map((record) => record.publicationState === PublicationState.ARCHIVED ? record : { ...record, publicationState: PublicationState.PUBLISHED }),
    skills: content.skills.map((record) => record.publicationState === PublicationState.ARCHIVED ? record : { ...record, publicationState: PublicationState.PUBLISHED }),
    resumeSettings: content.resumeSettings && (content.resumeSettings.publicationState === PublicationState.ARCHIVED ? content.resumeSettings : { ...content.resumeSettings, publicationState: PublicationState.PUBLISHED }),
  };
}

async function publishRecords(repository: ContentRepositoryPort, content: EditableContent) {
  if (content.profile && content.profile.publicationState !== PublicationState.ARCHIVED) await repository.setPublicationState("profile", content.profile.id, PublicationState.PUBLISHED);
  for (const record of content.experience) if (record.publicationState !== PublicationState.ARCHIVED) await repository.setPublicationState("experience", record.id, PublicationState.PUBLISHED);
  for (const record of content.projects) if (record.publicationState !== PublicationState.ARCHIVED) await repository.setPublicationState("project", record.id, PublicationState.PUBLISHED);
  for (const record of content.skills) if (record.publicationState !== PublicationState.ARCHIVED) await repository.setPublicationState("skill", record.id, PublicationState.PUBLISHED);
  if (content.resumeSettings && content.resumeSettings.publicationState !== PublicationState.ARCHIVED) await repository.setPublicationState("resumeSettings", content.resumeSettings.id, PublicationState.PUBLISHED);
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
