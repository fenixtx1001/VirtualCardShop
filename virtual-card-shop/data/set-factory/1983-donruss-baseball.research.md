# 1983 Donruss Baseball — Set Factory verification

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/91/1983-Donruss (all seven pages): numbering, subjects, teams, RC designations and variation notes.
- https://baseballcardpedia.com/index.php/1983_Donruss : independent complete numbered checklist, six Rated Rookies and wax distribution.
- https://www.beckett.com/news/1983-donruss-baseball-cards/ : collector checklist and format.

## Representation

660 base positions: 1-653 and seven physically unnumbered checklist cards. VCS IDs
CL-DK and CL1-CL6 distinguish the checklists; range/number notes remain metadata.
The DK checklist includes Dick Perez and is displayed as Dick Perez / Diamond
Kings Checklist. Diamond Kings 1-26 remain base. Six early back-designated Rated
Rookies (52,126,547,574,579,649) remain base, not a fictitious 27-46 subset.

Wax: 15 baseball cards plus one three-piece Ty Cobb puzzle panel, 36 packs/box.
The non-card puzzle panels are excluded. Ty Cobb #653 puzzle-picture card remains.
Separate oversized Action All-Stars are not modeled as flagship inserts.

670 source rows collapse to 660 positions. Corrected/later source versions are
canonical: Bryn Smith #88, Pascual Perez #557, Ron Jackson #639c; other variants
use the later b state. DK checklist uses the reverse marked Check List. Variations
are not separate completion requirements; card-specific notes stay in metadata.

## Verification

- 660 unique expected IDs; full 1-653 coverage independently matched secondary source.
- Key RC assertions: Ryne Sandberg #277, Wade Boggs #586, Tony Gwynn #598.
- All RC markers come from explicit checklist tags, not inferred from subset names.
- Six Rated Rookie positions independently checked against BaseballCardPedia.
- Names/teams verified from TCDB. Reviewed secondary-source differences are
  nickname/full-name forms (Richard Gale, Richard Dotson, Charles Davis, Bobby
  Grich, Tito Landrum, Bobby Molinaro) and clean metadata removal for Schmidt #168
  and multi-subject MVPs #648. Niekro Brothers #613 has both player/team names.
- Seven checklists intentionally lack a team. #645 The Chicken is an independent
  mascot with no team affiliation. All other cards have teams.
- Generator/self-test pass; token boundary checks preserve suffix-looking names.
- Importer accepted bundle/CSV validation, then stopped at first database read:
  DATABASE_URL is absent in this workspace. Database dry run and apply not completed.

## Import caveat

The existing importer exempts only checklists from team validation. teamData is
PENDING solely for the verified mascot exception. Use --allow-pending-teams when
applying; do not invent a Padres team for The Chicken. Product remains unreleased,
release blocked, images/pricing pending.

```bash
npm run import:set-bundle -- data/set-factory/1983-donruss-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1983-donruss-baseball.bundle.json --apply --allow-pending-teams
```
