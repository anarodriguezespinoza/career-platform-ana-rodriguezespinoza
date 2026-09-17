import { describe, expect, it } from "vitest";

import {
  buildPublicContent,
  validatePublishableContent,
} from "../../src/domain/content/publication";
import type { EditableContent } from "../../src/domain/content/types";

const editableContent: EditableContent = {
  profile: {
    id: "profile-1",
    name: "Ana",
    headline: "Engineer",
    summary: "Public summary",
    email: "ana@example.com",
    location: "Remote",
    avatarUrl: null,
    publicationState: "PUBLISHED",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  },
  experience: [
    {
      id: "experience-b",
      company: "B",
      role: "Role B",
      description: "B",
      startDate: new Date("2022-01-01"),
      endDate: null,
      displayOrder: 1,
      publicationState: "PUBLISHED",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    },
    {
      id: "experience-a",
      company: "A",
      role: "Role A",
      description: "A",
      startDate: new Date("2021-01-01"),
      endDate: null,
      displayOrder: 1,
      publicationState: "PUBLISHED",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    },
    {
      id: "experience-draft",
      company: "Draft",
      role: "Draft",
      description: "Draft",
      startDate: new Date("2023-01-01"),
      endDate: null,
      displayOrder: 0,
      publicationState: "DRAFT",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    },
  ],
  projects: [
    {
      id: "project-published",
      slug: "published-project",
      name: "Published project",
      description: "Public",
      url: null,
      repositoryUrl: null,
      displayOrder: 1,
      publicationState: "PUBLISHED",
      technologies: [
        { projectId: "project-published", technology: "TypeScript", displayOrder: 1 },
        { projectId: "project-published", technology: "Next.js", displayOrder: 0 },
      ],
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    },
    {
      id: "project-draft",
      slug: "draft-project",
      name: "Draft project",
      description: "Private",
      url: null,
      repositoryUrl: null,
      displayOrder: 0,
      publicationState: "DRAFT",
      technologies: [],
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    },
  ],
  skills: [
    {
      id: "skill-1",
      name: "TypeScript",
      category: "Languages",
      displayOrder: 0,
      publicationState: "ARCHIVED",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    },
  ],
  resumeSettings: {
    id: "resume-1",
    title: "Resume",
    intro: "Intro",
    resumeUrl: "/resume.pdf",
    publicationState: "PUBLISHED",
    updatedAt: new Date("2026-01-02"),
  },
};

describe("publication", () => {
  it("projects only published records in deterministic display order", () => {
    const content = buildPublicContent(editableContent);

    expect(content.experience.map(({ id }) => id)).toEqual([
      "experience-a",
      "experience-b",
    ]);
    expect(content.projects.map(({ slug }) => slug)).toEqual([
      "published-project",
    ]);
    expect(content.projects[0]?.technologies.map(({ technology }) => technology)).toEqual([
      "Next.js",
      "TypeScript",
    ]);
    expect(content.skills).toEqual([]);
    expect(content.profile?.id).toBe("profile-1");
    expect(content).not.toHaveProperty("publicationState");
  });

  it("reports missing required profile and project fields", () => {
    const invalid = {
      ...editableContent,
      profile: { ...editableContent.profile!, name: "" },
      projects: [{ ...editableContent.projects[0]!, name: "", slug: "" }],
    };

    expect(validatePublishableContent(invalid)).toEqual({
      valid: false,
      errors: [
        "profile.name is required",
        "projects[0].slug is required",
        "projects[0].name is required",
      ],
    });
  });
});
