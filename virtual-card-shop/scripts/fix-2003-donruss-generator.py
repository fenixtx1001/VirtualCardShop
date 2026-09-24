from pathlib import Path

path = Path(__file__).with_name("generate-2003-donruss-baseball.py")
source = path.read_text(encoding="utf-8")
changed = False

old_syntax = '''    if "SN206" not in lookup[("stat-line-career", "1")][5]:
        raise SystemExit(f"Stat Line Career #1 lost SN206 metadata: {lookup[(\\\"stat-line-career\\\", \\\"1\\\")]}")
    if "SN111" not in lookup[("stat-line-season", "1")][5]:
        raise SystemExit(f"Stat Line Season #1 lost SN111 metadata: {lookup[(\\\"stat-line-season\\\", \\\"1\\\")]}")
'''

new_syntax = '''    career_one = lookup[("stat-line-career", "1")]
    if "SN206" not in career_one[5]:
        raise SystemExit(f"Stat Line Career #1 lost SN206 metadata: {career_one}")

    season_one = lookup[("stat-line-season", "1")]
    if "SN111" not in season_one[5]:
        raise SystemExit(f"Stat Line Season #1 lost SN111 metadata: {season_one}")
'''

if old_syntax in source:
    source = source.replace(old_syntax, new_syntax)
    changed = True
    print("Patched 2003 Donruss generator Stat Line audit syntax.")
elif new_syntax in source:
    print("2003 Donruss generator Stat Line audit already patched.")
else:
    raise SystemExit("Expected Stat Line audit block not found; refusing to modify generator.")

old_team = '''def validate_team(card_number: str, player: str, team: str, subset: str) -> str:
    clean = " ".join(team.split()).strip()
    if not clean and not is_checklist_card(player, subset):
        raise SystemExit(f"{subset} #{card_number} {player} is missing team data")
    return clean
'''

new_team = '''CHICKEN_TEAM_ALIASES = {
    "the chicken",
    "the san diego chicken",
    "san diego chicken",
    "the famous chicken",
    "famous chicken",
    "the famous san diego chicken",
}


def normalized_subject_for_team_override(player: str) -> str:
    value = re.sub(r"\\bMAS\\b", "", player, flags=re.IGNORECASE)
    return " ".join(value.lower().split()).strip(" ,;")


def validate_team(card_number: str, player: str, team: str, subset: str) -> str:
    clean = " ".join(team.split()).strip()
    if clean:
        return clean

    # TCDB identifies The Chicken / San Diego Chicken as the independent mascot
    # associated with San Diego, and its team-filtered gallery places the 2003
    # Donruss Anniversary #19 card under the San Diego Padres. Preserve that
    # source-backed association rather than weakening missing-team validation.
    if normalized_subject_for_team_override(player) in CHICKEN_TEAM_ALIASES:
        return "San Diego Padres"

    if not is_checklist_card(player, subset):
        raise SystemExit(f"{subset} #{card_number} {player} is missing team data")
    return clean
'''

if old_team in source:
    source = source.replace(old_team, new_team)
    changed = True
    print("Added source-backed San Diego Chicken team override.")
elif new_team in source:
    print("San Diego Chicken team override already present.")
else:
    raise SystemExit("Expected validate_team block not found; refusing to modify generator.")

old_spot = '''        ("anniversary-1983", "1"): ("Dale Murphy", "Atlanta Braves"),
'''
new_spot = '''        ("anniversary-1983", "1"): ("Dale Murphy", "Atlanta Braves"),
        ("anniversary-1983", "19"): ("The Chicken MAS", "San Diego Padres"),
'''

if old_spot in source and new_spot not in source:
    source = source.replace(old_spot, new_spot)
    changed = True
    print("Added Anniversary 1983 #19 Chicken spot check.")
elif new_spot in source:
    print("Anniversary 1983 #19 Chicken spot check already present.")
else:
    raise SystemExit("Expected Anniversary 1983 spot-check anchor not found; refusing to modify generator.")

if changed:
    path.write_text(source, encoding="utf-8")
    print("2003 Donruss generator patch complete.")
else:
    print("2003 Donruss generator already fully patched.")
