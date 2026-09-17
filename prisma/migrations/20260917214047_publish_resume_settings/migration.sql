-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ResumeSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "resumeUrl" TEXT,
    "publicationState" TEXT NOT NULL DEFAULT 'DRAFT',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ResumeSettings" ("id", "intro", "resumeUrl", "title", "updatedAt") SELECT "id", "intro", "resumeUrl", "title", "updatedAt" FROM "ResumeSettings";
DROP TABLE "ResumeSettings";
ALTER TABLE "new_ResumeSettings" RENAME TO "ResumeSettings";
CREATE INDEX "ResumeSettings_publicationState_id_idx" ON "ResumeSettings"("publicationState", "id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
