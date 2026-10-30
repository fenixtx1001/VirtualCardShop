# 1994 Fleer Baseball — completed Set Factory audit

940 standard-size cards across 14 ProductSets. Complete checklist, unreleased draft; ready for Admin pricing and image harvesting after import.

## Verified scope

| Checklist | Cards | Collector numbers | VCS odds per pack |
| --- | ---: | --- | ---: |
| Base | 720 | 1–720 | Base pool |
| All-Stars | 50 | 1–50 | 2 |
| Award Winners | 6 | 1–6 | 37 |
| Golden Moments | 10 | 1–10 | null, retail-jumbo-only |
| League Leaders | 12 | 1–12 | 17 |
| Lumber Company | 10 | 1–10 | null, hobby-jumbo-only |
| Major League Prospects | 35 | 1–35 | 6 |
| Pro-Visions | 9 | 1–9 | 12 |
| Rookie Sensations | 20 | 1–20 | null, hobby-jumbo-only |
| Smoke 'N Heat | 12 | 1–12 | 30 |
| Team Leaders | 28 | 1–28 | 6 |
| Tim Salmon: A.L. Rookie of the Year | 15 | 1–15 | 30, collector-completion abstraction below |
| Tim Salmon Autographs | 12 | 1–12 | null, unknown historical insertion ratio |
| All-Rookie Team Redemption | 1 | NNO | 200 |
| **Total** | **940** | | |

