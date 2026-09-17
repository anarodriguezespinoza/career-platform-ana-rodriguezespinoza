export type PublicationState = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ContentDate = Date | string;

export type EditableProfile = {
  id: string;
  name: string;
  headline: string;
  summary: string;
  email: string;
  location: string;
  avatarUrl: string | null;
  publicationState: string;
  createdAt: ContentDate;
  updatedAt: ContentDate;
};

export type EditableExperience = {
  id: string;
  company: string;
  role: string;
  description: string;
  startDate: ContentDate;
  endDate: ContentDate | null;
  displayOrder: number;
  publicationState: string;
  createdAt: ContentDate;
  updatedAt: ContentDate;
};

export type EditableProjectTechnology = {
  projectId: string;
  technology: string;
  displayOrder: number;
};

export type EditableProject = {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string | null;
  repositoryUrl: string | null;
  isFeatured: boolean;
  displayOrder: number;
  publicationState: string;
  technologies: EditableProjectTechnology[];
  createdAt: ContentDate;
  updatedAt: ContentDate;
};

export type EditableSkill = {
  id: string;
  name: string;
  category: string;
  displayOrder: number;
  publicationState: string;
  createdAt: ContentDate;
  updatedAt: ContentDate;
};

export type EditableResumeSettings = {
  id: string;
  title: string;
  intro: string;
  resumeUrl: string | null;
  publicationState: string;
  updatedAt: ContentDate;
};

export type EditableContent = {
  profile: EditableProfile | null;
  experience: EditableExperience[];
  projects: EditableProject[];
  skills: EditableSkill[];
  resumeSettings: EditableResumeSettings | null;
};

export type PublicProfile = Omit<EditableProfile, "publicationState" | "createdAt" | "updatedAt">;
export type PublicExperience = Omit<EditableExperience, "publicationState" | "createdAt" | "updatedAt">;
export type PublicProjectTechnology = EditableProjectTechnology;
export type PublicProject = Omit<EditableProject, "publicationState" | "createdAt" | "updatedAt"> & {
  technologies: PublicProjectTechnology[];
};
export type PublicSkill = Omit<EditableSkill, "publicationState" | "createdAt" | "updatedAt">;
export type PublicResumeSettings = Omit<EditableResumeSettings, "publicationState" | "updatedAt">;

export type PublicContent = {
  profile: PublicProfile | null;
  experience: PublicExperience[];
  projects: PublicProject[];
  skills: PublicSkill[];
  resumeSettings: PublicResumeSettings | null;
};
