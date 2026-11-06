# 2003 Bowman Baseball — unreleased Set Factory draft

**1,317 completed card rows in eleven collector families**, including **330 base cards** and **165 verified true base RCs**. Product `2003_Bowman_Baseball` remains `released: false`. No production database was accessed and no deployment was performed.

## Inventory and draft pack configuration

| Family | Actual collector cards | Hobby denominator |
| --- | ---: | ---: |
| Base | 330 | Base pool |
| Gold | 330 | 1 |
| Uncirculated Silver | 330 | Null / QA |
| Uncirculated Metallic Gold | 165 | Null / QA |
| Future Fiber Bats | 33 | Null / QA |
| Futures Game Jerseys | 46 | 26 |
| Signs of the Future | 40 | Null / QA |
| Signs of the Future Red Ink | 40 | 687 |
| Signs of the Future Dual | 1 | 9220 |
| Futures Game Base Autograph | 1 | Null / QA |
| Dual Rookie of the Year Relic | 1 | 765 |

One complete base family retains Veterans #1–155 and Rookies/Prospects #156–330 as subset metadata. Those ranges are not separate base pools. Every Gold and Silver card was actually fetched in its own four-page namespace. Metallic Gold is the genuine 165-card partial parallel #166–330, not a derived full 330-card set.

The source catalogue count of 331 Silver entries includes a generic **complete-set exchange ticket**. Its 166-entry Metallic Gold list includes a generic **exchange ticket**. These are not extra player cards. Both remain in the source evidence and are explicitly checked before exclusion; they are never used to create fake Colorado Rockies player entries. The actual ROY-JH singleton is included even though TCDB lists it inline rather than under a separate insert SID.

## Source verification

The committed `.source.json` contains **46 structured source entries**, URLs, captured HTML SHA-256 hashes, complete parsed rows, and **26 reviewed original image hashes**: 24 front/back card images for twelve selected cards plus two box images. Live refresh fetches and parses every source, checks all image bytes, and regenerates the exact CSV. Retrieval or validation failures stop before writing a partial checklist.

