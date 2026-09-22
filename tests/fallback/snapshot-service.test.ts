import { describe, expect, it, vi } from "vitest";
import { logger } from "../../src/lib/observability/logger";

import {
  createSnapshot,
  parseSnapshot,
  SnapshotValidationError,
} from "../../src/lib/fallback/snapshot-schema";
import {
  createS3SnapshotStore,
  type SnapshotObjectClient,
} from "../../src/lib/fallback/snapshot-store";
import {
  PublicContentUnavailableError,
  readPublicContent,
} from "../../src/lib/fallback/snapshot-service";
import type { EditableContent, PublicContent } from "../../src/domain/content/types";

const editableContent: EditableContent = {
  profile: {
    id: "profile-1",
    name: "Ana",
    headline: "Engineer",
    summary: "Summary",
    email: "ana@example.com",
    location: "Remote",
    avatarUrl: null,
    publicationState: "PUBLISHED",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  },
  experience: [],
  projects: [],
  skills: [],
  resumeSettings: null,
};

const content: PublicContent = {
  profile: {
    id: "profile-1",
    name: "Ana",
    headline: "Engineer",
    summary: "Summary",
    email: "ana@example.com",
    location: "Remote",
    avatarUrl: null,
  },
  experience: [],
  projects: [],
  skills: [],
  resumeSettings: null,
};

function createMemoryClient(): SnapshotObjectClient & { body: string | null } {
  return {
    body: null,
    async send(command) {
      if (command.operation === "put") {
        this.body = command.body;
        return {};
      }
      if (!this.body) {
        const error = new Error("Not found");
        (error as Error & { name: string }).name = "NoSuchKey";
        throw error;
      }
      return { body: this.body };
    },
  };
}

describe("snapshot service", () => {
  it("rejects snapshots containing private or draft fields", () => {
    expect(() =>
      createSnapshot({
        ...content,
        profile: { ...content.profile!, privateNotes: "secret" },
      } as never),
    ).toThrow(SnapshotValidationError);
  });

  it("rejects invalid snapshot primitive, nullable, date, and order types", () => {
    const snapshot = createSnapshot(content);

    expect(() => parseSnapshot({
      ...snapshot,
      content: {
        ...snapshot.content,
        profile: { ...snapshot.content.profile!, name: 42 },
      },
    })).toThrow(SnapshotValidationError);
    expect(() => parseSnapshot({
      ...snapshot,
      content: {
        ...snapshot.content,
        profile: { ...snapshot.content.profile!, avatarUrl: 42 },
      },
    })).toThrow(SnapshotValidationError);
    expect(() => parseSnapshot({
      ...snapshot,
      content: {
        ...snapshot.content,
        experience: [{
          id: "experience-1",
          company: "Company",
          role: "Role",
          description: "Description",
          startDate: "not-a-date",
          endDate: null,
          displayOrder: 0,
        }],
      },
    })).toThrow(SnapshotValidationError);
    expect(() => parseSnapshot({
      ...snapshot,
      content: {
        ...snapshot.content,
        skills: [{ id: "skill-1", name: "TypeScript", category: "Languages", displayOrder: -1 }],
      },
    })).toThrow(SnapshotValidationError);
  });

  it("normalizes schema v1 snapshots without isFeatured for backward compatibility", () => {
    const legacy = {
      schemaVersion: 1,
      generatedAt: "2026-09-01T00:00:00.000Z",
      content: {
        ...content,
        projects: [{
          id: "project-1", slug: "legacy-project", name: "Legacy", description: "Old snapshot",
          url: null, repositoryUrl: null, displayOrder: 0, technologies: [],
        }],
      },
    };

    expect(parseSnapshot(legacy)).toMatchObject({
      schemaVersion: 2,
      content: { projects: [{ isFeatured: false }] },
    });
  });

  it("stores and reads a versioned validated JSON snapshot", async () => {
    const client = createMemoryClient();
    const store = createS3SnapshotStore({
      client,
      bucket: "snapshots",
      key: "public/content.json",
    });
    const snapshot = createSnapshot(content);

    await store.write(snapshot);
    expect(await store.read()).toEqual(snapshot);
  });

  it("projects raw live records before returning database content", async () => {
    const raw = {
      ...editableContent,
      profile: { ...editableContent.profile!, privateNotes: "secret" },
    };

    await expect(
      readPublicContent(async () => raw, {
        read: async () => null,
        write: async () => undefined,
      }),
    ).resolves.toMatchObject({
      source: "database",
      content: { profile: { id: "profile-1" } },
    });
    const result = await readPublicContent(async () => raw, {
      read: async () => null,
      write: async () => undefined,
    });
    expect(result.content.profile).not.toHaveProperty("privateNotes");
    expect(result.content.profile).not.toHaveProperty("publicationState");
  });

  it("returns live content and emits its source", async () => {
    const events: unknown[] = [];

    await expect(
      readPublicContent(async () => editableContent, {
        read: async () => null,
        write: async () => undefined,
      }, (event) => events.push(event)),
    ).resolves.toEqual({ content: { ...content }, source: "database" });
    expect(events).toEqual([{ event: "public_content_source", source: "database" }]);
  });

  it("falls back to a validated snapshot after a database failure", async () => {
    const events: unknown[] = [];
    const snapshot = createSnapshot(content);

    await expect(
      readPublicContent(
        async () => {
          throw new Error("database unavailable");
        },
        { read: async () => snapshot, write: async () => undefined },
        (event) => events.push(event),
      ),
    ).resolves.toEqual({ content, source: "snapshot" });
    expect(events).toEqual([{ event: "public_content_fallback", source: "snapshot" }]);
  });

  it("throws an explicit unavailable error when the database and snapshot fail", async () => {
    await expect(
      readPublicContent(
        async () => {
          throw new Error("database unavailable");
        },
        { read: async () => null, write: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(PublicContentUnavailableError);
  });
});


it("logs database fallback failures without logging database details", async () => {
  const log = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  await expect(readPublicContent(async () => { throw new Error("DATABASE_URL=secret"); }, { read: async () => null, write: async () => undefined })).rejects.toBeInstanceOf(PublicContentUnavailableError);
  expect(log).toHaveBeenCalledWith("public_content_database_unavailable", expect.anything());
  expect(JSON.stringify(log.mock.calls)).not.toContain("DATABASE_URL=secret");
  log.mockRestore();
});
