/*
  Warnings:

  - You are about to drop the column `insert` on the `Card` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "setId" TEXT NOT NULL,
    "productSetId" TEXT,
    "cardNumber" TEXT NOT NULL,
    "player" TEXT NOT NULL,
    "team" TEXT,
    "position" TEXT,
    "subset" TEXT,
    "variant" TEXT,
    "bookValue" REAL NOT NULL DEFAULT 0,
    "quantityOwned" INTEGER NOT NULL DEFAULT 0,
    "frontImageUrl" TEXT,
    "backImageUrl" TEXT,
    CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Card_productSetId_fkey" FOREIGN KEY ("productSetId") REFERENCES "ProductSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("backImageUrl", "bookValue", "cardNumber", "frontImageUrl", "id", "player", "position", "productSetId", "quantityOwned", "setId", "subset", "team", "variant") SELECT "backImageUrl", "bookValue", "cardNumber", "frontImageUrl", "id", "player", "position", "productSetId", "quantityOwned", "setId", "subset", "team", "variant" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_setId_idx" ON "Card"("setId");
CREATE INDEX "Card_player_idx" ON "Card"("player");
CREATE INDEX "Card_productSetId_idx" ON "Card"("productSetId");
CREATE UNIQUE INDEX "Card_setId_cardNumber_key" ON "Card"("setId", "cardNumber");
CREATE UNIQUE INDEX "Card_productSetId_cardNumber_key" ON "Card"("productSetId", "cardNumber");
CREATE TABLE "new_CardOwnership" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CardOwnership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardOwnership_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CardOwnership" ("cardId", "id", "quantity", "userId") SELECT "cardId", "id", "quantity", "userId" FROM "CardOwnership";
DROP TABLE "CardOwnership";
ALTER TABLE "new_CardOwnership" RENAME TO "CardOwnership";
CREATE INDEX "CardOwnership_cardId_idx" ON "CardOwnership"("cardId");
CREATE UNIQUE INDEX "CardOwnership_userId_cardId_key" ON "CardOwnership"("userId", "cardId");
CREATE TABLE "new_ProductSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isInsert" BOOLEAN NOT NULL DEFAULT false,
    "oddsPerPack" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSet_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductSet" ("createdAt", "id", "isBase", "isInsert", "name", "oddsPerPack", "productId", "updatedAt") SELECT "createdAt", "id", "isBase", "isInsert", "name", "oddsPerPack", "productId", "updatedAt" FROM "ProductSet";
DROP TABLE "ProductSet";
ALTER TABLE "new_ProductSet" RENAME TO "ProductSet";
CREATE INDEX "ProductSet_productId_idx" ON "ProductSet"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
