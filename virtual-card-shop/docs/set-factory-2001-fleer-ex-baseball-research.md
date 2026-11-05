# 2001 Fleer E-X Baseball draft audit

Research date: 2026-11-05. Product: `2001_Fleer_EX_Baseball`.
The delivered CSV contains 426 explicit cards from the original E-X product,
not an unexecuted generator or count-only placeholder. Product remains an
unreleased draft for pricing and image harvesting. One serial-run discrepancy
is unresolved and explicitly flagged; this is not a release-cleared product.

## Inventory and product scope

| Family | Cards | Hobby denominator stored |
| --- | ---: | --- |
| Base | 130 | Base |
| Essential Credentials | 130 | Unknown |
| Autographed Rookies/Prospects | 29 | Unknown |
| Behind the Numbers Game Jersey | 44 | 33 |
| Behind the Numbers Game Jersey Autograph | 42 | Unknown |
| Wall of Fame | 30 | 24 |
| E-Xtra Innings | 10 | Null: retail-only |
| Derek Jeter Monumental Moments | 1 | Unknown |
| Derek Jeter Monumental Moments Autographed | 1 | Unknown |
| Derek Jeter Base Inks | 1 | Unknown |
| Fleer Season Pass | 6 | Unknown |
| Physical Checklists | 2 | Unknown |
| **Total** | **426** | |

