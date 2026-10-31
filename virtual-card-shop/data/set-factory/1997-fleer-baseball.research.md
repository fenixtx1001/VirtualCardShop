# 1997 Fleer Baseball — Set Factory draft

Completed 2026-10-31. **1,851 explicit CSV cards, 21 collector families, 45 confirmed base RCs.** Product ID: 1997_Fleer_Baseball. Schema v2, DRAFT, released false. No production database import or deployment performed.

The committed CSV is the actual import payload. The generator reconstructs it offline from the normalized source snapshot. No generator execution is needed in Codespaces to import.

## Checklist inventory

| Collector family | Cards | Kind | VCS denominator |
|---|---:|---|---:|
| Base | 761 | BASE | — |
| Tiffany | 761 | PARALLEL | 20 |
| Bleacher Blasters | 10 | INSERT | null, Retail only |
| Decade of Excellence | 12 | INSERT | 72 |
| Decade of Excellence Rare Traditions | 12 | PARALLEL | 720 |
| Diamond Tribute | 12 | INSERT | 576 |
| Golden Memories | 10 | INSERT | 32 |
| Goudey Greats | 15 | INSERT | 16 |
| Goudey Greats Gold Foil | 15 | PARALLEL | 1600 |
| Headliners | 20 | INSERT | 4 |
| Lumber Company | 18 | INSERT | null, Retail only |
| New Horizon | 15 | INSERT | 8 |
| Night & Day | 10 | INSERT | 480 |
| Rookie Sensations | 20 | INSERT | 12 |
| Soaring Stars | 12 | INSERT | 24, family proxy |
| Soaring Stars Glowing | 12 | PARALLEL | null, share unknown |
| Team Leaders | 28 | INSERT | 40, family proxy |
| Team Leaders Tabs | 28 | PARALLEL | null, share unknown |
| Zone | 20 | INSERT | 160 |
| Million Dollar Moments | 50 | INSERT | 2 |
| Emerald Autograph Redemptions | 10 | INSERT | 8 |

Base and Tiffany retain all numbers 1–761. Base #1–500 are Series One; #501–761 Series Two. Encore #696–720, checklists #491–500, team/expansion checklists #721–750 and Bonus Checklist #761 stay inside their original collector sets.

## Sources and corrections

All sources were fetched directly and parsed with explicit card-set namespace checks. Normalized records retain source URLs and raw-response SHA-256 hashes in the source JSON.

