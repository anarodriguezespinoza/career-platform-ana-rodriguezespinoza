import { describe, expect, it, vi } from "vitest";

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
