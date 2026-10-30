# 1985 Donruss Baseball — verified Set Factory draft

## Scope and sources

- TCDB checklist sid 100, pages 1-7: card numbers, subjects, teams, explicit RC tags and variation notes.
- https://www.tcdb.com/Checklist.cfm/sid/100/1985-Donruss
- https://baseballcardpedia.com/index.php/1985_Donruss
- https://www.dacardworld.com/vintage/1985-donruss-baseball-wax-box

660 base cards: 1-653 plus seven checklist cards (CL-DK and CL1-CL6).
Diamond Kings 1-26 and Rated Rookies 27-46 remain in the complete base set.
Wax format: 15 cards, 36 packs per box. Lou Gehrig puzzle panels accompany wax
packs but are not extra baseball cards; #635 Lou Gehrig is retained in base.
Oversized wrapper-redemption Super Diamond Kings and box-bottom packaging cards
are excluded. Leaf, All-Stars and Highlights are separate products.

## Canonicalization

TCDB lists 665 rows including five additional variations. Collapse those to 660
collector checklist positions, preferring b states. Corrected Tom Seaver #424
and Terry Pendleton #534 are used. #74 uses three-line biography; #640 uses
four-line biography; #651 uses white lettering. Do not claim print-state scarcity
or label neutral VAR states as corrections. Preserve notes in variant metadata.

Checklist identifiers disambiguate their overlapping printed numbers. The seven
checklist cards intentionally have blank teams; all 653 other cards have teams.
Subjects remain clean; collector/source annotations are metadata. #651 displays
Don Mattingly / Dave Winfield with Two For The Title in subset, neither marked RC.
RC labels follow explicit TCDB designations, not Rated Rookie membership alone.

## Verification

- Generator and --self-test: PASS, 660 unique positions and all required teams.
- Complete 1-653 numeric coverage independently matched BaseballCardPedia.
- Name differences reviewed: nickname/full-name differences, #201 Jeff Robinson
  versus Jeff D. Robinson, #207 Mike Brown versus Mike C. Brown, and #393 Bob Gibson
  versus Bob L. Gibson. TCDB names retained. Secondary source incorrectly lists
  #509 Charlie Haag; TCDB's Atlee Hammaker retained. Pankovits is the canonical
  subject spelling; printed Pankovitz error retained as metadata.
- Key RC checks: Gooden #190, Saberhagen #222, Clemens #273, Eric Davis #325,
  Puckett #438, Hershiser #581.
- Strict whole-token parsing tests preserve suffix-looking surnames.
- Importer accepted schema/CSV/team validation, then stopped at first database
  read because this workspace lacks DATABASE_URL. Database dry run and apply
  have not completed.

Product remains unreleased, with pricing and images pending and release blocked.
The checked-in source snapshot makes generation reproducible without live scraping.
