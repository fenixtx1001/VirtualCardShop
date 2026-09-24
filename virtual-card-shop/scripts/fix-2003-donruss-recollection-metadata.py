from pathlib import Path

path = Path(__file__).with_name("generate-2003-donruss-baseball.py")
source = path.read_text(encoding="utf-8")

old = '''def build_recollection(source: dict[str, object], url: str) -> list[list[str]]:
    records = fetch_source_rows(source, url)
    subset = str(source["subset"])

    normalized: list[tuple[str, str, str, str]] = []
    for physical_number, raw_name, raw_team, extras in records:
        player, variant = clean_player_and_variant(raw_name, extras)
        team = validate_team(physical_number, player, raw_team, subset)
        details = [f"Physical #{physical_number}", "AU"]
        if variant:
            details.append(variant)
        normalized.append((physical_number, player, team, "; ".join(dict.fromkeys(details))))

    normalized.sort(key=lambda row: (natural_number_key(row[0]), row[1].lower(), row[2].lower(), row[3]))

    rows: list[list[str]] = []
    for index, (_physical_number, player, team, variant) in enumerate(normalized, start=1):
        rows.append([
            "recollection-collection",
            f"RC-{index:03d}",
            player,
            team,
            subset,
            variant,
        ])
    return rows
'''

new = '''def split_recollection_subject_and_source(raw_name: str) -> tuple[str, str]:
    # TCDB stores Recollection buybacks in a combined text cell, e.g.
    # "Bo Jackson AU, SN1 1990 Donruss - Bonus MVPs" or
    # "The San Diego Chicken, 1983 Donruss". The original release is source
    # metadata and must never leak into VCS Player.
    match = re.search(r"(?:^|[ ,])((?:19|20)\\d{2}\\b.*)$", raw_name)
    if not match:
        raise SystemExit(
            f"Recollection row is missing its original source release: {raw_name!r}"
        )

    source_release = " ".join(match.group(1).split()).strip(" ,;")
    subject_text = raw_name[: match.start(1)].strip(" ,;")
    if not subject_text:
        raise SystemExit(f"Recollection row lost its subject before source split: {raw_name!r}")
    return subject_text, source_release


def build_recollection(source: dict[str, object], url: str) -> list[list[str]]:
    records = fetch_source_rows(source, url)
    subset = str(source["subset"])

    normalized: list[tuple[str, str, str, str]] = []
    for physical_number, raw_name, raw_team, extras in records:
        subject_text, source_release = split_recollection_subject_and_source(raw_name)
        player, variant = clean_player_and_variant(subject_text, extras)
        team = validate_team(physical_number, player, raw_team, subset)

        details = [
            f"Physical #{physical_number}",
            "AU",
            f"Source: {source_release}",
        ]
        if variant:
            details.append(variant)
        normalized.append(
            (physical_number, player, team, "; ".join(dict.fromkeys(details)))
        )

    # Original source years belong in Variant, never Player.
    polluted = [
        row for row in normalized
        if re.search(r"\\b(?:198[1-9]|199\\d|200[0-2])\\b", row[1])
    ]
    if polluted:
        raise SystemExit(f"Recollection source release leaked into Player: {polluted[:8]}")

    chicken_rows = [
        row for row in normalized
        if normalized_subject_for_team_override(row[1]) in CHICKEN_TEAM_ALIASES
    ]
    if chicken_rows:
        for row in chicken_rows:
            if row[2] != "San Diego Padres":
                raise SystemExit(f"San Diego Chicken Recollection team audit failed: {row}")
            if "Source: 1983 Donruss" not in row[3]:
                raise SystemExit(f"San Diego Chicken Recollection source audit failed: {row}")

    normalized.sort(
        key=lambda row: (natural_number_key(row[0]), row[1].lower(), row[2].lower(), row[3])
    )

    rows: list[list[str]] = []
    for index, (_physical_number, player, team, variant) in enumerate(normalized, start=1):
        rows.append([
            "recollection-collection",
            f"RC-{index:03d}",
            player,
            team,
            subset,
            variant,
        ])
    return rows
'''

if old in source:
    path.write_text(source.replace(old, new), encoding="utf-8")
    print("Separated Recollection subjects from original source-release metadata.")
elif new in source:
    print("Recollection subject/source metadata split already present.")
else:
    raise SystemExit("Expected build_recollection block not found; refusing to modify generator.")
