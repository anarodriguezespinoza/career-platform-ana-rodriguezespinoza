import { describe, expect, it, vi } from "vitest";

import {
  createSnapshot,
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
import type { PublicContent } from "../../src/domain/content/types";

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

  it("returns live content and emits its source", async () => {
    const events: unknown[] = [];

    await expect(
      readPublicContent(async () => content, {
        read: async () => null,
        write: async () => undefined,
      }, (event) => events.push(event)),
    ).resolves.toEqual({ content, source: "database" });
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
