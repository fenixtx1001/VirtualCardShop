-- CreateTable
CREATE TABLE "Card" (
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
    "quantityOwned" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "RipLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setId" TEXT NOT NULL,
    "cardsJson" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Card_setId_idx" ON "Card"("setId");

-- CreateIndex
CREATE INDEX "Card_player_idx" ON "Card"("player");

-- CreateIndex
CREATE UNIQUE INDEX "Card_setId_cardNumber_key" ON "Card"("setId", "cardNumber");