- [TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1597/2003-Bowman?PageIndex=1): all four pages and [both rookie-index pages](https://www.tcdb.com/Rookies.cfm/sid/1597/2003-Bowman?PageIndex=1).
- [Complete related-set index](https://www.tcdb.com/Inserts.cfm/sid/1597/2003-Bowman): nine related namespaces, plus the inline ROY-JH card. All base/parallel/insert namespace IDs and full pagination are validated, not just headline counts.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/2003_Bowman): full 330-card independent base roster, all 165 RC flags, complete bat/jersey/signature/dual/relic rosters, materials, physical format/tier odds and redemption rules.
- [MyCardBatch](https://mycardbatch.com/checklists/bowman-2003-baseball): all **657** number/name/team tuples in eight tables are checked. The sole generic exchange-ticket tuple is identified explicitly, leaving **656 actual player-card tuples**. It omits Gold, Silver and the inline dual ROY family, so it is not treated as a complete master by itself.
- [Keyman](https://keymancollectibles.com/baseballcards/bowman/2003bowmanbaseballcardchecklist.htm): all **330 independent numbered subject entries** checked. Its RC flags omit 21 cards compared with the complete TCDB index and BCP detailed roster, so those omissions are not adopted as true-RC decisions. Its #262 “Jacabo Meque” typo is explicitly normalized to Jacobo; #171 Nivar-Martinez is a name-form alias.
- Six independently retrieved TCDB person profiles corroborate the identity mappings below. Their canonical names and exact person IDs are validated on live refresh.

### True rookies and names

Exactly **165** specific base cards receive ` RC`, with every number/name/team tuple compared against the independent rookie index and BCP flags. Ten members of the blue subset already have earlier RCs; the subset title alone never determines rookie status. In particular, Chad Hutchinson #156 and Eric Eckenstahler #208 are not newly tagged, while Quincy Carter #157 is a recognized baseball RC. Parallels, autographs, reprints and ROY tributes do not inherit base RC suffixes. Pre-2006 collector RC designations can include prospects who never reached MLB; no modern rookie-logo or MLB debut-year rule is substituted.

| Card | Printed name | Verified displayed identity | TCDB person ID |
| --- | --- | --- | ---: |
| 171 | Ramon A. Martinez | Ramon Nivar | 29716 |
| 190 | Eny Cabreja | Wandy Rodriguez | 5023 |
| 217 | Jairo Garcia | Santiago Casilla | 28313 |
| 258 | Aneudis Mateo | Willy Corporan | 98797 |
| 293 | Carlos Rijo | Rafael Diaz | 80389 |
| 317 | Denny Tussen | Carlos Morla | 190776 |

The original card fronts/backs establish the printed names. The actual source-row person links, retrieved canonical person profiles and BCP alias listings establish the identities. These are explicit mappings, not fuzzy matching between unrelated players. The original printed name remains in `variant` on each corresponding base and parallel card. This prevents mixing Wandy Rodriguez with another Cabreja, Ramon Nivar with an unrelated Ramon Martinez, or this Rafael Diaz with a different player of that name.

Common Ichiro/Ichiro Suzuki, Rob/Robby Hammock, Wil/Wilfredo Ledezma and CC/C.C. Sabathia source spellings are harmonized. Matt Kata #240's printed pitcher designation error is retained as metadata; Kevin Youkilis #327's “1st Year Card” caption stays out of the display name. Every source marker is removed only as a complete trailing token, with mandatory Boswell/Hall/Marshall preservation tests.

### Relic teams, materials and card codes

- Every Future Fiber card is a **game-used bat** relic. The full 33-card roster and all seven scarce Group B numbers are retained in one collector family.
- All 46 Futures Game jersey cards are **game-worn** material from the **2002** event. Printed affiliations can predate the product year: original backs confirm Ricardo Rodriguez with the Dodgers and Seung Song with Boston. Do not replace these with later clubs.
- **Victor Diaz FG-VD really prints Cleveland Indians on the back.** The original image resolves the source question. Retain that printed affiliation, with an explicit historical-club discrepancy note, rather than silently invent a Mets/Dodgers correction from his career history.
- Original Jose Reyes front/back confirms **FGAB-JR**, a **game-used base** plus certified autograph. BCP's FCAB-JR prefix is a typo. This is not a bat relic. It is HTA-only; no Hobby odds are assigned.
- Original **ROY-JH** front/back establishes **Jason Jennings jersey / Eric Hinske bat**, in that order, with Colorado/Toronto affiliations. It honors their **2002** ROY awards, not new 2003 rookie status. It is not an autograph.
- Original **DSF-CH** front/back establishes Quincy Carter / Chad Hutchinson's certified dual autograph as **Cubs / Cardinals baseball prospects**. Their football careers do not change the sport or team fields.
- Red Ink is the actual independently retrieved 40-card signature parallel. All number/name/team tuples are compared with the ordinary 40-card autograph family. No /5, /10 or other serial limit is invented.

## Encased cards, facsimiles and preliminary packaging

Ordinary Gold is one per pack on thicker cardstock, with a **gold-foil facsimile** signature. It is not certified autographed and has no asserted serial number. The full 330-card parallel was independently retrieved rather than extrapolated from base.

Uncirculated Silver comprises 330 encased cards serial numbered **/250**, issued in Hobby/HTA box-topper packs. Metallic Gold comprises 165 fulfilled mail-in encased cards, with a **stated 230-copy print run that is not serial numbering**. The old thepit.com ticket granted a random card; retail 1:49 refers to the exchange ticket, not a present-day pack rate for actual fulfilled cards. Redemption expired April 30, 2004. Both ticket mechanisms remain out of the actual player checklist and carry no present-day fulfillment promise.

The reviewed box-back image lists **Andres Torres** in a preliminary Signs of the Future group and says its lists are subject to change. The actual regular Bowman TCDB/BCP/MyCardBatch rosters agree on **40** subjects without SOF-AT. The independently retrieved [separate 2003 Draft Signs checklist](https://www.tcdb.com/Checklist.cfm/sid/14279/2003-Bowman-Draft-Picks-%26-Prospects---Signs-of-the-Future) includes the released SOF-AT. It is not manufactured as a 41st regular Bowman card. The Draft product's other rookies, Chrome cards and relic families are also outside this product's scope.

## Pack odds and release QA

Hobby draft configuration is **24 packs × 10 nominal cards**. [BBCE's Hobby listing](https://bbcexchange.com/products/2003-bowman-baseball-box-h) and BCP agree. [DA Card World](https://www.dacardworld.com/sports-cards/2003-bowman-baseball-hobby-box) and Waxstat report nine; that discrepancy remains a **wrapper-count QA item**, not silently discarded or described as visually resolved. The reviewed box images establish packaging/roster context, not a legible wrapper card-count audit. [HTA is 12 × 21](https://www.dacardworld.com/sports-cards/2003-bowman-baseball-jumbo-box).

| Family | Hobby | Retail | HTA |
| --- | --- | --- | --- |
| Gold | One per pack | One per pack | One per pack |
| Futures Game Jerseys | 1:26 | 1:52 | 1:9 |
| Future Fiber Bats | Groups 1:96 / 1:393 | Ineligible | Groups 1:34 / 1:140 |
| Signs of the Future | Groups 1:39 / 1:183 / 1:2288 | Varies | Groups 1:13 / 1:65 / 1:816 |
| Red Ink | 1:687 | Ineligible | 1:245 |
| Dual autograph | 1:9220 | Ineligible | 1:3264 |
| Jose Reyes signed base | Ineligible | Ineligible | 1:141 |
| Dual ROY relic | 1:765 | Ineligible | 1:246 |

The source snapshot preserves full physical group assignments. Rates live only on ProductSets, never duplicated into card variants. The bat and plain-signature families remain intact with **null aggregate odds**, because no verified single integer rate replaces their tier rates. A dealer's 1:33 autograph headline is not silently adopted over the conflicting detailed tier evidence, and no rounded harmonic rate is invented.

Silver box toppers, fulfilled Metallic Gold and HTA-only Reyes also stay at **null Hobby odds**. The current pack-opening and pack-pricing implementations exclude null non-base pools. They do not enforce original box-topper placement, whole-set redemptions or advertised average box hits. Positive verified rates remain configured for Gold, jerseys, Red Ink, the dual autograph and ROY relic. No pack-engine change is included.

**Release remains blocked** pending wrapper count, tier aggregates, original box/format collation, pricing and images. The catalogue checklist itself is completed, with the exact printed-name/team discrepancies documented. This is ready for Admin pricing and image harvesting, not release.

## Executed validation

From `virtual-card-shop`:

```bash
python3 scripts/generate-2003-bowman-baseball.py --check
python3 scripts/generate-2003-bowman-baseball.py --refresh-sources --check
```

Both pass after fresh live retrieval, including profile identity and all 26 image-hash checks. The generator validates exact card numbers, counts, page boundaries, namespaces, full independent rosters/teams, all 165 RC tuples, subset boundaries, provenance, serial/print-run distinctions, and intentional redemption-ticket exclusions. It also exercises **21 corrupt-source cases**, **six unsafe manifest cases**, whole-token name cleanup and bounded network failures. No failed retrieval is replaced by invented data.

The actual importer integration test is `scripts/test-2003-bowman-baseball.mjs`. It requires an **empty local disposable** PostgreSQL database named `bm03_set_factory_test` through `SET_FACTORY_TEST_DATABASE_URL`, and never uses an ambient production DATABASE_URL. It passed against a fresh PGlite PostgreSQL-compatible socket loaded from the current Prisma schema:

- Dry run writes nothing; missing-team and released-manifest apply attempts are rejected before writes.
- Actual apply creates one unreleased product, eleven ProductSets and all 1,317 cards.
- Every imported player/team/subset/variant matches the CSV. All counts, kinds, odds, 165 RCs, 155/175 subset boundaries and zero spurious ticket cards are asserted.
- Targeted assertions cover six identity aliases, Silver /250 versus Metallic Gold nonserial 230, Gold facsimile versus certified signatures, old relic affiliations, Reyes base material/code, ROY material order and Draft-only exclusions.
- Rerun inserts zero duplicate cards and preserves sentinel product/set/card pricing and images while retaining unreleased status.
- All **30 repository unit tests**, pack-metadata checks, checklist-best-grade checks, importer smoke test and targeted ESLint pass.

The delivered Codespaces command fetches a pinned GitHub commit, stages only the manifest/CSV, dry-runs and then applies. It does not switch branches or replace the user's development checkout.