- [TCDB Fleer checklist](https://www.tcdb.com/Checklist.cfm/sid/929/1997-Fleer), eight populated pages: all 761 numbers, identities, teams and annotations.
- [Separate rookie index](https://www.tcdb.com/Rookies.cfm/sid/929/1997-Fleer): 45 entries, identities/teams matched to canonical checklist; next page empty.
- [Insert/parallel index](https://www.tcdb.com/Inserts.cfm/sid/929/1997-Fleer): all 18 named insert/variant families and Tiffany reviewed, plus returned autograph and promos. Each checklist uses its own TCDB namespace and explicit rows.
- Tiffany namespace 10909, eight populated pages: all identities/teams compared with base, with scan-grounded corrections below.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/1997_Fleer): all 761 base subjects and all 13 non-MDM regular insert checklists compared number by number; physical distribution, odds, foil/die-cut versions and autograph program reviewed.
- [BCP Million Dollar Moments](https://baseballcardpedia.com/index.php/1997_Fleer_Million_Dollar_Moments) and [TCDB shared checklist 59564](https://www.tcdb.com/Checklist.cfm/sid/59564/1997-98-Fleer-Million-Dollar-Moments): all 50 numbers/names matched; historical teams retained.
- [Emerald redemption checklist 877](https://www.tcdb.com/Checklist.cfm/sid/877/1997-Circa-Emerald-Autographs-Redemptions): ten numbered “X of 10” tokens. BCP and TCDB's Fleer autograph note establish identical cards were inserted in Fleer S2. Circa's different odds are not used.

BCP calls #512 David Ortiz, while the printed card and TCDB call him David Arias. CSV keeps David Arias RC, Minnesota Twins, with a David Ortiz alias in variant for harvesting. BCP confirms 42 of TCDB's 45 RCs and omits RC marks for #285 Dave Swartzbaugh, #288 Pedro Valdes and #437 Marc Wilkins; retain those three matching canonical/rookie-index RC designations. No opposing non-rookie claim was established. ROO markers describe card design, never sufficient alone for true RC. Tiffany/inserts receive no inferred RC suffix.

Direct front/back scan inspection resolved catalog errors. Twenty scan URLs/hashes and observations are retained under reviewedScanEvidence:

- Tiffany #37 Chili Davis is labeled California Angels, despite a separate TRADED TO ROYALS notice. Correct the source's Kansas City team to the printed team.
- Base #427 Carlos Garcia is labeled Pittsburgh Pirates, despite a separate TRADED TO BLUE JAYS notice. Correct the source's Toronto team to the printed team.
- Base #397 Todd Hundley and Tiffany #13 Cal Ripken Jr. carry All-Star badges omitted by their respective sources.
- Tiffany #263 Greg Maddux and #264 Fred McGriff carry All-Star and World Series badges, matching base; source LL tags are incorrect.
- Tiffany reproduces base subset badges. Restore 39 omitted ROO annotations; do not infer RC. Freeze/check the exact 43 raw annotation differences so new source changes cannot be silently accepted.
- Expansion logos #749/#750 are called Insert Checklist by TCDB and Arizona Diamondbacks/Tampa Bay Devil Rays by BCP. Preserve checklist subject and actual historical team.

The linked MDM namespace 539333 returns no checklist. Resolve to complete shared 1997–98 issue 59564, not football or returned Exchange cards. Extra Tiffany page nine misleadingly returns another namespace; exclude it and reject such rows through parser namespace validation. No reused BasicID filters, fabricated rows or partial-count fallback.

## Scope

Include all 50 shared original Million Dollar Moments game cards, not mail-in Exchange backs reading THIS IS NOT AN OFFICIAL GAME CARD. Include ten physical generic Emerald redemption tokens, with #7 short printed. The returned autograph is 200 signed copies of Andruw Jones's Circa #329, a mail-in prize, not a pack-issued Fleer autograph. Do not convert its NNO source labeling into an invented autograph checklist. The redemption face promises six cards, but Fleer's offer returned only Jones.

Exclude Matt Williams #489 Promotional Sample, Roy Firestone promo, returned autograph prizes, MDM Exchange and blank-front/instant-win prize tokens without a fully verified inventory. Regular Soaring Stars' two star-foil stocks remain one numbered family; separately catalogued Glowing and Team Leaders Tabs checklists are preserved in full.

Only 13 blank teams: base/Tiffany Bonus Checklist #761, MDM Checklist #1 and ten generic redemptions. Checklist blanks are intentional. Non-team tokens require review.teamData PENDING and explicit staging flag. No invented MLB/League team.

## Draft pack model and release limits

Historical packs: 36/box, S1 10 cards, S2 11. Combined draft chooses 11 slots (S2 size) and a **50/50 series mixture as a VCS design assumption**, not historical production share. Double single-series Hobby denominators. Tiffany stays 20 because both series share that rate; MDM becomes 2. Retail-only Lumber Company (physical S1 denominator 18) and Bleacher Blasters (S2 36) remain null.

Tabs/Glowing production shares are unverified. Null odds prevent independently rolling the parent frequency again. Regular Team Leaders and Soaring Stars carry parent-family rates as proxies, not verified version-specific odds. A speculative 10–20% Glowing estimate is not a verified rate.

Engine rolls families independently and replaces base slots. PARALLEL isBase=false/isInsert=false, but positive odds enable rolls. It cannot reproduce physical series correlation, variable 10/11 pack sizes or card-specific rarity weights. Complete checklists retain equal card selection within each active family, per Set Factory conventions. Base #751–761, MDM #46–50 and redemption #7 retain rarity notes; exact weighting needs review. No prizes/redemption runtime.

**Release blocked** pending pack/series/channel/variant and short-print modeling QA, generic-token team review, pricing and images. These disclosed modeling limits are not missing player checklist rows.

## Validation completed

- Generated all 1,851 CSV rows; exact --check regeneration passed.
- Full BCP number/name comparison, all Tiffany identities/teams, four insert variant/parallel comparisons, all 45 canonical/index rookie identities/teams.
- Unique setKey/cardNumber identities, historical-team vocabulary, six-column format, subset ranges and documented corrections checked.
- Parser captions, strict trailing whole-token boundaries, wrong-source namespace rejection and twelve corruption tests passed.
- All 30 existing Node unit tests passed; existing pack-art, checklist-grade and import-parser smoke scripts passed.
- ESLint passed for new integration harness.
- Actual import-set-bundle.ts executed against full Prisma schema in a fresh disposable local PGlite PostgreSQL server: dry run writes nothing; apply without flag blocked; flagged apply creates 1 unreleased product, 21 sets and 1,851 cards. Every imported player/team/subset/variant compared with CSV. Rerun inserts zero, updates 1,851 and preserves sentinel prices and front/back/pack images. released=true manifest rejected.
- No production database or production credentials used by test harness.

Offline verification:

    python3 scripts/generate-1997-fleer-baseball.py --check

Live revalidation: --refresh-sources --check. Fails closed on retrieval/inventory/namespace changes or changed reviewed scan hashes. Without --check, refreshed source/CSV are written only after validation.

Import this branch's bundle with existing importer, dry-run then --apply --allow-pending-teams. New product remains unreleased for Admin pricing/image harvesting. Reruns preserve existing prices, images and existing release state; importer does not change an already released product to unreleased.
