import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/db/client";
import {
  ContentRepository,
  type CreateInquiryInput,
  InquiryRepository,
} from "../../src/lib/db/repositories";
import { InquiryStatus, PublicationState } from "../../src/lib/db/types";

const contentRepository = new ContentRepository(prisma);
const inquiryRepository = new InquiryRepository(prisma);

beforeEach(async () => {
  await prisma.contactInquiry.deleteMany();
  await prisma.projectTechnology.deleteMany();
  await prisma.project.deleteMany();
  await prisma.experience.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.resumeSettings.deleteMany();
});

describe("ContentRepository", () => {
  it("excludes drafts from public content and orders records deterministically", async () => {
    await prisma.profile.createMany({
      data: [
        {
          id: "profile-2",
          name: "Later profile",
          headline: "Engineer",
          summary: "Summary",
          email: "later@example.com",
          location: "Remote",
          publicationState: PublicationState.PUBLISHED,
        },
        {
          id: "profile-1",
          name: "Stable profile",
          headline: "Engineer",
          summary: "Summary",
          email: "ana@example.com",
          location: "Remote",
          publicationState: PublicationState.PUBLISHED,
        },
      ],
    });
    await prisma.experience.createMany({
      data: [
        {
          id: "experience-b",
          company: "B",
          role: "Role B",
          description: "B",
          startDate: new Date("2022-01-01"),
          displayOrder: 1,
          publicationState: PublicationState.PUBLISHED,
        },
        {
          id: "experience-a",
          company: "A",
          role: "Role A",
          description: "A",
          startDate: new Date("2021-01-01"),
          displayOrder: 1,
          publicationState: PublicationState.PUBLISHED,
        },
        {
          id: "experience-draft",
          company: "Draft",
          role: "Draft",
          description: "Draft",
          startDate: new Date("2023-01-01"),
          displayOrder: 0,
          publicationState: PublicationState.DRAFT,
        },
      ],
    });
    await prisma.project.createMany({
      data: [
        {
          id: "project-published",
          slug: "published-project",
          name: "Published project",
          description: "Public",
          displayOrder: 1,
          publicationState: PublicationState.PUBLISHED,
          isFeatured: true,
        },
        {
          id: "project-draft",
          slug: "draft-project",
          name: "Draft project",
          description: "Private",
          displayOrder: 0,
          publicationState: PublicationState.DRAFT,
        },
      ],
    });

    const content = await contentRepository.listPublished();

    expect(content.profile?.id).toBe("profile-1");
    expect(content.experience.map(({ id }) => id)).toEqual([
      "experience-a",
      "experience-b",
    ]);
    expect(content.projects.map(({ slug }) => slug)).toEqual([
      "published-project",
    ]);
    expect(content.projects[0]?.isFeatured).toBe(true);
    expect(await contentRepository.getPublishedProject("draft-project")).toBeNull();
  });

  it("returns editable content including drafts", async () => {
    await prisma.project.create({
      data: {
        id: "project-draft",
        slug: "draft-project",
        name: "Draft project",
        description: "Private",
        displayOrder: 0,
        publicationState: PublicationState.DRAFT,
      },
    });
    await prisma.resumeSettings.createMany({
      data: [
        {
          id: "resume-draft",
          title: "Draft resume",
          intro: "Private",
          publicationState: PublicationState.DRAFT,
        },
        {
          id: "resume-published",
          title: "Published resume",
          intro: "Public",
          publicationState: PublicationState.PUBLISHED,
        },
      ],
    });

    const content = await contentRepository.getDraftContent();
    const published = await contentRepository.listPublished();

    expect(content.projects[0]?.slug).toBe("draft-project");
    expect(published.resumeSettings?.id).toBe("resume-published");
  });
});

describe("InquiryRepository", () => {
  it("creates inquiries with private notes and notification status", async () => {
    const input: CreateInquiryInput = {
      name: "Visitor",
      email: "visitor@example.com",
      message: "Hello",
      source: "contact-form",
    };

    const inquiry = await inquiryRepository.create(input);

    expect(inquiry).toMatchObject({
      ...input,
      privateNotes: "",
      status: InquiryStatus.NEW,
      notificationStatus: "PENDING",
    });
    expect(inquiry.createdAt).toBeInstanceOf(Date);
    expect(inquiry.updatedAt).toBeInstanceOf(Date);
  });

  it("filters, updates, and deletes inquiries", async () => {
    const first = await inquiryRepository.create({
      name: "First",
      email: "first@example.com",
      message: "First",
      source: "contact-form",
    });
    const second = await inquiryRepository.create({
      name: "Second",
      email: "second@example.com",
      message: "Second",
      source: "resume",
    });

    await inquiryRepository.updateStatus(first.id, InquiryStatus.READ);
    await inquiryRepository.updateNotes(first.id, "Follow up");

    const filtered = await inquiryRepository.list({ status: InquiryStatus.READ });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ id: first.id, privateNotes: "Follow up" });

    await inquiryRepository.delete(second.id);
    expect(await inquiryRepository.list({})).toHaveLength(1);
  });
});
