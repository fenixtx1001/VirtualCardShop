-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER,
    "brand" TEXT,
    "sport" TEXT,
    "packPriceCents" INTEGER DEFAULT 0,
    "packsPerBox" INTEGER,
    "packImageUrl" TEXT,
    "boxImageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "oddsPerPack" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSet_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "insert" TEXT,
    "variant" TEXT,
    "bookValue" REAL NOT NULL DEFAULT 0,
    "quantityOwned" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Card_productSetId_fkey" FOREIGN KEY ("productSetId") REFERENCES "ProductSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("bookValue", "cardNumber", "id", "imageUrl", "insert", "player", "position", "quantityOwned", "setId", "subset", "team", "variant") SELECT "bookValue", "cardNumber", "id", "imageUrl", "insert", "player", "position", "quantityOwned", "setId", "subset", "team", "variant" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_setId_idx" ON "Card"("setId");
CREATE INDEX "Card_player_idx" ON "Card"("player");
CREATE INDEX "Card_productSetId_idx" ON "Card"("productSetId");
CREATE UNIQUE INDEX "Card_setId_cardNumber_key" ON "Card"("setId", "cardNumber");
CREATE UNIQUE INDEX "Card_productSetId_cardNumber_key" ON "Card"("productSetId", "cardNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductSet_productId_idx" ON "ProductSet"("productId");
