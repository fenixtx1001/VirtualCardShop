/*
  Warnings:

  - You are about to drop the column `notes` on the `Set` table. All the data in the column will be lost.
  - You are about to drop the column `packPrice` on the `Set` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Set" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER,
    "brand" TEXT,
    "sport" TEXT,
    "packPriceCents" INTEGER DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Set" ("brand", "createdAt", "id", "sport", "updatedAt", "year") SELECT "brand", "createdAt", "id", "sport", "updatedAt", "year" FROM "Set";
DROP TABLE "Set";
ALTER TABLE "new_Set" RENAME TO "Set";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
