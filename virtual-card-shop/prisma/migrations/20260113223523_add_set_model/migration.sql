-- CreateTable
CREATE TABLE "Set" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER,
    "brand" TEXT,
    "sport" TEXT,
    "pricePerPack" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "setId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "player" TEXT NOT NULL,
    "team" TEXT,
    "position" TEXT,
    "subset" TEXT,
    "insert" TEXT,
    "variant" TEXT,
    "bookValue" REAL NOT NULL DEFAULT 0,
    "quantityOwned" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("bookValue", "cardNumber", "id", "insert", "player", "position", "quantityOwned", "setId", "subset", "team", "variant") SELECT "bookValue", "cardNumber", "id", "insert", "player", "position", "quantityOwned", "setId", "subset", "team", "variant" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_setId_idx" ON "Card"("setId");
CREATE INDEX "Card_player_idx" ON "Card"("player");
CREATE UNIQUE INDEX "Card_setId_cardNumber_key" ON "Card"("setId", "cardNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
