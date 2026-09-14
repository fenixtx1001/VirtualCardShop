# Set Factory generator conventions

These rules apply to all new Set Factory generators and generated card CSVs.

## Team data validation

A blank team is normally a generator error and should stop generation before the CSV is written.

### Checklist-card exception

Cards whose subject is a checklist are allowed to have a blank team. A checklist is not a team-specific card, so missing team data on that card is intentional rather than incomplete metadata.

Generators must therefore validate team data using the same convention as the Set Factory importer:

- If `team` is blank and the card is **not** a checklist card, stop generation.
- If `team` is blank and `player` or `subset` identifies the card as a checklist, allow it.
- Final missing-team validation must use the same exception so a valid checklist card cannot fail the end-of-generator audit.
- Do not invent a team such as `NFL`, `MLB`, `League`, `Multiple`, or `Checklist` merely to satisfy validation.

Recommended helper:

```python
def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()
```

Recommended validation:

```python
if not team and not is_checklist_card(player, subset):
    raise SystemExit(f"Card #{card_number} {player} is missing team data")
```

This convention is intentionally aligned with `scripts/import-set-bundle.ts`, whose `isChecklistCard` logic exempts checklist cards from the `teamData: COMPLETE` missing-team check.

## Player / subject field cleanliness

The `player` field is display-facing. It should contain the player or card subject name plus only short, conventional collector abbreviations that are useful inline.

Allowed examples after the name include small markers such as:

- `RC` for a verified true rookie card
- `MGR` for manager
- `RB` for Record Breaker
- other similarly short, established card-designation abbreviations when they genuinely belong with the displayed subject

Do **not** append descriptive source text, achievements, statistical captions, checklist ranges, award descriptions, or other long annotations to the player name.

For example:

- `Eric Dickerson RB` is acceptable.
- `Eric Dickerson RBMost Rushing Yards` is not acceptable.
- `Charlie Joiner RB` is acceptable.
- `Charlie Joiner RBMost Receptions` is not acceptable.

Descriptive text such as `Most Rushing Yards`, `Most Receptions`, award/career-stat wording, error descriptions, variation descriptions, serial-number information, and similar collector metadata belongs in `subset` or `variant` as appropriate.

Generators should parse the source label into three concepts rather than copying the raw source string into `player`:

1. **Player/subject** — clean display name plus permitted short abbreviation(s).
2. **Subset** — a named card grouping or thematic subset when applicable.
3. **Variant** — card-specific notes such as an achievement caption, error/correction, print variation, serial numbering, autograph/memorabilia attribute, or other collector detail.

When uncertain, prefer a cleaner `player` value and preserve the extra source text in `subset` or `variant` rather than displaying it inline with the player's name.

## Standing rule

These are forward-looking Set Factory rules. All new generators should include the checklist-card exception and player-field cleanup from the start rather than discovering them set-by-set.
