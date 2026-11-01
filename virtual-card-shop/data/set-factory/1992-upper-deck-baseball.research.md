# 1992 Upper Deck Baseball — Set Factory draft

Audited October 31, 2026 (Central). Source retrieval metadata uses UTC.

**Complete generated payload: 1,774 explicit cards across 17 collector families.** Product ID: 1992_Upper_Deck_Baseball. The manifest is schema v2, DRAFT, released false. These are actual completed checklist files, not an unexecuted generator. Number/name/team/subset and inventory validation passed. **True-RC catalog reconciliation and exact pack odds remain open review items; this is not a fully resolved release candidate.**

## Collector inventory

| Family | Cards | Distribution / treatment |
|---|---:|---|
| Base | 800 | One complete 1–800 collector set |
| Gold Hologram | 800 | Genuine factory-set parallel; no ordinary-pack pulls |
| Special Prints | 2 | SP3 Deion Sanders; SP4 Tom Selleck / Frank Thomas |
| Ted Williams Hologram | 1 | HH2, low series |
| Baseball Heroes – Ted Williams | 10 | 28–36 plus unnumbered SP header |
| Ted Williams Autograph | 1 | Printed #36, hand-numbered /2500 |
| Baseball Heroes – Bench and Morgan | 10 | 37–45 plus unnumbered SP header |
| Bench and Morgan Autograph | 1 | Printed #45, both signed, /2500 |
| College Player of the Year Holograms | 3 | CP1–CP3 |
| Heroes Highlights | 10 | HI1–HI10, special event packs |
| Heroes of Baseball | 4 | H5–H8, special event issue |
| Heroes of Baseball Autographs | 3 | H5–H7, each /3000 |
| Heroes of Baseball Pennant Holograms | 28 | Silver, 28 franchise subjects |
| Homerun Heroes | 26 | HR1–HR26, low-series Jumbo only |
| Scouting Report | 25 | SR1–SR25, high-series Jumbo only |
| Team Logo Holograms | 30 | Gold finish, 28 franchises plus AL/NL |
| Ted Williams' Best | 20 | T1–T20, high-series wax |

Gold Hologram is one PARALLEL ProductSet with all 800 explicit rows, not 800 rows inferred from a count. Other insert/autograph families use the existing INSERT convention. Oversized box-bottom panels, wrapper/mail-in lithographs, promotional sheets and unverified signature/printing variants are excluded.

## Sources and retrieval

