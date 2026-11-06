# 2001 Topps Heritage Baseball — unreleased Set Factory draft

Completed inventory: **773 actual cards in 15 collector families**, including both low-number back colors, complete signed autograph inventories, the unnumbered Mays replacement and box-only AutoProof. Ready for Admin pricing/image harvesting; **not release-ready**. No production database was accessed and nothing was deployed.

## Inventory and Hobby odds

| Family | Actual cards | Draft odds denominator |
|---|---:|---:|
| Base, including 80 additional back-color variants | 487 | Base pool |
| Separate checklist cards | 2 | null |
| Chrome /552 | 110 | 25 |
| Classic Renditions | 10 | 5 |
| New Age Performers | 15 | 8 |
| Then and Now | 10 | 8 |
| Blue-ink Autographs | 50 | 142 |
| Red-ink Autographs: 50 numbered + Mays replacement | 51 | null |
| Classic Renditions Autographs /25 | 3 | 19710 |
| Clubhouse Collection Relics | 12 | null |
| Clubhouse Collection Dual Relics /52 | 6 | null |
| Clubhouse Collection Autograph Relics /25 | 4 | null |
| Grandstand Glory | 7 | 211 |
| Time Capsule: four singles + dual /52 | 5 | null |
| Willie Mays #261 AutoProof /25 | 1 | null; box-only |
| **Total** | **773** | |

Unknown/unsupported odds are null, not invented. Each row is an actual completed CSV entry with validated identity, subject, team, subset and variant.

## Sources and complete comparisons

