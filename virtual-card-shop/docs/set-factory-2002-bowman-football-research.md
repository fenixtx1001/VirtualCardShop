# 2002 Bowman Football — Set Factory draft

The generated import contains **1,022 actual catalogue rows across eleven intact collector families**, including the full 275-card base and 165 true base RCs. It remains unreleased for pricing, images and the specific historical-attribute/collation checks below. No production database was accessed and nothing was deployed.

## Checklist inventory

| Family | Cards | Attributes |
|---|---:|---|
| Base | 275 | Veterans #1–110; true rookies #111–275 |
| Gold | 275 | Serial numbered /50 |
| Silver | 275 | Serial numbered /250 |
| Uncirculated | 110 | Actual noncontiguous rookie roster; reported print run 290 |
| Draft Day Relics | 10 | Five hat and five jersey cards |
| Fabric of the Future | 17 | Game-worn Senior Bowl jerseys |
| Flashback Autographs | 8 | Certified veteran signatures |
| Flashback Jerseys | 11 | Player-worn jerseys |
| Signs of the Future | 19 | Certified signatures |
| Signs of the Future Red Ink | 20 | Distinct roster including Daniel Graham |
| Checklist inserts | 2 | Separate #1 and #2; blank teams intentional |
| **Total** | **1,022** | **165 base RC suffixes only** |

Regular paper Bowman is the product. Separate Bowman Chrome and Bowman's Best are excluded. The dealer's reference to cross-product Team Topps Legends distribution does not establish another exclusive 2002 Bowman collector checklist; no speculative Legends roster is added. Fulfilled Uncirculated cards are included; generic expired redemption rights are not manufactured as extra player cards.

## Sources and verification method

