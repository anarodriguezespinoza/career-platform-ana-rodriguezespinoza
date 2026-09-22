import { InquiryRepository } from "@/lib/db/repositories/inquiry-repository";
import { prisma } from "@/lib/db/client";
import { sendInquiryNotification } from "@/lib/email/ses";
import type { AdminIdentity } from "@/lib/auth/require-admin";
import { inquiryRateLimiter } from "./rate-limit";
import type { ContactInput } from "./validation";
import { logger } from "@/lib/observability/logger";

export type RequestContext = {
  clientIdentity: string;
  source?: string;
  requestId?: string;
};

export type SubmissionResult = {
  accepted: true;
  notificationStatus: "SENT" | "FAILED";
};

export type InquiryNotificationStatus = "PENDING" | "SENT" | "FAILED";

export async function submitInquiry(input: ContactInput, context: RequestContext): Promise<SubmissionResult> {
  inquiryRateLimiter.consume(context.clientIdentity);
  const repository = new InquiryRepository(prisma);
  const inquiry = await repository.create({
    ...input,
    source: context.source ?? "contact-form",
  });

  try {
    await sendInquiryNotification({
      id: inquiry.id,
      name: inquiry.name,
      email: inquiry.email,
      message: inquiry.message,
      opportunityType: inquiry.opportunityType,
    });
    await repository.updateNotificationStatus(inquiry.id, "SENT");
    return { accepted: true, notificationStatus: "SENT" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown notification failure";
    await repository.updateNotificationStatus(inquiry.id, "FAILED", errorMessage);
    logger.error("inquiry_notification_failed", { inquiryId: inquiry.id, requestId: context.requestId, errorType: error instanceof Error ? error.name : "unknown" });
    return { accepted: true, notificationStatus: "FAILED" };
  }
}

export async function deleteInquiry(id: string, _actor: AdminIdentity): Promise<void> {
  await new InquiryRepository(prisma).delete(id);
}