Keep the full 720-card base collector checklist together: 705 ordinary player cards, eight Superstar Specials (#706–713), seven checklists (#714–720). There is no verified base parallel family to generate.

The numbered Tim Salmon collector set is **15 cards**, not 12. Historically #1–12 were in packs, #13–15 obtained by a wrapper mail-in offer. In line with Set Factory's complete-collector-checklist convention, retain all 15 in one ProductSet and explicitly flatten availability. Family odds remain 1:30; #13–15 carry their historical mail-in distinction in variant. Their VCS pull eligibility is an intentional collector-completion abstraction, not a claim about original foil packs.

The autograph issue is a separate **12-card** checklist. Fleer signed **2,000 cards total across the issue**, not 2,000 of every number. Do not fabricate SN2000, per-card PR2000 or autograph odds. Cards carry an embossed Fleer Mark of Authenticity; that distinction is retained in variant.

Reviewed/excluded: oversized Golden Moments 3x5 (ten case/retail premiums, serial numbered /10000), separate returned All-Rookie Team M1–M9 mail-in set, Tim Salmon promotional sample and promotional sheet, separate Fleer Update, Sunoco and Ultra releases. Include the genuine physical All-Rookie exchange token, not an invented returned-set hit or automated redemption mechanic. These exclusions explain why an all-material catalog count may exceed 940.

## Evidence and source audit

- [TCDB base checklist, sid 342](https://www.tcdb.com/Checklist.cfm/sid/342/1994-Fleer): eight pages, 720 exact card IDs; no fabricated or missing numbers.
- [TCDB rookie index](https://www.tcdb.com/Rookies.cfm/sid/342/1994-Fleer): nine explicit RC identities; page two empty. Every RC name/team/number agrees with the base checklist.
- [TCDB insert index](https://www.tcdb.com/Inserts.cfm/sid/342/1994-Fleer): all insert, mail-in, oversized and promotional categories reviewed.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/1994_Fleer): independently compared all 720 base identities and every listed standard insert identity/number, plus distribution and autograph issue history. It does not enumerate all twelve autograph numbers; those exact numbers are verified directly in TCDB's dedicated autograph checklist, while BCP independently verifies the autograph program/subject/total print run.
- [Beckett product listing](https://www.beckett.com/baseball/1994/fleer/): published set information describes 720 standard-size cards and nine RCs. Its catalog header reports 721 while its published set description states 720; the reason for that catalog-summary discrepancy is not established. TCDB, BCP and the complete printed-number coverage agree on 720. Do not invent an additional numbered card from the summary discrepancy. Beckett's full live page currently redirects to maintenance; generation does not depend on it or bypass that failure.
- [Keyman checklist](https://keymancollectibles.com/baseballcards/fleer/1994fleerbaseballcardchecklist.htm): corroborates the late-number RCs and Superstar Specials. No invented data is used to fill unavailable source text.

Dedicated TCDB source IDs are recorded on every ProductSet: 344 All-Stars; 345 Award Winners; 346 Golden Moments; 347 League Leaders; 348 Lumber Company; 349 Major League Prospects; 350 Pro-Visions; 351 Rookie Sensations; 352 Smoke 'N Heat; 353 Team Leaders; 354 Tim Salmon; 307796 Salmon Autographs; 274464 All-Rookie Redemption.

The committed `.source.json` stores normalized retrieved source records, source URLs, retrieval date in UTC and SHA-256 hashes of the raw HTML. The generator operates offline by default and supports a full live refresh. Output is only written after all sources and validations pass; partial or changed data fails closed.

### Resolved details

- **Nine true RCs:** #62 Phil Leftwich, #289 Brad Holman, #297 Erik Plantenberg, #299 Brian Turang, #415 Larry Luebbers, #430 Jerry Spradlin, #544 Brian Looney, #617 Mark Petkovsek, #669 Pedro Martinez. BCP omits RC on #62; TCDB's base and separately retrieved rookie index explicitly confirm it. Its other eight RC labels match. Manny Ramirez #119 is not a true RC; neither rookie-themed inserts nor awards get automatic RC suffixes. Alex Rodriguez is in the separate Fleer Update product.
- **Names/identity:** distinguish Boston's Greg A. Harris #34 from Colorado's Greg W. Harris #442 using independently published full collector names. Expand TCDB's shortened J. Owens #448 to BCP's Jayhawk Owens. Gene/Geno Petralli, Dave/David Justice and West, Danny/Dan Miceli, Bill/Billy Swift and punctuation differences are explicitly reviewed comparison aliases, not fuzzy matches.
- **Pedro Martinez:** #515 is the Dodgers pitcher; #669 RC is the Padres pitcher. Keep TCDB's printed subject labels and teams, and put the identity distinction on #669 in variant. BCP's Pedro A. Martinez label is recognized only as an independent comparison alias. Do not attach a Hall of Fame Pedro rookie image to the Padres card.
- **Multi-player cards:** compare actual people independently of ordering; retain all source team affiliations. #709's Whitaker/Trammell ordering differs between sources but depicts the same two people. Golden Moments #10 has Bosio / Abbott / Kile and Seattle / New York Yankees / Houston teams.
- **Subsets and captions:** eight Superstar Specials have the proper subset; titles such as Brave New World, American Heat and Twin Peaks remain variant metadata. Checklist ranges go in variant, not player. Source UER notes remain metadata, including Bret Boone's printed first-name error and other verified errors.
- **League Leaders #11 Tom Glavine:** the printed number is missing; collector checklists place it at 11 of 12. Keep collector ID 11 and preserve the UER/missing-number note. It is not an additional thirteenth NNO card.
- **Source-filter hazard:** TCDB BasicID is set-specific. Reusing 1991 Upper Deck's BasicID=17 can return Upper Deck rows under a Fleer page header. The bad retrieval was rejected by identity comparison and replaced with the correct unfiltered Fleer pages. New live retrieval checks every parsed row's linked card-set namespace against the requested sid, so a matching title alone cannot pass. An explicit negative test covers this.

## Team validation

All ordinary player teams and multi-player/team-checklist affiliations come from source rows and must be among the 28 historical 1994 franchises. Do not infer teams from current affiliations or invent MLB/Multiple as filler.

There are exactly **two blank-team cards**:

1. Base #720, the inserts checklist; allowed by the importer checklist exception.
2. NNO All-Rookie Team Exchange Card, a generic physical token with no represented franchise.

Base checklists #714–719 retain their source-listed teams; they are not arbitrarily blanked. `review.teamData=PENDING` and `--allow-pending-teams` stage only the intentional generic exchange token. No unresolved player/team lookup is hidden by that flag. Any blank ordinary player team fails the generator.

## Pack implementation review

Reviewed `docs/set-factory.md`, `docs/set-factory-generator-conventions.md`, `scripts/import-set-bundle.ts`, `scripts/import-set-bundle-entry.ts`, `src/app/api/rip/open/route.ts` and `src/lib/pack-pricing.ts`.

- Product models standard 15-card foil packs and 36-pack boxes. No production pack-engine change is included.
- Physical hobby jumbo was 21 cards; retail blue-wrapper jumbo was 23 cards. Golden Moments was one per blue-wrapper retail jumbo, Lumber Company 1:5 hobby jumbo, Rookie Sensations 1:4 hobby jumbo. A standard-product combined-channel share is not published. Leave these families' odds null rather than invent a pack-size conversion or market share. Their checklists import for pricing and image harvesting but they cannot be pulled until Admin configures odds.
- For standard foil families, retain published source insertion ratios. Current VCS rolls each non-base family independently and replaces base slots with hits. This cannot reproduce original guaranteed one-insert-per-pack collation: zero or multiple hits can occur. Published rounded ratios also do not form an exact probability partition. Document and keep pack/release QA pending; do not merge genuine collector checklists to fabricate a guaranteed slot.
- All-Stars has a verified standard-foil 1:2 ratio. Other common insert ratios and the redemption's 1:200 are retained as ProductSet values. Do not repeat set-wide odds in card variants.
- Salmon autograph odds are unknown. An aggregate print run does not establish pack insertion odds. No automatic exchange/redeeming behavior is implemented.
- All new Product rows start `released=false`; reruns preserve existing release state, pricing and images. Product remains blocked for release pending pricing, card/pack images, unknown/channel odds and pack-collation review. No production database import or release was performed here.

## Validation completed

```bash
python3 scripts/generate-1994-fleer-baseball.py --refresh-sources
python3 scripts/generate-1994-fleer-baseball.py --self-test
python3 scripts/generate-1994-fleer-baseball.py --check
node --import tsx --test tests/*.test.ts src/lib/reward-snapshot.test.ts
node --import tsx scripts/test-open-pack-meta.ts
node --import tsx scripts/test-checklist-best-grade.ts
node --import tsx scripts/test-import-smoke.mjs
node node_modules/eslint/bin/eslint.js scripts/test-1994-fleer-baseball.mjs
git diff --check
```

Generator checks include the complete 940 rows/14 sets, all IDs, full source comparisons, nine true RCs, all subsets and source teams, clean token boundaries, wrong-source namespace rejection and seven corruption tests (missing row, wrong player, wrong known team, missing team, false RC, missing insert and false autograph serial numbering). `--check` compares the committed CSV byte-for-byte with validated generation. Existing unit suite: **30 passed, zero failures**; additional smoke/regression scripts passed.

### Real importer integration

The actual Prisma importer was run on an isolated in-memory PostgreSQL instance (PGlite 0.5.13 + pglite-socket 0.2.16), initialized from SQL generated from the repository's full Prisma schema. No mocked Prisma client or production database URL was used. Temporary test dependencies live outside the repository; application dependencies are unchanged.

`scripts/test-1994-fleer-baseball.mjs` requires explicit `SET_FACTORY_TEST_DATABASE_URL`, localhost, database name `fleer94_set_factory_test`, and initially empty Product/Card tables. It never chooses the shell's production DATABASE_URL.

Passed: no-write dry-run; rejection of apply without intentional pending-team override; successful apply creating 1 unreleased Product, 14 ProductSets and all 940 Cards; exact set counts/kinds/odds, nine RCs, two deliberate blank teams, metadata anchors and multi-player teams; all 12 autograph entries without fabricated serial numbering; rerun inserts zero and updates 940; prices, art, book values and front/back URLs preserved; released stays false; released=true input rejected.

For a disposable local PostgreSQL database initialized from `prisma/schema.prisma`:

```bash
SET_FACTORY_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/fleer94_set_factory_test?connection_limit=1' \
  node scripts/test-1994-fleer-baseball.mjs
```

This execution environment blocks tsx CLI's Unix IPC socket, so tests use the equivalent `node --import tsx scripts/import-set-bundle.ts` runtime. The normal Codespaces npm wrapper invokes the same importer and flags. No application code changes are needed for the final import.