- [TCDB base checklist](https://www.tcdb.com/Checklist.cfm/sid/217/1992-Upper-Deck), all eight populated pages: 800 numbers, source subjects, teams, tags and separate annotations.
- [TCDB rookie index](https://www.tcdb.com/Rookies.cfm/sid/217/1992-Upper-Deck): all 45 candidates matched to canonical source identities/teams; next page empty.
- [TCDB insert/parallel index](https://www.tcdb.com/Inserts.cfm/sid/217/1992-Upper-Deck): all 15 named insert/related families, one true Gold Hologram parallel and three single inserts reviewed.
- [Gold Hologram, namespace 10281](https://www.tcdb.com/Checklist.cfm/sid/10281/1992-Upper-Deck-Gold-Hologram), eight populated pages: all 800 cards retrieved individually and compared to base.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/1992_Upper_Deck): complete 800-number base checklist and every enumerated regular/event/autograph insert checklist compared number by number with documented source corrections.
- [Cardboard Connection](https://www.cardboardconnection.com/1992-upper-deck-baseball-cards): corroborating subjects, insert distributions and explicit RC evidence for Eduardo Perez #52 and disputed Butch Henry #796.
- Earlier-release evidence retained from [1991 UD Final Edition](https://www.tcdb.com/Checklist.cfm/sid/172/1991-Upper-Deck-Final-Edition), [1991 Fleer Update](https://www.tcdb.com/Checklist.cfm/sid/157/1991-Fleer-Update), [1991 Donruss The Rookies](https://www.tcdb.com/Checklist.cfm/sid/154/1991-Donruss-The-Rookies), [1991 Ultra Update](https://baseballcardpedia.com/index.php/1991_Ultra_Update) and [1989 Topps Big](https://baseballcardpedia.com/index.php/1989_Topps_Big).

The source JSON contains original normalized records, exact URLs and raw-response SHA-256 hashes. Manual card-image review retains 22 scan URLs/hashes. The generator uses explicit namespace validation: an unneeded ninth Gold page returns another set's rows, so it is rejected and not used. No borrowed BasicID filters or partial retrieval fallback.

The 16 box-bottom records (eight per issue) are retained as scope-review evidence, not pack inserts. All live sources required for regeneration must succeed; a failed fetch or unreviewed change prevents CSV writes.

## Subject, team and subset corrections

Card scans and independent full checklists resolve captions and omissions:

- Expand “Pedro & Ramon,” “Cal Jr. & Billy,” “Gary & Dwight” and the Griffey caption into full collector-facing names. Keep Bloodlines captions out of the player field.
- #80 depicts **Keith Mitchell and Kevin Mitchell**, confirmed by the card back. BCP's “Brian Mitchell” is an error.
- Gold #69's back explicitly says Pittsburgh Pirates. Source Welland Pirates is the minor-league photo affiliation, not the printed franchise.
- #84 depicts Dwight Gooden and Gary Sheffield. Combine their Mets/Brewers affiliations, corroborated by individual base cards #135/#234. Gold source team was blank.
- Normalize #1, #51, #81 and #83 names/team order so paired affiliations are coherent. #28 Winfield retains all three source-verified teams, in shared chronological order.
- Gold #54 Dave Zancanaro and base David Zancanaro are the same subject; use David. #752 Ruben Amaro is Ruben Amaro Jr., not his father.
- SP4 pictures both Tom Selleck and Frank Thomas in the fictional Yankees scene. Do not change Thomas's affiliation to his real-life White Sox for this card.
- College holograms retain Stanford Cardinal / Minnesota Twins, Arizona State Sun Devils / Atlanta Braves and LSU Tigers / Baltimore Orioles. Deion's SP3 retains Braves / Falcons.
- Use stable alphabetical NNO-01..NNO-28 and NNO-01..NNO-30 identifiers for unnumbered logos. These are VCS identifiers, not claimed printed card numbers. AL/NL logos have real league subjects and explicit league affiliations, not invented MLB filler.

Subset mapping is validated by printed ranges: Star Rookies 1–27; NL team checklists 29–40; Top Prospects 51–77; Bloodlines 79–85; AL team checklists 86–99; Diamond Skills 640–650 and 711–721; Diamond Debuts 770–780; generic checklists every 100. Checklist/heading cards within those ranges retain their specific checklist subset. Winfield/Murray 400-homer cards, Avery's Playoff Perfection, Abbott's Stay in School, Rookie Threats #702 and Henderson's Grand Theft have separate clean subset metadata.

Only 18 blank teams: eight base and eight Gold generic checklists, plus two generic Baseball Heroes header cards. The 16 checklist blanks are intentional under Set Factory conventions. The two headers require pending-team staging; no arbitrary franchise is invented.

## Rookie reconciliation — open gate

Do not equate a source RC tag or Star Rookies/Top Prospects/College title with a verified true rookie card.

TCDB's canonical list and independently retrieved rookie index agree on 45 candidate rows. Earlier-release research rejects eight suffixes:

| Current card | Earlier major card |
|---|---|
| #12 Ted Wood | 1989 Topps Big #308 |
| #45 Mo Sanford | 1991 Fleer Update U-86 |
| #57 Dave Nilsson | 1991 UD Final Edition #25F |
| #58 Dmitri Young | 1991 UD Final Edition #7F |
| #526 Frank Castillo | 1991 UD Final Edition #27F |
| #566 Jose Melendez | 1991 Donruss The Rookies #23 |
| #621 Warren Newson | 1991 Ultra Update U-17 |
| #625 Juan Guzman | 1991 Ultra Update U-60 |

Add Eduardo Perez #52, supported by BCP, CCC and indexed Beckett catalog wording. Hold #54 David Zancanaro and #69 Jon Farrell (RC/RC* in TCDB/BCP, TP in indexed Beckett), and #796 Butch Henry (RC in BCP/CCC, absent from canonical/index RC tags) without RC suffixes; preserve explicit dispute notes.

The resulting payload retains **36 source-supported base suffixes**. No Gold or insert RC suffixes are inferred. Multi-player family/checklist/highlight appearances do not automatically receive RCs from another card's designation.

**Blocker:** [Beckett's indexed set metadata](https://www.beckett.com/baseball/1992/upper-deck/) reports 31 RCs, while its live set and Marketplace URLs currently redirect to a maintenance page. Available indexed catalog text can corroborate individual cases, but does not provide a complete reproducible card-by-card RC reconciliation. The 36 retained suffixes therefore must not be presented as a fully reconciled Beckett-standard count. Rookie review remains PENDING_CATALOG_RECONCILIATION_54_69_796, with broader source-count reconciliation still open before release. No RC count was fabricated to match 31 or 45.

## Pack model and odds — open gate

Use standard foil: **15 cards per pack, 36 packs per box**. Historical Jumbo had 27 cards and 20 packs; it is not silently mixed into this product. Unlike 1991, 1992 did not require an additional sticker in every pack.

Sources provide ranges or no exact rates for ordinary-pack inserts. SP is described as one per three/four boxes; stickers approximately five/six per low-series box. These are not exact denominators. Do not turn them into invented 108/144 or 6/7 odds. Do not carry 1991 Heroes rates forward without 1992 evidence.

**All insert/parallel odds are deliberately null.** Full checklists remain available for pricing and image harvesting, but those families cannot be pulled until Admin configures a reviewed model. Known one-per-matching-Jumbo rates are documented on the two Jumbo ProductSets, not enabled in the standard-foil product. Event-only and factory-only issues also remain disabled in ordinary packs.

Preserve full base/Gold/insert checklists and flatten availability within each family per Set Factory conventions. Header/expansion-logo scarcity stays in metadata; the existing independent-roll engine does not provide historical per-card rarity weights or exact low/high collation.

Printed autograph numbers are #36/#45 and H5–H7. BCP's AU-prefixed catalog IDs are cross-referenced for verification, not substituted for card numbers. Williams and Bench/Morgan are /2500 each; all 2500 Bench/Morgan cards have both signatures. Event autographs are /3000 each. Genuine pack signatures have diamond-shaped reverse authentication holograms; unsigned inserts use fan-shaped marks. No signed H8 invented.

## Verification

- Actual generation and exact offline --check regeneration.
- Full base, independently retrieved Gold, insert IDs/subjects and historical-team vocabulary checks; 1,774 unique identities, six-column CSV format.
- Separate rookie-index comparison, earlier-release evidence checks and retained/open RC distinctions.
- Namespace, caption parsing, strict whole-token cleanup and eleven negative corruption tests.
- Existing 30 Node unit tests and pack-art/checklist-grade/import-parser smoke checks.
- Targeted ESLint for the integration harness.
- Real Set Factory importer exercised against full Prisma schema in a fresh local disposable PostgreSQL-compatible PGlite server: dry run, pending-team rejection, apply of all cards/sets, all imported field values compared with CSV, idempotent rerun, preservation of prices and pack/front/back art, unreleased state and released=true manifest rejection.
- No production database modification or deployment.

Offline:

    python3 scripts/generate-1992-upper-deck-baseball.py --check

Live:

    python3 scripts/generate-1992-upper-deck-baseball.py --refresh-sources --check

Live validation fails closed on source retrieval/inventory/namespace changes and changed reviewed scan bytes. It does not claim to resolve the unavailable Beckett classification data automatically.

Import the completed CSV/bundle through the existing importer, dry-run then --apply --allow-pending-teams. New product remains unreleased for Admin pricing/image harvesting. Reruns preserve existing prices, artwork and existing release state.
