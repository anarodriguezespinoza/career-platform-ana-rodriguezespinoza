import { describe, expect, it, vi } from "vitest";

import {
  AdminContentService,
  type ContentRepositoryPort,
  type SaveDraftInput,
} from "../../src/domain/content/admin-service";
import type { EditableContent } from "../../src/domain/content/types";
import type { AdminIdentity } from "../../src/lib/auth/require-admin";

const actor: AdminIdentity = { subject: "admin-subject", email: "admin@example.com" };
const emptyContent: EditableContent = {
  profile: null,
  experience: [],
  projects: [],
  skills: [],
  resumeSettings: null,
};

function repository(content: EditableContent = emptyContent): ContentRepositoryPort {
  return {
    getDraftContent: vi.fn(async () => content),
    saveDraft: vi.fn(async () => content),
    setPublicationState: vi.fn(async () => undefined),
    transaction: vi.fn(async (callback) => callback(repository)),
  };
}

const profileInput: SaveDraftInput = {
  type: "profile",
  id: "profile-1",
  data: {
    name: "Ana Rodriguez",
    headline: "Software Engineer",
    summary: "Builds useful products.",
    email: "ana@example.com",
    location: "Remote",
    avatarUrl: null,
  },
};

describe("AdminContentService", () => {
  it("rejects unauthenticated draft writes", async () => {
    const service = new AdminContentService(repository());

    await expect(service.saveDraft(profileInput, null)).rejects.toThrow("Unauthorized");
  });

  it("saves a draft without changing public publication state", async () => {
    const repo = repository();
    const service = new AdminContentService(repo);

    await service.saveDraft(profileInput, actor);

    expect(repo.saveDraft).toHaveBeenCalledWith(profileInput);
    expect(repo.setPublicationState).not.toHaveBeenCalled();
  });

  it("returns an explicit temporary error when the database is unavailable", async () => {
    const repo = repository();
    vi.mocked(repo.saveDraft).mockRejectedValueOnce(new Error("database unavailable"));
    const service = new AdminContentService(repo);

    await expect(service.saveDraft(profileInput, actor)).rejects.toMatchObject({
      code: "TEMPORARY_DATABASE_ERROR",
    });
  });

  it("returns draft content for an authenticated preview", async () => {
    const repo = repository({ ...emptyContent, projects: [{ id: "p", slug: "draft", name: "Draft", description: "Private", url: null, repositoryUrl: null, isFeatured: false, displayOrder: 0, publicationState: "DRAFT", technologies: [], createdAt: new Date(), updatedAt: new Date() }] });
    const service = new AdminContentService(repo);

    await expect(service.previewDraft(actor)).resolves.toMatchObject({ projects: [{ slug: "draft" }] });
  });
});

  it("validates and persists project featured state", async () => {
    const repo = repository();
    const input: SaveDraftInput = {
      type: "project",
      id: "project-1",
      data: { slug: "project", name: "Project", description: "Description", isFeatured: true },
    };
    const service = new AdminContentService(repo);

    await service.saveDraft(input, actor);

    expect(repo.saveDraft).toHaveBeenCalledWith(input);
  });
