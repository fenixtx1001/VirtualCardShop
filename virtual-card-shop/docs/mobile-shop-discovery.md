# Mobile shop discovery

Based on `2341ad528ac2e88e187b7aac569a34b8fcc091e3`.

## Behavior

- Discover is the initial view. All Products retains search, sport/year filters and pack-price sorting. The last selected view is remembered in this browser.
- Both views feature the Daily Deal. Discover has horizontal shelves with a final Show all tile; category browsing preserves shelf position on return.
- Five shared Sales products receive 5% off normal pack and box prices. One separate Daily Deal receives 15% off. Discounts never stack. The standard box price remains pack price × packs per box × 0.75, rounded to cents.
- Selections are persisted per Chicago calendar day and exclude all six of yesterday's promotions. Newly released products do not reshuffle an existing day. Catalogs with fewer than twelve eligible products may show fewer promotions to avoid consecutive-day repeats.
- Existing daily deals are retained on upgrade when eligible; if yesterday used that product, a nonrepeating replacement is chosen during the one-time upgrade.
- Sport, era, price and personalized shelves rotate by day. Completion recommendations require at least 70% current base-set completion and exclude completed sets. Prestige recommendations require at least 70% of the cards at the next level above both current and historical completion. They show the relevant set and missing copy count. Inserts do not inflate base completion.
- Graded and unrevealed grading-order ownership count toward progress, matching prestige's existing ownership rules. Personalized data is authenticated and never publicly cached.
- The new bottom sheet retains pack/box quantities and checks the quoted unit price at checkout. A stale price yields a review-and-retry message. Purchases debit balances conditionally inside the existing inventory/financial transaction.
- Singles functionality is extracted intact into its own component. The compact shop header keeps navigation, balance, reward claims and account controls accessible.

## Install

From `virtual-card-shop` after fetching and checking out the feature branch:

```bash
npx prisma generate
node --import tsx --test tests/shop-discovery.test.ts
npm run build
node --import tsx scripts/install-shop-discovery.ts
```

The installer loads `.env.local`, then `.env`, without overriding existing environment variables. It uses `DATABASE_URL` through Prisma Client. It applies only the two additive, idempotent statements in the included migration SQL; it does not run the repo's legacy Prisma CLI datasource configuration, `db push`, reset, or unrelated migrations. Existing DailyDeal rows remain intact. Run it against the database used by the deployment before deploying this code.

For local inspection, use `npm run dev` and open `/shop` from the Codespaces forwarded port.

## Verification

The checked-in tests cover 400 promotion days, no overlap or consecutive-day repeats, small catalogs, retained legacy selections, integer-cent pack/box pricing, Chicago midnight/DST, deterministic rotating shelves, and base/prestige recommendation separation.

The SQL was additionally checked with isolated PostgreSQL-compatible fixtures for raw/graded/pending ownership, revealed grading exclusion, user isolation, hidden product exclusion, historical prestige, and repeated additive schema installation.

Browser checks with fixture API responses passed at 320, 375, 390, 430, 768 and 1440px: no horizontal page overflow, Sales Show all, preserved shelf scroll, purchase quantity, search, remembered tabs, stale-price review, and Singles navigation. Mobile screenshots were visually inspected. TypeScript and the production build passed.

Before production release, check with the real catalog/account: horizontal scrolling, category return, search, pack and box purchases, balance and inventory changes, and Singles. No live-account purchases were performed during development.

## Rollback

Revert the code commit if needed. The two added DailyDeal fields are safe to leave in place and are ignored by the previous code. Do not drop tables or reset the database.
