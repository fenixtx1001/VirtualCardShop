# 1997 Finest Baseball — Set Factory Release Gate

## Canonical collecting structure (corrected October 15, 2026)

**Never split the historical 350-card master Base checklist solely because cards have different pull odds.** Collecting, Binder views, completion percentage, prestige and card ownership are all scoped to the single ProductSet.

| Collector ProductSet | Bronze cards | Silver cards | Gold cards | Total |
| --- | ---: | ---: | ---: | ---: |
| Base | 200 | 100 | 50 | **350** |
| Refractors | 200 | 100 | 50 | **350** |
| Embossed | — | 100 | 50 | **150** |
| Embossed Refractors | — | 100 | 50 | **150** |
| Total | 400 | 400 | 200 | **1,000** |

Individual Card.subset stores **Bronze**, **Silver**, or **Gold**, while `Card.variant` is used for genuine parallel/finish metadata. A Gold base card is NOT an insert or a Gold parallel of a Bronze player; it is one of the 350 distinct Base subjects.

For example, ownership of 200 unique Bronze + 40 unique Silver + 10 unique Gold base cards yields 250/350 = 71.4% completion. Prestige 1× requires holding every one of the 350; Prestige 2× requires two of each, independent of tier.

## Tier-aware rarity and current blocker

The existing VCS pack engine treats all cards in an `isBase` ProductSet as equally likely, and `oddsPerPack` applies to the entire non-base ProductSet. **This cannot preserve individual Bronze/Silver/Gold rarities inside one collector checklist.**

Historic researched pack rates by tier (across the original 6-card Finest product) are:

- Base Bronze: common backfill; Silver: 1:4 packs; Gold: 1:24 packs.
- Refractors Bronze: 1:12; Silver: 1:48; Gold: 1:288.
- Embossed Silver: 1:16; Gold: 1:96.
- Embossed Refractors Silver: 1:192; Gold: 1:1152.

These values are **research metadata only in this draft**. The revised bundle intentionally leaves `oddsPerPack: null` on the three parallel ProductSets and preserves a single 350-card `BASE`. The set is **BLOCKED FOR RELEASE** until a generic rarity-aware draw algorithm, corresponding EV/auto-pack pricing and regression tests are implemented. Do not add Silver/Gold duplicate ProductSets or invented whole-ProductSet odds as a workaround.

A preferred future implementation is tier-aware group selection *inside each collector ProductSet* with per-pack frequencies defined in a versioned product or set configuration, then uniform selection among card subjects belonging to the chosen tier. The product must remain backwards-compatible with existing flat/equal-odds sets, including existing user collections, pack sales and prestige.

## Structural details

- Original full master checklist: 350 distinct subjects.
- The first two physical series are merged; one card identity per real printed physical card.
- Three genuine misnumberings: TCDB differentiates them as `155b`, `135b`, and `164b`; no invented numbered `5`, `115`, `172`.
- True Base RCs: #206 Brian Giles, #249 Bubba Trammell, #320 Hideki Irabu, #337 Jose Cruz Jr. Only verified individual Base RCs receive the suffix.
- Five Refractors promotional samples are excluded from ordinary pack ripping.
- Historical 6-card packs converted to VCS 4-card packs; preserve rather than fabricate odds.

## Source and validation

- [TCDB Base set](https://www.tcdb.com/ViewSet.cfm/sid/922/1997-Finest)
- [TCDB Rookie index](https://www.tcdb.com/Rookies.cfm/sid/922/1997-Finest)
- [TCDB Inserts](https://www.tcdb.com/Inserts.cfm/sid/922/1997-Finest)
- [BaseballCardPedia product history](https://baseballcardpedia.com/index.php/1997_Finest)

## Release gate

- [ ] Run generator offline self-tests, live full-checklist validation and importer dry run.
- [ ] Confirm exactly four ProductSets with 350/350/150/150 counts and tier counts as table above.
- [ ] Confirm Base completion/Prestige includes all 350, including Silver and Gold; check Binder view.
- [ ] Implement tier-aware pack draw, correct pack EV/auto-pricing, and statistical tests without changing existing set odds.
- [ ] Verify the misnumbered cards, true RC labels, complete parallels and player/team data.
- [ ] Approve images, price data, packaging art and pack simulations.
- [ ] Stage unreleased import only. Release after the full review passes.
