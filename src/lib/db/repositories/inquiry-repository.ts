import type { Prisma, PrismaClient } from "@prisma/client";

import { InquiryStatus, NotificationStatus } from "../types";

export type CreateInquiryInput = {
  name: string;
  email: string;
  message: string;
  source: string;
};

export type InquiryFilters = {
  status?: InquiryStatus;
  notificationStatus?: NotificationStatus;
};

export type Inquiry = Prisma.ContactInquiryGetPayload<{}>;
export type PrivateInquiry = Prisma.ContactInquiryGetPayload<{}>;

export class InquiryRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateInquiryInput) {
    return this.db.$transaction(async (transaction) =>
      transaction.contactInquiry.create({
        data: {
          id: crypto.randomUUID(),
          ...input,
          privateNotes: "",
          status: InquiryStatus.NEW,
          notificationStatus: NotificationStatus.PENDING,
        },
      }),
    );
  }

  async list(filters: InquiryFilters): Promise<PrivateInquiry[]> {
    return this.db.contactInquiry.findMany({
      where: {
        status: filters.status,
        notificationStatus: filters.notificationStatus,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }

  async updateStatus(id: string, status: InquiryStatus): Promise<PrivateInquiry> {
    return this.db.$transaction(async (transaction) =>
      transaction.contactInquiry.update({ where: { id }, data: { status } }),
    );
  }

  async updateNotes(id: string, notes: string): Promise<PrivateInquiry> {
    return this.db.$transaction(async (transaction) =>
      transaction.contactInquiry.update({ where: { id }, data: { privateNotes: notes } }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.contactInquiry.delete({ where: { id } });
  }
}
