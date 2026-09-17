import type { Prisma, PrismaClient } from "@prisma/client";

import { PublicationState } from "../types";

const orderedByDisplayOrder = [
  { displayOrder: "asc" as const },
  { id: "asc" as const },
];

type ProjectWithTechnologies = Prisma.ProjectGetPayload<{
  include: { technologies: true };
}>;

export type PublishedProject = ProjectWithTechnologies;

export type PublicContent = {
  profile: Prisma.ProfileGetPayload<{}> | null;
  experience: Prisma.ExperienceGetPayload<{}>[];
  projects: ProjectWithTechnologies[];
  skills: Prisma.SkillGetPayload<{}>[];
  resumeSettings: Prisma.ResumeSettingsGetPayload<{}> | null;
};

export type EditableContent = PublicContent;

export class ContentRepository {
  constructor(private readonly db: PrismaClient) {}

  async listPublished(): Promise<PublicContent> {
    const [profile, experience, projects, skills, resumeSettings] = await Promise.all([
      this.getPublishedProfile(),
      this.getPublishedExperience(),
      this.getPublishedProjects(),
      this.getPublishedSkills(),
      this.getResumeSettings(),
    ]);

    return { profile, experience, projects, skills, resumeSettings };
  }

  async getPublishedProject(slug: string): Promise<PublishedProject | null> {
    return this.db.project.findFirst({
      where: { slug, publicationState: PublicationState.PUBLISHED },
      include: { technologies: { orderBy: [{ displayOrder: "asc" }, { technology: "asc" }] } },
    }) as Promise<PublishedProject | null>;
  }

  async getDraftContent(): Promise<EditableContent> {
    const [profile, experience, projects, skills, resumeSettings] = await Promise.all([
      this.getProfile(),
      this.getExperience(),
      this.getProjects(),
      this.getSkills(),
      this.getResumeSettings(),
    ]);

    return { profile, experience, projects, skills, resumeSettings };
  }

  private getPublishedProfile() {
    return this.db.profile.findFirst({ where: { publicationState: PublicationState.PUBLISHED } });
  }

  private getPublishedExperience() {
    return this.db.experience.findMany({
      where: { publicationState: PublicationState.PUBLISHED },
      orderBy: orderedByDisplayOrder,
    });
  }

  private getPublishedProjects() {
    return this.db.project.findMany({
      where: { publicationState: PublicationState.PUBLISHED },
      orderBy: orderedByDisplayOrder,
      include: { technologies: { orderBy: [{ displayOrder: "asc" }, { technology: "asc" }] } },
    });
  }

  private getPublishedSkills() {
    return this.db.skill.findMany({
      where: { publicationState: PublicationState.PUBLISHED },
      orderBy: orderedByDisplayOrder,
    });
  }

  private getProfile() {
    return this.db.profile.findFirst({ orderBy: { id: "asc" } });
  }

  private getExperience() {
    return this.db.experience.findMany({ orderBy: orderedByDisplayOrder });
  }

  private getProjects() {
    return this.db.project.findMany({
      orderBy: orderedByDisplayOrder,
      include: { technologies: { orderBy: [{ displayOrder: "asc" }, { technology: "asc" }] } },
    });
  }

  private getSkills() {
    return this.db.skill.findMany({ orderBy: orderedByDisplayOrder });
  }

  private getResumeSettings() {
    return this.db.resumeSettings.findFirst({ orderBy: { id: "asc" } });
  }
}
