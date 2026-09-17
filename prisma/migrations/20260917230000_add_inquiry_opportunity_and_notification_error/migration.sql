ALTER TABLE "ContactInquiry" ADD COLUMN "opportunityType" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "ContactInquiry" ADD COLUMN "notificationError" TEXT;