- [TCDB base](https://www.tcdb.com/Checklist.cfm/sid/4525/2002-Bowman) and [related index](https://www.tcdb.com/Inserts.cfm/sid/4525/2002-Bowman): all 17 actual paginated base/insert/parallel source pages, plus the two inline checklist cards. Each row retains its source number, full label, team, caption, direct original-card URL and CID. The related scope is nine linked namespaces, plus base and checklist inserts. Row counts, source namespaces, per-family number/CID uniqueness and saved row checksums are enforced.
- [Complete two-page rookie index](https://www.tcdb.com/Rookies.cfm/sid/4525/2002-Bowman): page one has 100 rows; page two has 65. Every number, identity and team is compared with the full base. It is not accepted as a 100-card rookie checklist merely because page one ends there.
- [MyCardBatch independent inventory](https://mycardbatch.com/checklists/bowman-2002-football): eight actual tables containing 470 number/name/team tuples: Base 275, Draft 10, Fabric 17, Flashback Autographs 8, Flashback Jerseys 11, Signs 19, Red Ink 20, Uncirculated 110. Every tuple is checked and every included family must have complete independent coverage. The independent base explicitly marks all 165 true RCs. Gold/Silver lack complete independent tables there; their separately retrieved 275-card rosters are checked card-by-card against the independently corroborated base, with serial limits corroborated by the dealer programme.
- [Dave & Adam's Hobby](https://www.dacardworld.com/sports-cards/2002-bowman-football-hobby-box) and [Steel City indexed description](https://www.steelcitycollectibles.com/i/2002-bowman-football-hobby-box): Hobby 24 packs ×10 cards; combined base-parallel, redemption, autograph and relic odds. The live generator uses the Dave & Adam's stable historical description. Steel City's fetched HTML was not accepted as an extracted source because the product description was absent in that response; its indexed description is supplementary only.
- [Charm City HTA](https://www.charmcitycards.com/2002-bowman-football-jumbo-1760.html): ten packs ×35 cards; Silver /250, Gold /50 and hand-numbered Red Ink programme. The dealer uses “Red Zone” wording; this does not establish an additional family separate from the catalogued Red Ink checklist.
- Selected original scans: 14 image URLs and SHA-256 hashes are preserved in `reviewedImageEvidence`. These cover Reed #138, Allen #197, Saints rookie James Allen #261, Weinke #42, Alex Brown Fabric and David Carr Draft Day Jersey, plus two images catalogued as Uncirculated Carr. The last pair is not an encased-holder proof and is not used to assert a printed serial denominator. Images are research references, not VCS production image assignments.
- [Independent Silver Allen catalogue](https://www.beckett.com/football/2002/bowman-silver/197-jeremy-allen-2542262) and [original-card Silver listing](https://www.ebay.com/itm/820200794625): Minnesota Vikings, /250. Observations retrieved through web search are separately identified in `catalogueObservations`; they are not falsely represented as successfully refreshed origin HTML.
- [Independent Uncirculated Carr catalogue](https://www.beckett.com/football/2002/bowman-uncirculated/250-david-carr-2542444): production 290, but “Ser” attribute conflicts with primary PR wording and lack of visible stamp in the reviewed image. The disagreement is preserved, not silently resolved by inventing /290 stamps.

All output numbers, names, teams, subsets and true RC designations are checked at catalogue level. This is not a physical scan audit of all 1,022 cards. Sources can share upstream information, and exact printing/fulfilment attributes require original evidence where noted below.

## Corrections and important distinctions

1. **Jeremy Allen #197:** primary base and original front/back explicitly show Minnesota Vikings, while primary Gold and Silver incorrectly list Miami. The independent Silver catalogue/listing corroborates Minnesota. Both parallel rows are corrected with a variant note; the raw source errors remain in the evidence snapshot.
2. **Ed Reed #138:** original prints “Edward Reed.” Display Ed Reed consistently; base metadata retains the printed name. This is not a different subject or an extra card.
3. **James Allen:** #49 is the veteran Houston running back; #261 is the New Orleans rookie linebacker. Their identical display names do not justify merging their cards, teams or rookie status. The original #261 front/back confirms the Saints linebacker.
4. **Weinke #42:** the original transposes passing-yards/average column contents. Display only the subject name; preserve the source UER explanation in variant. The source does not separately tag Gold/Silver with UER, so no extra error parallel is invented.
5. **Draft Day codes/material:** the independent table abbreviates H-/J-; primary DDH-/DDJ- is retained. Carr's original back explicitly confirms DDJ-DC. Hats and jerseys occupy separate numbered cards within one collector family; subsets distinguish them. These are draft-event apparel, not assumed game-used material.
6. **Fabric versus Flashback:** Alex Brown's original back explicitly certifies a game-worn Senior Bowl jersey. Flashback Jerseys are catalogued player-worn; “game-used” would overstate that provenance.
7. **Red Ink roster:** all 20 rows are separately retrieved and independently compared. Regular Signs has 19. Daniel Graham SF-DG1 appears only in Red Ink; David Garrard is SF-DG. Do not clone nineteen regular subjects and miss Graham, and do not invent a regular Graham autograph. The catalogue's disambiguating suffix is retained pending an original Graham back.
8. **Rookie status:** all 165 specific base RCs are independently corroborated. Insert/autograph and parallel versions receive no extra RC suffix just because they depict rookies or use blue borders.
9. **Checklist cards:** the two actual checklist inserts have clean `Checklist` subjects, range text in variant, subset Checklist and intentionally empty teams. No artificial NFL/Multiple team is invented. Generator and integration tests exercise this exception.
10. **Uncirculated inventory:** the partial parallel is 110 actual noncontiguous numbers drawn from #111–275. It is neither all 165 rookies nor an assumed #111–220 range. Every actual tuple is independently matched. The CSV records reported production 290 and explicitly declines to assert an unverified physical serial stamp.

## Remaining QA limitations

- **Graham physical code:** SF-DG1 is the matching catalogue identity in both full lists. A back image is still needed to establish whether the final “1” is physically printed or only catalogue disambiguation. No original image was available at the queried primary entry.
- **Red Ink serials:** twelve source entries explicitly carry SN50; eight do not. Preserve the twelve explicit /50 annotations. For the other eight, record the hand-numbered 50 programme but identify the individual stamp as unverified. Do not fill missing serial metadata by copying other subjects.
- **Uncirculated serial/holder:** reported print run290 is supported. Independent serial-attribute wording conflicts with primary PR descriptions. Encased original fronts/backs are needed before calling every card physically numbered /290. The dataset does not claim that.
- **Pack odds/collation:** source tiers and aggregate dealer rates are retained, but verified individual-family aggregate denominators are not available. All ProductSet odds are intentionally null. Pricing, art, fulfilment handling and realistic live pack collation remain blocked pending Admin QA. Null odds are not a claim that the historical pack simulation is complete.

These limitations do not omit known catalogue subjects, but they prevent a claim of fully verified physical manufacturing attributes or release readiness.

## Historical pack configuration

Hobby is 24 ×10; HTA is 10 ×35. The Hobby dealer description reports combined base parallel 1:11, Uncirculated redemption 1:24, autograph 1:70, relic 1:34, overall relic/autograph 1:23. These are **aggregate categories**, not separate Gold/Silver or individual signature/relic family rates. The redemption rate is for a redemption, not the probability of a particular fulfilled rookie.

TCDB preserves differing Hobby/HTA tier rates for Fabric, Flashback Autographs, Flashback Jerseys and Signs. Keep collector checklists intact; do not split families into probability buckets or round a guessed aggregate. No source odds are repeated in card variants, and serial production is not used as an insertion denominator. No pack engine code is changed.

## Reproduction and tests

From `virtual-card-shop`:

```bash
python3 scripts/generate-2002-bowman-football.py --check
python3 scripts/generate-2002-bowman-football.py --refresh-sources --check
node --import tsx --test tests/*.test.ts src/lib/reward-snapshot.test.ts
node --import tsx scripts/test-open-pack-meta.ts
node --import tsx scripts/test-checklist-best-grade.ts
node scripts/test-import-smoke.mjs
node node_modules/eslint/bin/eslint.js scripts/test-2002-bowman-football.mjs
```

Default generation audits the saved source snapshot. Live refresh fetches each distinct URL again, compares every extracted record and checks all 14 saved image hashes. Retrieval failures, changed inventories, wrong namespaces, missing teams outside checklist exceptions and unexpected annotations fail before CSV output. Transient HTTP failures have bounded retries; HTTP-success error/interstitial pages are rejected by extraction/record comparisons. Self-tests cover source-token boundaries and suffix-looking surnames, checklist exceptions, bounded retrieval failures, seventeen corrupt/truncated source cases and four unsafe manifests.

Actual importer integration: use an **empty local disposable PostgreSQL database named `bf02_set_factory_test`**, explicitly supplied as `SET_FACTORY_TEST_DATABASE_URL`, then run `node scripts/test-2002-bowman-football.mjs`. The test rejects remote/nonempty databases and does not use ambient production `DATABASE_URL`. It exercises default dry-run/no writes, malformed unknown-family rejection, actual apply of all 1,022 rows and 11 sets, every CSV field, named RC/team/material/serial/checklist anchors, idempotent rerun, preserved sentinel prices/images and unreleased state. Released manifest input is rejected. Football's importer lacks the baseball-specific missing-team gate, so the generator enforces complete football teams independently and the integration checks every imported team plus the two intentional blanks.

Validation performed: live source refresh/regeneration; generator semantic and failure tests; all 30 repository tests; pack metadata, best-grade and import smoke scripts; targeted ESLint; actual importer integration against isolated in-memory PostgreSQL-compatible PGlite with the current Prisma schema. No production credentials or production database writes.

## GitHub-to-VCS import

Extract only the published immutable commit's manifest and CSV into a temporary directory. Run `npm run import:set-bundle -- <manifest>` for the default dry-run, then the same command with `--apply`. No branch checkout, reset, merge or deployment is required. The importer stages an unreleased Admin draft for pricing/image harvesting and preserves existing prices, images and release state on reruns. The documented QA limitations remain visible after import.
