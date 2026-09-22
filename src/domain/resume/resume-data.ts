import { ContentRepository } from "@/lib/db/repositories/content-repository";
import { prisma } from "@/lib/db/client";

export type PublishedResumeData = {
  profile: {
    name: string;
    headline: string;
    summary: string;
    location: string;
  };
  settings: {
    title: string;
    intro: string;
  };
  experience: ReadonlyArray<{
    company: string;
    role: string;
    description: string;
    startDate: string;
    endDate: string | null;
  }>;
  projects: ReadonlyArray<{
    name: string;
    description: string;
    url: string | null;
    repositoryUrl: string | null;
    technologies: ReadonlyArray<string>;
  }>;
  skills: ReadonlyArray<{
    name: string;
    category: string;
  }>;
};

function formatDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function getPublishedResumeData(): Promise<PublishedResumeData> {
  let content;
  try {
    content = await new ContentRepository(prisma).listPublished();
  } catch (error) {
    console.error("resume_projection_database_error", error);
    throw new Error("Published resume data is temporarily unavailable");
  }

  if (!content.profile || !content.resumeSettings) {
    throw new Error("Published resume data is unavailable");
  }

  return {
    profile: {
      name: content.profile.name,
      headline: content.profile.headline,
      summary: content.profile.summary,
      location: content.profile.location,
    },
    settings: {
      title: content.resumeSettings.title,
      intro: content.resumeSettings.intro,
    },
    experience: content.experience.map((item) => ({
      company: item.company,
      role: item.role,
      description: item.description,
      startDate: formatDate(item.startDate),
      endDate: item.endDate ? formatDate(item.endDate) : null,
    })),
    projects: content.projects.map((item) => ({
      name: item.name,
      description: item.description,
      url: item.url,
      repositoryUrl: item.repositoryUrl,
      technologies: item.technologies.map((technology) => technology.technology),
    })),
    skills: content.skills.map((item) => ({ name: item.name, category: item.category })),
  };
}
