# 2001 Bowman Baseball — unreleased Set Factory draft

Completed CSV: **1,032 cards across 12 collector families**, ready for Admin pricing and image harvesting. This is regular Bowman, not Bowman Chrome, Heritage, Draft or Bowman's Best. The product remains **unreleased**. No production database access or deployment.

## Complete inventory

| Family | Cards | Hobby denominator |
|---|---:|---:|
| Base | 440 | Base pool |
| Gold | 440 | 1 |
| Rookie Reprints | 25 | 12 |
| Futures Game Jerseys | 34 | 82 |
| Futures Game Jerseys, Bases and Helmets | 18 | 1476 |
| Rookie Reprints Bats | 5 | 1954 |
| 2000 ROY Dual Jersey | 1 | 2202 |
| Autographs | 40 | 74 |
| Rookie Reprints Autographs | 9 | 2467 |
| AutoProofs /25 | 10 | null: conflicting historical rates |
| Futures Game Multiple Relics Autographs | 5 | 18259 |
| Rookie Reprints Bats Autographs | 5 | 18259 |
| **Total** | **1,032** | |

## Evidence and comparison coverage

- [TCDB base checklist](https://www.tcdb.com/Checklist.cfm/sid/1441/2001-Bowman?PageIndex=1), five pages (100/100/100/100/40), plus all five independently retrieved [Gold](https://www.tcdb.com/Checklist.cfm/sid/12604/2001-Bowman-Gold?PageIndex=1) pages. No parallel inventory extrapolation. Each original row, exact URL and source SHA256 hash is preserved in `.source.json`.
- [TCDB related scope](https://www.tcdb.com/Inserts.cfm/sid/1441/2001-Bowman): complete insert namespaces, Gold, three promos, one later Vault proof and two standalone entries. All actual family rosters retrieved, not just totals. The issued ROY dual is retained separately from base; the signed-baseball ticket is excluded.
- [Cardboard Connection](https://www.cardboardconnection.com/2001-bowman-baseball): all 440 base subjects and every insert roster independently compared, with explicit exceptions below. Full rosters resolve misleading headings: signed Rookie Reprints actually has nine rows despite its “5” headline; AutoProof numbering 1–10 is ordinal, not printed.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/2001_Bowman): independent 140 red-format/300 blue-format base rosters, RC annotations, historical odds and serial/print-run descriptions. All 440 subjects compared. Source conflicts are retained explicitly, not erased.
- [MyCardBatch complete tables](https://mycardbatch.com/checklists/bowman-2001-baseball): all **595** number-name-team tuples audited, including the three excluded promos and one excluded Vault card. Its 595 headline is not the product count: it omits 440 Gold cards and the standalone ROY dual. Full Gold subjects/teams match base using limited documented aliases; ROY teams are independently corroborated.
- [Separate TCDB true rookie index](https://www.tcdb.com/Rookies.cfm/sid/1441/2001-Bowman): **both pages**, 100 + four records, reconciled against independent source labels. The second page is necessary; stopping at 100 is incomplete.
- [Distributor's original product listing](https://www.dacardworld.com/sports-cards/2001-bowman-baseball-hobby-box) corroborates Hobby 24 packs/ten cards and most aggregate rates, and exposes the AutoProof rate disagreement.
- Eighteen original card/packaging images inspected and hashed. Exact source URLs and observations are retained; no full scan audit of all 1,032 cards is claimed.

All subjects retain historical teams, including Anaheim Angels, Montreal Expos, Tampa Bay Devil Rays, Brooklyn Dodgers, New York Giants and Boston Braves. All 1,032 rows have real teams; no blank or invented league placeholders. Names are clean, with only verified true base RC suffixes. Reprint origin, print errors, materials and serial attributes live in variant. No set-wide odds are repeated per card.

## Numbering and autograph corrections

**Futures Game jersey codes:** original Corey Patterson back prints **FGR-DCP**, and original Carlos Peña back prints **FGR-CP**. TCDB catalogues them as FGR-CP and FGR-CP2, while BCP repeats CP twice. The output uses the actual printed codes, independently matching CBC. No invented “2” is presented as printed. Full triple-material roster remains MGR-AE etc.; autograph triple codes normalize to **AMGR-AE/BW/CP/EM/JH**, confirmed by the Eric Munson original back.

**AutoProofs:** actual original buyback numbers are `3,33,101,127,175,219,260,272,364,569`; original years and numbers are retained. For example, Chipper Jones is **1991 Bowman #569**, not a fabricated 2001 ordinal #6. All ten have /25 serial metadata. Their cards are signed buybacks, not a new 440-card parallel.

**Forty Bowman Autographs:** TCDB/BCP and the full supplementary roster support forty actual subjects. CBC's extra **BA-KS Kazuhiro Sasaki** has no corroborated issued card in the reviewed sources and is excluded from the verified inventory. This is an evidence-based scope decision, not a claim to have proven no such card could exist. Actual signed Dustin McGowan **BA-DM** front/back were inspected: although originally packed as a redemption, the fulfilled signed card exists and remains in the forty-card checklist. Do not substitute an expired ticket for his actual card.

**Rookie Reprints Autographs:** identifiers are **1–6, 8–10**. #7 does not exist; no filler card is invented. Reported 100 copies each is a **print run, not serial numbering**, corroborated by the original Duke Snider reverse and TCDB PR100 designation. CBC's serial-/100 text is not copied. Actual original reprint references are cross-checked against the parent reprint roster. Signed bat and multiple-material cards do not gain an unsupported /25 or /50 run from secondary marketing text; inspected Minoso bat-autograph front/back show no serial stamp.

## True RC reconciliation and base metadata

There are **104** true base RCs. CBC omits the RC tag on **#283 Andy Van Hekken, #334 Maxim St. Pierre, #397 Jake Peavy and #419 Derrick Van Dusen**. The separate TCDB index and BCP corroborate all four. BCP falsely marks **#180 Nick Neugebauer RC** despite his [2000 Bowman #329 RC](https://www.tcdb.com/ViewCard.cfm/sid/1371/cid/241629/2000-Bowman-329-Nick-Neugebauer); the 2001 card receives no RC suffix. CBC's error-summary paragraph also calls Cabrera RC; he already has 2000 cards and does not receive a new RC here.

Slots #1–140 use `Veterans` and #141–440 `Rookies/Prospects`, reflecting the physical red/blue grouping rather than inferred RC status. **#32 Dan Tosca RC** is the verified exception in the red-format range. Gold, autographs and historical reprints do not inherit base RC suffixes. Alex Gordon's documented Orioles affiliation is retained; do not substitute the later Royals player/team by name alone.

Preserve source-reported uncorrected errors without polluting player fields: Jacobson/Jacobsen #254, Olmedo/Ranier #345, Peavy/Peavey #397 and the false Bowman Rookie marker on Thomas Mitchell #429. CBC additionally reports base #271 Pedro Feliz missing facsimile signature and #382 Adam Dunn incorrect position; these are explicitly marked as source-reported notes, not newly invented corrected variants. Gold's missing error captions do not prove corrected printing and are not used to invent extra cards.

**Cabrera #299:** catalogued subject remains Miguel Cabrera. Sources agree the photos depict someone else, but [PSA's Gold registry](https://www.psacard.com/psasetregistry/baseball/modern-player-sets-1970-present/miguel-cabrera-master-set/composition/7594) identifies Manuel Esquivia while TCDB says Denny Bautista. Output records the photo error without asserting the disputed pictured identity. Resolve the attribution during image QA; do not rename the card or manufacture a second photo variant.

Limited aliases reconcile punctuation/nicknames and actual spelling differences (e.g. Yogi Berra, Duke Snider, Pappy/Ntema Ndungidi, Jim/Jimmy Journell, Bradley/Brad Baker, Timothy/Tim Raines Jr., Pasqual/Pasqual Coco). Raw source strings remain intact. Aliases are explicit; surnames resembling collector tags are never shortened.

## Pack configuration and pending QA

Default **Hobby: 24 packs × ten nominal cards**. HTA Jumbo is 12 packs × 21 nominal cards, a different configuration. Original Hobby/HTA wrappers, retail blaster and boxes were reviewed. Physical HTA wrapper states 20 cards with a single relic and 17 with multiple relics; VCS's fixed count does not reproduce material-dependent pack reductions. An HTA box sticker advertises an autographed box loader; no distinct bounded additional checklist is established, so none is fabricated and HTA collation is not claimed complete.

Gold is identified by **gold-foil facsimile signature**, not a real autograph. Its one-per-pack rate maps to denominator **1**; the current non-base hit loop guarantees that pool and replaces base slots for hits. Historical tier rates within the complete Futures jersey and multiple-relic checklists are flattened under existing collector-checklist conventions; aggregate denominators 82 and 1476 are published, not inferred from card counts. Do not split those collector families solely to reproduce tiers.

**AutoProof Hobby odds remain null:** BCP says **1:18,239**; CBC and the distributor say **1:18,259**. The reviewed wrapper reverse is too small to settle the discrepancy. No arbitrary choice or rounded rate is asserted. Pricing/image harvesting can proceed with the complete ten-card family; release requires legible primary odds evidence or an explicit approved model decision.

Exclude three dealer/media pre-production cards PP1–PP3, later Topps Vault blank-back proof, the expired Sean Burroughs signed-**baseball** redemption ticket, and unverified extra BA-KS. No Chrome, Heritage, Draft, refractor or separate hologram family is added. The actually issued **ROY-R Kazuhiro Sasaki / Rafael Furcal** dual jersey remains, with Seattle/Atlanta affiliations.

`DRAFT`, `released: false`, `BLOCKED_PENDING_QA` remain. Release requires pack/collation QA, the AutoProof odds decision, image QA and pricing. Review metadata does not replace the actual unreleased flag.

## Validation and reproduction

Executed generator and byte-for-byte CSV regeneration. Full live source revalidation compares complete rosters, namespaces, teams, reconciled RC inventories, original references and scope; original image hashes checked. Bounded source errors fail closed before any CSV write. Tests reject eighteen corrupt source cases and three unsafe manifest cases; whole-token surname cleanup and the checklist-team exception are tested.

Actual `import-set-bundle.ts` tested against an **empty disposable local PGlite PostgreSQL-compatible server**: dry-run writes nothing, missing-team gate rejects before writes, actual apply creates one unreleased product/12 sets/1,032 cards, every stored CSV field compared, rerun inserts zero duplicates and preserves sentinel prices/images, released manifest rejected. All 30 repository tests, open-pack metadata, checklist best-grade, importer smoke and targeted ESLint passed.

```bash
python3 scripts/generate-2001-bowman-baseball.py --check
python3 scripts/generate-2001-bowman-baseball.py --refresh-sources --check
```

Integration test requires an empty **local** PostgreSQL database named `bm01_set_factory_test`, with no fallback to shell `DATABASE_URL`:

```bash
SET_FACTORY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/bm01_set_factory_test' node scripts/test-2001-bowman-baseball.mjs
```

Use `npm run import:set-bundle -- <bundle>` for dry-run; append `--apply` to import the unreleased Admin draft. The completed CSV, source snapshot, bundle, generator, test and research note are committed together.