[TCDB's original issue](https://www.tcdb.com/Checklist.cfm/sid/1455/2001-Fleer-E-X?PageIndex=1)
contains 130 plastic-stock base cards. The ten paper-stock /499 cards #131–140
were distributed later in Fleer Platinum Rookie Collection packs, not original
E-X packs. TCDB separates them into
[the Platinum E-X Update namespace](https://www.tcdb.com/Checklist.cfm/sid/324240/2001-Fleer-Platinum-2001-Fleer-E-X-Update).
The combined [BCP checklist](https://baseballcardpedia.com/index.php/2001_E-X)
contains 140; the generator audits all 140 identities and rookie designations
against the original and separately retrieved update records, then excludes
the ten Platinum-issued cards from this product. This includes Albert Pujols
#131: his absence is a documented distribution boundary, not missing research.
No 131–140 Essential Credentials were extrapolated.

Both full original 130-card collector families remain intact. The base
Rookies/Prospects #101–130 and Essential Credentials Now #1–100 /299 vs Future
#101–130 /29 are subset metadata, not separate completion lists.

## Verification evidence

The committed source JSON has 27 normalized source sections with exact URLs and
SHA-256 hashes, including all independently retrieved family namespaces,
separate rookie index, combined BCP base list, full product-specific insert
lists, cross-product promotion matrices, supplemental team tables, insertion
ratios and excluded Platinum extension. It also records 23 selected card and
package image URLs/hashes. All 23 were visually reviewed. This is selected
scan evidence, not a claim that all 426 cards were inspected individually.

- All 130 base names/numbers match BCP, with limited punctuation and David/Dave
  Justice normalization. [Supplementary base/autograph tables](https://mycardbatch.com/checklists/fleer-e-x-2001-baseball)
  independently match every number/name/team tuple in the 130 base cards and
  29 prospect autographs. Only the first two complete tables are used; that
  site's one-row insert previews are not mistaken for complete insert lists.
- The full 130-card parallel was fetched separately from its own namespace
  [12771](https://www.tcdb.com/Checklist.cfm/sid/12771/2001-Fleer-E-X-Essential-Credentials?PageIndex=1),
  checked against base identities/teams, and its /299 and /29 attributes checked
  against the independent product description and normalized ratio table.
- Independent rosters agree for all 44 jerseys, 42 signed jerseys, 30 Wall of
  Fame and ten E-Xtra Innings. Mays and Ted Williams are unsigned-only jersey
  subjects; no autograph versions were invented.
- The separate [rookie index](https://www.tcdb.com/Rookies.cfm/sid/1455/2001-Fleer-E-X)
  agrees with base and BCP on four true original-issue RCs: #105 Ichiro Suzuki,
  #109 Esix Snead, #115 Elpidio Guzman and #117 Winston Abreu. BCP's RC* denotes
  a player who did not reach MLB; it does not cancel the catalogue's Guzman RC.
  No RC suffixes are inferred from “Prospects” or added to parallels/autographs.

## Serial pools, allocations and corrected errors

The 29 signed prospect portions share the serial-numbered pool with their
unsigned counterparts. Ichiro #105 has no signed portion. A published signed
or unsigned quantity is distinct from the printed serial denominator. For
example, Jason Hart cards are numbered /1999; the reported allocations are
250 signed and 1749 unsigned. The generator checks every signed allocation
against BCP and verifies signed plus unsigned equals the serial denominator
for all 29 pairs. Brian Cole is 2000 signed plus 999 unsigned, not an assumed
maximum of 1500 copied from the abbreviated insert-index description.

Selected original card backs resolve three BCP serial errors:

| Card | BCP listing | Scan-confirmed printed denominator |
| --- | ---: | ---: |
| #109 Esix Snead | 2499 | 1999 |
| #121 Jason Tyner | 2499 | 2999 |
| #129 Nate Rolison | 2499 | 2999 |

These are guarded, number-specific corrections. The source snapshot retains
the unaltered BCP rows so the conflict stays visible and refreshes detect changes.

**Unresolved:** Rollie Fingers Behind the Numbers jersey autograph is catalogued
by [TCDB as /34](https://www.tcdb.com/Checklist.cfm/sid/12770/2001-Fleer-E-X-Behind-the-Numbers-Game-Jersey-Autograph)
but [BCP lists /24](https://baseballcardpedia.com/index.php/2001_E-X#Autographed).
No actual signed-card serial scan was located. The row's variant explicitly
states both conflicting values and that verification is pending; it does not
claim a confirmed /34 or /24. Manifest `printRuns` remains
`PENDING_ROLLIE_FINGERS_JERSEY_AUTOGRAPH`. All other signed-jersey listed
denominators agree across these two catalogues. Roster inclusion is separate
from resolution of this one attribute.

## Cross-product promotions and physical attributes

The [dedicated five-brand Jeter program](https://baseballcardpedia.com/index.php/2001_Fleer_Derek_Jeter_Monumental_Moments)
identifies the E-X issues as #2 MM /1996, the unnumbered autograph /96 and
Base Inks published quantity 500. Reviewed card backs confirm /1996 and /96;
the generic product ratio summary's 2000/100 belongs to other issues and is
not used for E-X. Base Inks front/back confirms an autograph and game-used
base piece. Published 500 does not establish a printed /500 serial number.

The [30-player cross-product Season Pass matrix](https://baseballcardpedia.com/index.php/2001_Fleer_Season_Pass)
assigns six subjects to E-X: Randy Johnson, Greg Maddux, Magglio Ordonez,
Cal Ripken Jr., Scott Rolen and Nolan Ryan. Only these six are imported.
These physical exchange cards had a historical December 1, 2001 expiration;
no active redemption entitlement is simulated. PR1 is a published quantity,
not evidence that a printed “1/1” appears on each card.

Wall of Fame features Milwaukee County Stadium outfield-wall pieces, not
player jerseys or bats. Reviewed Yount back confirms an authentic outfield
wall piece. Behind the Numbers is game-worn jersey material; the reviewed
Grace back identifies the Chicago Cubs, despite his base card depicting
Arizona. Ben Grieve jerseys retain Oakland rather than copying his Tampa
Bay base affiliation. Retired-player teams remain their card franchises.
Autograph/jersey/retired affiliations are catalogue-based except where scans
were specifically reviewed; no scan-by-scan team claim is made.

Both sides of both physical checklists were reviewed: #1–121 and #122–130
plus inserts. TCDB incorrectly labels the second range #122–140. The actual
scan lists base #122–130 before the inserts, so its CSV variant uses the
scan-confirmed range and explicitly records the catalogue correction. The
unaltered source label remains in provenance. No physical checklist evidence
establishes original-pack distribution of the later Platinum cards.

Printed `1XI`–`10XI` and `2 MM` identifiers are retained. Unnumbered player
cards get stable `NNO-NAME-SLUG` local keys; generic checklists use `NNO-A/B`.
These are VCS identifiers, not invented printed numbers. Names remain clean;
AU/MEM/SN/PR/RDM and long annotations go in variant/subset. Only the two
generic checklist cards intentionally lack franchises.

## Pack configuration and release gate

Original Hobby box photograph confirms 24 packs of five cards. Retail box
photograph shows seven packs plus one bonus, three cards per pack; wrapper
also confirms retail three-card configuration. BCP's normalized distribution
and ratio records are checked during regeneration. Hobby Wall of Fame 1:24
and Behind the Numbers 1:33 are the only numeric denominators stored.
All other unverified rates remain null. E-Xtra Innings is retail-exclusive
at 1:20 and therefore has null odds in this Hobby model.

Historical box expectations do not justify invented autograph rates or
guarantees. VCS independent insert rolls replace base slots and uniform
within-family selection flattens prospect scarcity and print-run differences.
Unknown odds, collation, the Fingers serial run, pricing and images require
QA before release. Rates live only on ProductSets, not per-card variants.
No unrelated year, basketball/football issue, standalone hologram or extra
bat/jersey family was inferred from card design.

Product starts with `released: false`, auto pack pricing, zero initial pack
price and null images. No production database was queried or modified and
no deployment was performed.

## Completed tests

- Generated the actual 426-row CSV, compared exact regeneration bytes, and
  audited unique collector identities, names, teams, subset ranges, RCs,
  shared serial allocations, cross-product scope and metadata formatting.
- Re-fetched every source using `--refresh-sources --check` and checked every
  reviewed scan hash. Retrieval retries transient failures with bounded
  attempts; linked rows and namespaces parse strictly and failures write no
  partial checklist.
- Whole-token name cleanup/caption separation tests, 20 source corruption
  cases and three manifest safety cases. Missing/duplicate rows, incorrect
  names/teams/RCs/odds/serial allocations, invented Ichiro autograph, cross-brand
  Jeter numbering, wrong namespaces and omitted scope evidence all reject.
- Actual repository importer dry-run/apply in an empty disposable local
  PGlite PostgreSQL-compatible database using the real Prisma schema. All
  426 imported rows checked field-by-field; 12 families, four RCs, two generic
  team blanks and the unresolved-run flag confirmed. Rerun adds no duplicates
  and preserves sentinel prices/images and unreleased state. Missing-team and
  released-manifest inputs reject. No external database credentials used.
- All 30 repository unit tests passed, plus pack metadata, checklist best-grade,
  import smoke checks and ESLint on the new integration test.

Reproduce checklist validation:

```bash
python3 scripts/generate-2001-fleer-ex-baseball.py --check
python3 scripts/generate-2001-fleer-ex-baseball.py --refresh-sources --check
```

Integration test: `node scripts/test-2001-fleer-ex-baseball.mjs`, with an empty
local database named `ex01_set_factory_test` supplied through
`SET_FACTORY_TEST_DATABASE_URL`. The test refuses remote hosts, another
database name or existing products/cards. It disconnects its assertion client
before each importer subprocess to support single-connection local servers.