- [TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1498/2001-Topps-Heritage?PageIndex=1), all five pages (100/100/100/100/87); [related sets](https://www.tcdb.com/Inserts.cfm/sid/1498/2001-Topps-Heritage) establishes 15 related namespaces including three excluded promos. All individual insert lists fetched; Chrome's second ten-card page included. Raw labels, notes, full normalized rosters, exact URLs and source SHA256 hashes retained in `.source.json`.
- [Cardboard Connection](https://www.cardboardconnection.com/2001-topps-heritage-baseball-cards): complete independent 407-subject base roster, RC labels, Chrome roster, conventional inserts, 50 completed blue signatures plus unsigned Mathews exchange, six dual relics, four autograph relic subjects and Time Capsule. Every listed identity compared, rather than accepting headlines alone.
- [MyCardBatch complete tables](https://mycardbatch.com/checklists/topps-heritage-2001-baseball): all 776 listed number-name-team tuples checked, including 487 expanded base rows, 49 blue signatures, 52 red entries and three excluded promos. Its blue table **omits Matt Lawton**, likely due to the duplicate printed THA-ML; complete TCDB and CBC rosters independently cover him. No fake supplementary row is supplied. Its Vernon Law label includes an autograph/original-card caption; that caption is parsed separately from the subject.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/2001_Topps_Heritage): historical pack rates and serial runs, back anomalies, full intended signer list and descriptions. Known errors retained transparently: base omits #12 and repeats #63; dual roster omits two cards; odds table says 20 bats while its actual list/CBC/TCDB contain ten bats plus two jerseys. Intended 52 signer counts do not mean 52 signed subjects exist.
- [Separate true RC index](https://www.tcdb.com/Rookies.cfm/sid/1498/2001-Topps-Heritage) corroborates all 22 base rookie number/name/team tuples against the complete independent CBC roster.
- [PSA original reporting](https://www.psacard.com/articles/articleview/6510/psa-set-registry-2001-topps-heritage-real-one-autographs-modern-twist-vintage-classic) corroborates 50 completed signatures per ink color, unfulfilled Mathews/Doby promises and the actual unnumbered Mays replacement.
- [Original packaging](https://www.tcdb.com/Packaging.cfm/sid/1498/2001-Topps-Heritage): inspected wrapper, Hobby box, retail blaster and sealed box. Hobby box explicitly says **24 packs/eight cards**; wrapper confirms eight plus gum. Gum is not an inventory card.

Direct Beckett retrieval returned 404; its indexed 489 headline was not used to pad the base. TCDB/CBC establish 407 subjects, 80 extra back variants and two separately catalogued checklist cards. The draft models those as 487 base rows plus a separate two-card family. A conventional 407-subject set accepts either back color; this draft explicitly catalogs both for VCS completion and harvesting.

## Numbering, names and metadata decisions

Base #1–80 have red/black backs, represented by local suffixes **A/B**, which are not printed. #41 both backs preserve the Buehrle/Buerhle printing error in variant; names remain clean. #31A preserves TCDB's SP designation as a source note without inferring additional scarcity. Ten middle-series cards are black-back only: `103,159,171,176,179,188,201,212,224,241`. High-number subset #311–407 remains in the same complete base family (97 subjects); no range-only ProductSets.

Exactly 22 base true RCs:

`89,93,95,111,119,154,172,174,198,225,229,246,250,252,264,266,290,293,297,302,306,326`.

No Ichiro or Pujols is in this product. Chrome copies and marketed rookie/prospect status do not confer extra RC suffixes. Punctuation and documented aliases such as Lou/Luis Montanez, Bob/Robert Keppel, Minnie/Orestes Minoso, Vern/Vernon Law and missing Jr. forms are comparison normalizations; original source strings remain intact.

Mike Lamb and Matt Lawton both have printed **THA-ML** blue autographs. Use local **THA-ML2** for Lawton, matching independent catalogue practice, and record that 2 is not printed. Red Mays numbered card uses local **THA-WMA** to distinguish the unnumbered **THA-WM** replacement; A is not printed. Then and Now TCDB spaces (`TH 1`) normalize to conventional `TH1`.

**Autograph relic numbering:** CBC/BCP use extra-A catalogue forms such as THCC-ADS. The original Duke Snider /25 card back linked by BCP/COMC clearly prints **THCC-DS**. Retain the TCDB printed-code family `THCC-DS/MM/RS/WM`, distinguishing autograph relics by their ProductSet. Do not add four duplicate cards for alternative catalogue aliases. Exact inspected front/back URLs and hashes retained.

**Joe Garagiola team discrepancy:** red TCDB/supplementary list says St. Louis; blue source says Pittsburgh. Original blue and red backs explicitly identify **Pittsburgh Pirates**, although both fronts carry a Cardinals logo and Pirates cap. Use the explicit back team for both, with the red source correction and front-logo discrepancy recorded. This is not a general rule to substitute career teams or present-day franchises.

Historical teams remain New York Giants, Brooklyn Dodgers, Boston/Milwaukee Braves, Philadelphia Athletics and Washington Senators where listed. Multi-player affiliations preserve actual franchises, including shared-team duals. The two generic loose checklists alone have blank teams, intentionally following the importer exception; their ranges belong in variant.

Grandstand Glory contains stadium-seat material, not player-worn gear. Time Capsule uses Korean War-era uniform material **not worn by the featured players**. Blue signatures have reported 200-card print runs but are **not serial numbered**. Red signatures are /52 except the explicitly unnumbered Mays replacement. Single/dual/autograph bats and jerseys retain their actual material and serial metadata.

## Excluded issues and non-pack inclusions

Exclude dealer/media pre-production promos PP1–PP3, generic original-1952-card/apparel exchange tickets and unsigned Mathews/Doby paper autograph promises. Do not invent their signatures. Mathews' real bat relic remains legitimate; an unsigned autograph promise does not invalidate his issued relic card.

Retain the **actual unnumbered Mays replacement** in the full Red Ink collector family for pricing/harvesting, clearly marked as replacement rather than a /52 pack card. Retain the **actual signed 1952 Mays #261 buyback /25** as a separate AutoProof family, box-only. Do not invent a 407-card buyback family, Chrome refractors or a separate hologram family.

## Pack model and release blockers

Verified representable Hobby denominators are in the bundle's ProductSets only. Original base high numbers are 1:2; low numbers are less plentiful, with roughly equal red/black backs. The VCS base pool flattens this historical range scarcity under current conventions. No set odds clutter per-card variants.

Preserve complete collector families where internal material rates differ:

| Physical family portion | Hobby odds |
|---|---|
| Clubhouse single bats / jerseys | 1:590 / 1:798 |
| Clubhouse dual bats / dual jersey | 1:5701 / 1:28744 |
| Clubhouse autograph bats / jersey | 1:19710 / 1:62714 |
| Time Capsule singles / dual | 1:369 / 1:28744 |
| Numbered Red Ink pack issues | 1:545 |
| Mays AutoProof | 1:5749 **boxes**, not packs |

Mixed-family odds remain null instead of assigning an arbitrary aggregate or splitting collector checklists solely for odds. Red Ink also stays null because it includes the non-pack replacement; the engine currently cannot filter that member within the family. AutoProof stays null because a box-topper rate cannot be treated as a pack rate. Release requires collation/eligibility review or pack-engine support, pricing and reviewed images. `DRAFT`, `released: false`, and `BLOCKED_PENDING_QA` are retained. Review metadata does not replace the real unreleased flag.

## Validation and reproduction

Executed generator, completed CSV and byte-for-byte regeneration; live full-source revalidation and reviewed image hash checks. Generator rejects 18 corrupt source cases and three unsafe manifest cases. Source failures are bounded and fail closed; whole-token surname preservation and the intentional checklist-team exception are tested.

Actual `import-set-bundle.ts` passed against an **empty disposable local PGlite PostgreSQL-compatible server**: dry-run writes nothing, missing-team gate rejects before writes, apply creates one unreleased product/15 sets/773 cards, every stored CSV field is compared, rerun creates no duplicates and preserves sentinel prices/images, released manifest rejected. No production connection is used. All 30 repository tests, open-pack metadata, best-grade checklist, importer smoke and targeted ESLint passed.

```bash
python3 scripts/generate-2001-topps-heritage-baseball.py --check
python3 scripts/generate-2001-topps-heritage-baseball.py --refresh-sources --check
```

Integration requires an empty **local** database named `th01_set_factory_test`; never falls back to shell `DATABASE_URL`:

```bash
SET_FACTORY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/th01_set_factory_test' node scripts/test-2001-topps-heritage-baseball.mjs
```

Use `npm run import:set-bundle -- <bundle>` for dry-run; append `--apply` for the unreleased Admin draft. The source snapshot, generator, manifest, completed CSV, integration test and research note are committed together.
