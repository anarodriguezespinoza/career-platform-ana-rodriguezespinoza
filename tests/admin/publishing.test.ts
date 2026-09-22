import { describe, expect, it, vi } from "vitest";
import { logger } from "../../src/lib/observability/logger";

import {
  AdminContentService,
  type ContentRepositoryPort,
} from "../../src/domain/content/admin-service";
import type { EditableContent } from "../../src/domain/content/types";
import type { AdminIdentity } from "../../src/lib/auth/require-admin";
import type { SnapshotStore } from "../../src/lib/fallback/snapshot-store";

const actor: AdminIdentity = { subject: "admin-subject", email: "admin@example.com" };
const validContent: EditableContent = {
  profile: { id: "profile-1", name: "Ana", headline: "Engineer", summary: "Summary", email: "ana@example.com", location: "Remote", avatarUrl: null, publicationState: "DRAFT", createdAt: new Date(), updatedAt: new Date() },
  experience: [],
  projects: [],
  skills: [],
  resumeSettings: null,
};

function setup(content: EditableContent = validContent) {
  const order: string[] = [];
  const repository: ContentRepositoryPort = {
    getDraftContent: vi.fn(async () => content),
    saveDraft: vi.fn(async () => content),
    setPublicationState: vi.fn(async () => { order.push("transaction"); }),
    transaction: vi.fn(async (callback) => callback(repository)),
  };
  const snapshot: SnapshotStore = {
    read: vi.fn(async () => null),
    write: vi.fn(async () => { order.push("snapshot"); }),
  };
  return { service: new AdminContentService(repository, snapshot), repository, snapshot, order };
}

describe("admin publishing", () => {
  it("rejects publishing when required profile fields are invalid", async () => {
    const { service, repository, snapshot } = setup({ ...validContent, profile: { ...validContent.profile!, name: "" } });

    await expect(service.publishContent(actor)).rejects.toMatchObject({ code: "INVALID_CONTENT" });
    expect(repository.setPublicationState).not.toHaveBeenCalled();
    expect(snapshot.write).not.toHaveBeenCalled();
  });

  it("publishes in a transaction and refreshes the snapshot only after commit", async () => {
    const { service, repository, snapshot, order } = setup();

    await expect(service.publishContent(actor)).resolves.toMatchObject({ published: true });
    expect(repository.setPublicationState).toHaveBeenCalled();
    expect(order).toEqual(["transaction", "snapshot"]);
  });

  it("does not report success or refresh the snapshot when the transaction fails", async () => {
    const { service, repository, snapshot } = setup();
    vi.mocked(repository.setPublicationState).mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.publishContent(actor)).rejects.toMatchObject({ code: "TEMPORARY_DATABASE_ERROR" });
    expect(snapshot.write).not.toHaveBeenCalled();
  });

  it("unpublishes and archives authenticated records", async () => {
    const { service, repository } = setup();

    await service.unpublishRecord("project", "project-1", actor);
    await service.archiveRecord("skill", "skill-1", actor);

    expect(repository.setPublicationState).toHaveBeenNthCalledWith(1, "project", "project-1", "DRAFT");
    expect(repository.setPublicationState).toHaveBeenNthCalledWith(2, "skill", "skill-1", "ARCHIVED");
  });
});

  it("preserves archived records during publish", async () => {
    const archived = { id: "archived-project", slug: "archived", name: "Archived", description: "Hidden", url: null, repositoryUrl: null, isFeatured: true, displayOrder: 0, publicationState: "ARCHIVED", technologies: [], createdAt: new Date(), updatedAt: new Date() };
    const { service, repository } = setup({ ...validContent, projects: [archived] });

    await service.publishContent(actor);

    expect(repository.setPublicationState).not.toHaveBeenCalledWith("project", "archived-project", "PUBLISHED");
  });

  it("reads and validates content inside the publish transaction", async () => {
    const order: string[] = [];
    const repository = setup().repository;
    vi.mocked(repository.transaction).mockImplementationOnce(async (callback) => {
      order.push("transaction");
      const result = await callback(repository);
      order.push("transaction-complete");
      return result;
    });
    vi.mocked(repository.getDraftContent).mockImplementation(async () => {
      order.push("read");
      return validContent;
    });
    const service = new AdminContentService(repository, setup().snapshot);

    await service.publishContent(actor);

    expect(order).toEqual(["transaction", "read", "transaction-complete"]);
  });

  it.each([
    ["experience", { id: "experience-1", company: "", role: "Role", description: "Description", startDate: new Date(), endDate: null, displayOrder: 0, publicationState: "DRAFT", createdAt: new Date(), updatedAt: new Date() }],
    ["skill", { id: "skill-1", name: "", category: "Languages", displayOrder: 0, publicationState: "DRAFT", createdAt: new Date(), updatedAt: new Date() }],
    ["resumeSettings", { id: "resume-1", title: "", intro: "Intro", resumeUrl: null, publicationState: "DRAFT", updatedAt: new Date() }],
  ] as const)("validates required fields for %s before state updates", async (type, record) => {
    const content = { ...validContent, [type === "experience" ? "experience" : type === "skill" ? "skills" : "resumeSettings"]: type === "resumeSettings" ? record : [record] } as EditableContent;
    const { service, repository } = setup(content);

    await expect(service.publishContent(actor)).rejects.toMatchObject({ code: "INVALID_CONTENT" });
    expect(repository.setPublicationState).not.toHaveBeenCalled();
  });

  it("refreshes the snapshot after unpublish and archive", async () => {
    const { service, repository, snapshot } = setup();

    await service.unpublishRecord("project", "project-1", actor);
    await service.archiveRecord("skill", "skill-1", actor);

    expect(snapshot.write).toHaveBeenCalledTimes(2);
  });

  it("reports snapshot refresh only when a store is configured and written", async () => {
    const { repository } = setup();
    const service = new AdminContentService(repository);

    await expect(service.publishContent(actor)).resolves.toEqual({ published: true, snapshotRefreshed: false });
  });

  it("does not project an archived profile as published", async () => {
    const archivedProfile = { ...validContent.profile!, publicationState: "ARCHIVED" };
    const { service, snapshot } = setup({ ...validContent, profile: archivedProfile });

    await service.publishContent(actor);

    expect(snapshot.write).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ profile: null }) }));
  });


it("logs publish failures without exposing error details", async () => {
  const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
  const { service, repository } = setup();
  vi.mocked(repository.setPublicationState).mockRejectedValueOnce(new Error("database password=secret"));

  await expect(service.publishContent(actor)).rejects.toMatchObject({ code: "TEMPORARY_DATABASE_ERROR" });
  expect(log).toHaveBeenCalledWith("admin_content_operation_failed", expect.objectContaining({ operation: "publish" }));
  expect(JSON.stringify(log.mock.calls)).not.toContain("database password=secret");
  log.mockRestore();
});
