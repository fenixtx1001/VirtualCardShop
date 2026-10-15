# 1997 Finest Baseball — Set Factory Release Gate

## Implementation
- TCDB [base #922](https://www.tcdb.com/ViewSet.cfm/sid/922/1997-Finest); [Refractors #923](https://www.tcdb.com/Checklist.cfm/sid/923/1997-Finest-Refractors); [Embossed #10901](https://www.tcdb.com/Checklist.cfm/sid/10901/1997-Finest-Embossed); [Embossed Refractors #10902](https://www.tcdb.com/Checklist.cfm/sid/10902/1997-Finest-Embossed-Refractors).
- Exactly **1,000 unique collectible card entries**: 350 fractured original cards, 350 Refractors, 150 Embossed, 150 Embossed Refractors.
- Bronze 200, Silver 100, Gold 50. Foil tiers are DIFFERENT SUBJECTS, not alternate 350-card finishes.
- Base split for importer: Bronze=BASE(200); Silver=INSERT(100) with pack odds 1:4; Gold=INSERT(50) with odds 1:24. The importer only allows one BASE set; this split avoids claiming an equal chance to draw historical Silver/Gold.
- Refractors: Bronze 200 1:12, Silver 100 1:48, Gold 50 1:288.
- Embossed: Silver 100 1:16; Gold die cut 50 1:96. No Bronze.
- Embossed Refractors: Silver 100 1:192; Gold die cut 50 1:1152. No Bronze.
- Two physical series combined; use VCS 4-card packs and 24-pack boxes.
- Four true Base RCs only: #206 Brian Giles, #249 Bubba Trammell, #320 Hideki Irabu, #337 Jose Cruz Jr. Do not label parallels as rookie cards.
- The three true misnumberings **printed twice**: 155 instead of 5 (TCDB internal 155b), 135 instead of 115 (135b), and 164 instead of 172 (164b). Preserve each different player and no fantasy #5/#115/#172 printings.
- Five Refractors Promotional Samples excluded from normal pack-opening collections.
- No source-unsupported variant odds or invented checklist subjects.

## Critical Gameplay Constraint
Current VCS bundle importer allows only **one BASE ProductSet**, and VCS Base completion is calculated from that category. Therefore, the current implementation shows **200 Bronze cards** as Base completion instead of the historical *350-card combined fractured master checklist*. The Gold/Silver cards are represented as INSERT-kind to preserve their historical rarity in packs. **Do not release before deciding whether to improve app support for one fragmented base collection with multiple rarity bands.** There should not be 350 different Silver or Gold versions of every subject.

## Release Checklist
- [ ] Run Python `--self-test`, full TCDB generator and Set Bundle DRY_RUN.
- [ ] Inspect and resolve any checklist/name/team mismatches; never import partial cards.
- [ ] Approve completion logic for 350 fractured Base master cards.
- [ ] Review interaction of historical six-card odds with VCS four-card packs.
- [ ] Approve pack and box artwork, representative scan matches, card images.
- [ ] Approve pricing and verify rookie labels for four Base cards.
- [ ] Import as an unreleased draft only; verify no existing user data overwritten.
- [ ] Release only after all QA gates pass.

## Sources
- [TCDB Finest set notes](https://www.tcdb.com/ViewSet.cfm/sid/922/1997-Finest)
- [TCDB Finest insert/parallel notes](https://www.tcdb.com/Inserts.cfm/sid/922/1997-Finest)
- [TCDB Finest rookie index](https://www.tcdb.com/Rookies.cfm/sid/922/1997-Finest)
- [BaseballCardPedia distribution history](https://baseballcardpedia.com/index.php/1997_Finest)
