import type { PublicContent } from "../../domain/content/types";

export const SNAPSHOT_SCHEMA_VERSION = 1;

export type PublishedSnapshot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  generatedAt: string;
  content: PublicContent;
};

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotValidationError";
  }
}

const exactKeys = (value: object, keys: string[], path: string) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join("\0") !== expected.join("\0")) {
    throw new SnapshotValidationError(`${path} contains unsupported or missing fields`);
  }
};

function validateContent(content: unknown): asserts content is PublicContent {
  if (!content || typeof content !== "object") throw new SnapshotValidationError("content must be an object");
  const value = content as Record<string, unknown>;
  exactKeys(value, ["profile", "experience", "projects", "skills", "resumeSettings"], "content");
  if (!Array.isArray(value.experience) || !Array.isArray(value.projects) || !Array.isArray(value.skills)) {
    throw new SnapshotValidationError("content collections must be arrays");
  }
  if (value.profile !== null) {
    if (!value.profile || typeof value.profile !== "object") throw new SnapshotValidationError("content.profile is invalid");
    exactKeys(value.profile, ["id", "name", "headline", "summary", "email", "location", "avatarUrl"], "content.profile");
  }
  if (value.resumeSettings !== null) {
    if (!value.resumeSettings || typeof value.resumeSettings !== "object") throw new SnapshotValidationError("content.resumeSettings is invalid");
    exactKeys(value.resumeSettings, ["id", "title", "intro", "resumeUrl"], "content.resumeSettings");
  }
  value.experience.forEach((item, index) => validateRecord(item, ["id", "company", "role", "description", "startDate", "endDate", "displayOrder"], `content.experience[${index}]`));
  value.projects.forEach((item, index) => {
    validateRecord(item, ["id", "slug", "name", "description", "url", "repositoryUrl", "displayOrder", "technologies"], `content.projects[${index}]`);
    const technologies = (item as Record<string, unknown>).technologies;
    if (!Array.isArray(technologies)) throw new SnapshotValidationError(`content.projects[${index}].technologies is invalid`);
    technologies.forEach((technology, technologyIndex) => validateRecord(technology, ["projectId", "technology", "displayOrder"], `content.projects[${index}].technologies[${technologyIndex}]`));
  });
  value.skills.forEach((item, index) => validateRecord(item, ["id", "name", "category", "displayOrder"], `content.skills[${index}]`));
}

function validateRecord(value: unknown, keys: string[], path: string): void {
  if (!value || typeof value !== "object") throw new SnapshotValidationError(`${path} is invalid`);
  exactKeys(value, keys, path);
}

export function parseSnapshot(value: unknown): PublishedSnapshot {
  if (!value || typeof value !== "object") throw new SnapshotValidationError("snapshot must be an object");
  const snapshot = value as Record<string, unknown>;
  exactKeys(snapshot, ["schemaVersion", "generatedAt", "content"], "snapshot");
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new SnapshotValidationError("unsupported snapshot schema version");
  if (typeof snapshot.generatedAt !== "string" || Number.isNaN(Date.parse(snapshot.generatedAt))) throw new SnapshotValidationError("generatedAt must be an ISO date");
  validateContent(snapshot.content);
  return snapshot as PublishedSnapshot;
}

export function createSnapshot(content: PublicContent): PublishedSnapshot {
  validateContent(content);
  return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), content };
}
