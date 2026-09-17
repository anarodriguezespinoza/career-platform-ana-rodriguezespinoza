import type { PublicContent } from "../../domain/content/types";

export const SNAPSHOT_SCHEMA_VERSION = 2;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SnapshotValidationError(`${path} must be an object`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new SnapshotValidationError(`${path} must be a string`);
  return value;
}

function requireNullableString(value: unknown, path: string): string | null {
  if (value !== null && typeof value !== "string") throw new SnapshotValidationError(`${path} must be a string or null`);
  return value;
}

function requireDate(value: unknown, path: string): void {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new SnapshotValidationError(`${path} must be a valid date`);
    return;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new SnapshotValidationError(`${path} must be a valid date`);
  }
}

function requireOrder(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new SnapshotValidationError(`${path} must be a non-negative integer`);
  }
}

function validateProfile(value: unknown): void {
  if (value === null) return;
  const profile = requireRecord(value, "content.profile");
  exactKeys(profile, ["id", "name", "headline", "summary", "email", "location", "avatarUrl"], "content.profile");
  for (const field of ["id", "name", "headline", "summary", "email", "location"]) requireString(profile[field], `content.profile.${field}`);
  requireNullableString(profile.avatarUrl, "content.profile.avatarUrl");
}

function validateExperience(value: unknown): void {
  if (!Array.isArray(value)) throw new SnapshotValidationError("content.experience must be an array");
  value.forEach((item, index) => {
    const path = `content.experience[${index}]`;
    const experience = requireRecord(item, path);
    exactKeys(experience, ["id", "company", "role", "description", "startDate", "endDate", "displayOrder"], path);
    for (const field of ["id", "company", "role", "description"]) requireString(experience[field], `${path}.${field}`);
    requireDate(experience.startDate, `${path}.startDate`);
    if (experience.endDate !== null) requireDate(experience.endDate, `${path}.endDate`);
    requireOrder(experience.displayOrder, `${path}.displayOrder`);
  });
}

function validateProjects(value: unknown): void {
  if (!Array.isArray(value)) throw new SnapshotValidationError("content.projects must be an array");
  value.forEach((item, index) => {
    const path = `content.projects[${index}]`;
    const project = requireRecord(item, path);
    exactKeys(project, ["id", "slug", "name", "description", "url", "repositoryUrl", "isFeatured", "displayOrder", "technologies"], path);
    for (const field of ["id", "slug", "name", "description"]) requireString(project[field], `${path}.${field}`);
    requireNullableString(project.url, `${path}.url`);
    requireNullableString(project.repositoryUrl, `${path}.repositoryUrl`);
    if (typeof project.isFeatured !== "boolean") throw new SnapshotValidationError(`${path}.isFeatured must be a boolean`);
    requireOrder(project.displayOrder, `${path}.displayOrder`);
    if (!Array.isArray(project.technologies)) throw new SnapshotValidationError(`${path}.technologies must be an array`);
    project.technologies.forEach((item, technologyIndex) => {
      const technologyPath = `${path}.technologies[${technologyIndex}]`;
      const technology = requireRecord(item, technologyPath);
      exactKeys(technology, ["projectId", "technology", "displayOrder"], technologyPath);
      requireString(technology.projectId, `${technologyPath}.projectId`);
      requireString(technology.technology, `${technologyPath}.technology`);
      requireOrder(technology.displayOrder, `${technologyPath}.displayOrder`);
    });
  });
}

function validateSkills(value: unknown): void {
  if (!Array.isArray(value)) throw new SnapshotValidationError("content.skills must be an array");
  value.forEach((item, index) => {
    const path = `content.skills[${index}]`;
    const skill = requireRecord(item, path);
    exactKeys(skill, ["id", "name", "category", "displayOrder"], path);
    for (const field of ["id", "name", "category"]) requireString(skill[field], `${path}.${field}`);
    requireOrder(skill.displayOrder, `${path}.displayOrder`);
  });
}

function validateResumeSettings(value: unknown): void {
  if (value === null) return;
  const resume = requireRecord(value, "content.resumeSettings");
  exactKeys(resume, ["id", "title", "intro", "resumeUrl"], "content.resumeSettings");
  for (const field of ["id", "title", "intro"]) requireString(resume[field], `content.resumeSettings.${field}`);
  requireNullableString(resume.resumeUrl, "content.resumeSettings.resumeUrl");
}

function validateContent(content: unknown): asserts content is PublicContent {
  const value = requireRecord(content, "content");
  exactKeys(value, ["profile", "experience", "projects", "skills", "resumeSettings"], "content");
  validateProfile(value.profile);
  validateExperience(value.experience);
  validateProjects(value.projects);
  validateSkills(value.skills);
  validateResumeSettings(value.resumeSettings);
}

export function parseSnapshot(value: unknown): PublishedSnapshot {
  const snapshot = requireRecord(value, "snapshot");
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
