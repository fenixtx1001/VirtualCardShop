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

## Standing rule

This is a forward-looking Set Factory rule. All new generators should include the checklist-card exception from the start rather than discovering it set-by-set.
