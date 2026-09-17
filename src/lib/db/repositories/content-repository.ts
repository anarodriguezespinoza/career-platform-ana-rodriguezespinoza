import type { Prisma, PrismaClient } from "@prisma/client";

import type { ContentType, SaveDraftInput } from "@/domain/content/admin-service";
import { PublicationState } from "../types";

const orderedByDisplayOrder = [{ displayOrder: "asc" as const }, { id: "asc" as const }];
type DatabaseClient = PrismaClient | Prisma.TransactionClient;
type ProjectWithTechnologies = Prisma.ProjectGetPayload<{ include: { technologies: true } }>;

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
  constructor(private readonly db: DatabaseClient) {}

  async listPublished(): Promise<PublicContent> {
    const [profile, experience, projects, skills, resumeSettings] = await Promise.all([
      this.getPublishedProfile(), this.getPublishedExperience(), this.getPublishedProjects(),
      this.getPublishedSkills(), this.getPublishedResumeSettings(),
    ]);
    return { profile, experience, projects, skills, resumeSettings };
  }

  async getPublishedProject(slug: string): Promise<PublishedProject | null> {
    return this.db.project.findFirst({ where: { slug, publicationState: PublicationState.PUBLISHED }, include: { technologies: { orderBy: [{ displayOrder: "asc" }, { technology: "asc" }] } } });
  }

  async getDraftContent(): Promise<EditableContent> {
    const [profile, experience, projects, skills, resumeSettings] = await Promise.all([
      this.getProfile(), this.getExperience(), this.getProjects(), this.getSkills(), this.getResumeSettings(),
    ]);
    return { profile, experience, projects, skills, resumeSettings };
  }

  async saveDraft(input: SaveDraftInput): Promise<EditableContent> {
    const data = input.data;
    if (input.type === "profile") {
      await this.db.profile.upsert({ where: { id: input.id }, create: { id: input.id, name: String(data.name), headline: String(data.headline), summary: String(data.summary), email: String(data.email), location: String(data.location), avatarUrl: data.avatarUrl == null ? null : String(data.avatarUrl), publicationState: PublicationState.DRAFT }, update: { name: String(data.name), headline: String(data.headline), summary: String(data.summary), email: String(data.email), location: String(data.location), avatarUrl: data.avatarUrl == null ? null : String(data.avatarUrl), publicationState: PublicationState.DRAFT } });
    } else if (input.type === "experience") {
      await this.db.experience.upsert({ where: { id: input.id }, create: { id: input.id, company: String(data.company), role: String(data.role), description: String(data.description), startDate: new Date(String(data.startDate)), endDate: data.endDate ? new Date(String(data.endDate)) : null, displayOrder: Number(data.displayOrder ?? 0), publicationState: PublicationState.DRAFT }, update: { company: String(data.company), role: String(data.role), description: String(data.description), startDate: new Date(String(data.startDate)), endDate: data.endDate ? new Date(String(data.endDate)) : null, displayOrder: Number(data.displayOrder ?? 0), publicationState: PublicationState.DRAFT } });
    } else if (input.type === "project") {
      await this.db.project.upsert({ where: { id: input.id }, create: { id: input.id, slug: String(data.slug), name: String(data.name), description: String(data.description), url: data.url == null ? null : String(data.url), repositoryUrl: data.repositoryUrl == null ? null : String(data.repositoryUrl), displayOrder: Number(data.displayOrder ?? 0), publicationState: PublicationState.DRAFT }, update: { slug: String(data.slug), name: String(data.name), description: String(data.description), url: data.url == null ? null : String(data.url), repositoryUrl: data.repositoryUrl == null ? null : String(data.repositoryUrl), displayOrder: Number(data.displayOrder ?? 0), publicationState: PublicationState.DRAFT } });
      if (Array.isArray(data.technologies)) {
        await this.db.projectTechnology.deleteMany({ where: { projectId: input.id } });
        await this.db.projectTechnology.createMany({ data: data.technologies.map((technology, index) => ({ projectId: input.id, technology: String(technology), displayOrder: index })) });
      }
    } else if (input.type === "skill") {
      await this.db.skill.upsert({ where: { id: input.id }, create: { id: input.id, name: String(data.name), category: String(data.category), displayOrder: Number(data.displayOrder ?? 0), publicationState: PublicationState.DRAFT }, update: { name: String(data.name), category: String(data.category), displayOrder: Number(data.displayOrder ?? 0), publicationState: PublicationState.DRAFT } });
    } else {
      await this.db.resumeSettings.upsert({ where: { id: input.id }, create: { id: input.id, title: String(data.title), intro: String(data.intro), resumeUrl: data.resumeUrl == null ? null : String(data.resumeUrl), publicationState: PublicationState.DRAFT }, update: { title: String(data.title), intro: String(data.intro), resumeUrl: data.resumeUrl == null ? null : String(data.resumeUrl), publicationState: PublicationState.DRAFT } });
    }
    return this.getDraftContent();
  }

  async setPublicationState(type: ContentType, id: string, state: string): Promise<void> {
    if (type === "profile") await this.db.profile.update({ where: { id }, data: { publicationState: state } });
    else if (type === "experience") await this.db.experience.update({ where: { id }, data: { publicationState: state } });
    else if (type === "project") await this.db.project.update({ where: { id }, data: { publicationState: state } });
    else if (type === "skill") await this.db.skill.update({ where: { id }, data: { publicationState: state } });
    else await this.db.resumeSettings.update({ where: { id }, data: { publicationState: state } });
  }

  transaction<T>(callback: (repository: ContentRepository) => Promise<T>): Promise<T> {
    if ("$transaction" in this.db) return this.db.$transaction((tx) => callback(new ContentRepository(tx)));
    return callback(this);
  }

  private getPublishedProfile() { return this.db.profile.findFirst({ where: { publicationState: PublicationState.PUBLISHED }, orderBy: { id: "asc" } }); }
  private getPublishedExperience() { return this.db.experience.findMany({ where: { publicationState: PublicationState.PUBLISHED }, orderBy: orderedByDisplayOrder }); }
  private getPublishedProjects() { return this.db.project.findMany({ where: { publicationState: PublicationState.PUBLISHED }, orderBy: orderedByDisplayOrder, include: { technologies: { orderBy: [{ displayOrder: "asc" }, { technology: "asc" }] } } }); }
  private getPublishedSkills() { return this.db.skill.findMany({ where: { publicationState: PublicationState.PUBLISHED }, orderBy: orderedByDisplayOrder }); }
  private getPublishedResumeSettings() { return this.db.resumeSettings.findFirst({ where: { publicationState: PublicationState.PUBLISHED }, orderBy: { id: "asc" } }); }
  private getProfile() { return this.db.profile.findFirst({ orderBy: { id: "asc" } }); }
  private getExperience() { return this.db.experience.findMany({ orderBy: orderedByDisplayOrder }); }
  private getProjects() { return this.db.project.findMany({ orderBy: orderedByDisplayOrder, include: { technologies: { orderBy: [{ displayOrder: "asc" }, { technology: "asc" }] } } }); }
  private getSkills() { return this.db.skill.findMany({ orderBy: orderedByDisplayOrder }); }
  private getResumeSettings() { return this.db.resumeSettings.findFirst({ orderBy: { id: "asc" } }); }
}
