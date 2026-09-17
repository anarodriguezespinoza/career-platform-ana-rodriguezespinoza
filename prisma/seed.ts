import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.profile.upsert({
    where: { id: "profile-ana" },
    update: {},
    create: {
      id: "profile-ana",
      name: "Ana Rodriguez Espinoza",
      headline: "Software Engineer",
      summary: "Building reliable products and thoughtful user experiences.",
      email: "ana@example.com",
      location: "Remote",
      publicationState: "PUBLISHED",
    },
  });

  await prisma.experience.upsert({
    where: { id: "experience-platform" },
    update: {},
    create: {
      id: "experience-platform",
      company: "Career Platform",
      role: "Software Engineer",
      description: "Designed and delivered product experiences across the platform.",
      startDate: new Date("2024-01-01"),
      displayOrder: 0,
      publicationState: "PUBLISHED",
    },
  });

  await prisma.project.upsert({
    where: { id: "project-career-platform" },
    update: {},
    create: {
      id: "project-career-platform",
      slug: "career-platform",
      name: "Career Platform",
      description: "A focused resume and portfolio platform.",
      displayOrder: 0,
      publicationState: "PUBLISHED",
      technologies: {
        create: [
          { technology: "Next.js", displayOrder: 0 },
          { technology: "TypeScript", displayOrder: 1 },
        ],
      },
    },
  });

  await prisma.skill.upsert({
    where: { id: "skill-typescript" },
    update: {},
    create: {
      id: "skill-typescript",
      name: "TypeScript",
      category: "Languages",
      displayOrder: 0,
      publicationState: "PUBLISHED",
    },
  });

  await prisma.resumeSettings.upsert({
    where: { id: "resume-settings-default" },
    update: {},
    create: {
      id: "resume-settings-default",
      title: "Ana Rodriguez Espinoza Resume",
      intro: "Resume and professional experience.",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
