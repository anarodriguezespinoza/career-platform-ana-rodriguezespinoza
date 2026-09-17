import type {
  EditableContent,
  EditableExperience,
  EditableProject,
  EditableSkill,
  PublicContent,
} from "./types";

export type ValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: string[] };

const isPublished = (record: { publicationState: string }) =>
  record.publicationState === "PUBLISHED";

type OrderedRecord =
  | { displayOrder: number; id: string }
  | { displayOrder: number; technology: string };

function compareDisplayOrder(a: OrderedRecord, b: OrderedRecord) {
  const aKey = "id" in a ? a.id : a.technology;
  const bKey = "id" in b ? b.id : b.technology;
  return a.displayOrder - b.displayOrder || aKey.localeCompare(bKey);
}

export function validatePublishableContent(records: EditableContent): ValidationResult {
  const errors: string[] = [];
  const profile = records.profile && isPublished(records.profile) ? records.profile : null;
  const projects = records.projects.filter(isPublished);

  if (profile) {
    if (!profile.name.trim()) errors.push("profile.name is required");
    if (!profile.headline.trim()) errors.push("profile.headline is required");
    if (!profile.summary.trim()) errors.push("profile.summary is required");
    if (!profile.email.trim()) errors.push("profile.email is required");
    if (!profile.location.trim()) errors.push("profile.location is required");
  }

  projects.forEach((project, index) => {
    if (!project.slug.trim()) errors.push(`projects[${index}].slug is required`);
    if (!project.name.trim()) errors.push(`projects[${index}].name is required`);
    if (!project.description.trim()) errors.push(`projects[${index}].description is required`);
  });

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

export function buildPublicContent(records: EditableContent): PublicContent {
  const validation = validatePublishableContent(records);
  if (!validation.valid) {
    throw new Error(`Content is not publishable: ${validation.errors.join(", ")}`);
  }

  const profile = records.profile && isPublished(records.profile) ? records.profile : null;
  return {
    profile: profile && {
      id: profile.id,
      name: profile.name,
      headline: profile.headline,
      summary: profile.summary,
      email: profile.email,
      location: profile.location,
      avatarUrl: profile.avatarUrl,
    },
    experience: records.experience.filter(isPublished).sort(compareDisplayOrder).map(({ id, company, role, description, startDate, endDate, displayOrder }) => ({
      id, company, role, description, startDate, endDate, displayOrder,
    })),
    projects: records.projects.filter(isPublished).sort(compareDisplayOrder).map(({ id, slug, name, description, url, repositoryUrl, displayOrder, technologies }) => ({
      id,
      slug,
      name,
      description,
      url,
      repositoryUrl,
      displayOrder,
      technologies: [...technologies].sort(compareDisplayOrder).map(({ projectId, technology, displayOrder: technologyDisplayOrder }) => ({
        projectId,
        technology,
        displayOrder: technologyDisplayOrder,
      })),
    })),
    skills: records.skills.filter(isPublished).sort(compareDisplayOrder).map(({ id, name, category, displayOrder }) => ({ id, name, category, displayOrder })),
    resumeSettings: records.resumeSettings && isPublished(records.resumeSettings)
      ? { id: records.resumeSettings.id, title: records.resumeSettings.title, intro: records.resumeSettings.intro, resumeUrl: records.resumeSettings.resumeUrl }
      : null,
  };
}
