#!/usr/bin/env python3
"""Generate the 1999 Bowman Baseball unreleased Set Factory checklist.

Source of truth is TCDB. The generator combines physical Series One (#1-220)
and Series Two (#221-440) into one VCS product, verifies the full Gold and
International parallel checklists against Base, uses TCDB's rookie index as
the only RC authority, and preserves the three autograph foil tiers as
separate ProductSets so VCS does not flatten their materially different odds.

Fail-closed: any incomplete or unexpected source data aborts before the CSV is
written. Does not connect to the database.
"""
from __future__ import annotations

import argparse
import csv
import re
import urllib.error
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/set-factory/1999-bowman-baseball.cards.csv"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
    "Accept": "text/html,application/xhtml+xml",
}

SOURCES = {
    "base": (1300, 440, r"\d{1,3}"),
    "gold": (11419, 440, r"\d{1,3}"),
    "international": (11420, 440, r"\d{1,3}"),
    "roy-favorites": (11416, 10, r"ROY\d{1,2}"),
    "certified-autographs": (11417, 70, r"BA\d{1,2}"),
    "early-risers": (11418, 11, r"ER\d{1,2}"),
    "late-bloomers": (11421, 10, r"LB\d{1,2}"),
    "scouts-choice": (11422, 21, r"SC\d{1,2}"),
}
ROOKIE_SID = 1300
EXPECTED_ROOKIES = 148

AUTO_EXPECTED = {
    ("Series One", "BLUE"): 20,
    ("Series One", "SILVER"): 10,
    ("Series One", "GOLD"): 5,
    ("Series Two", "BLUE"): 20,
    ("Series Two", "SILVER"): 10,
    ("Series Two", "GOLD"): 5,
}

META_START = re.compile(
    r"\s+(?:RC|AU|SN\d+|UER|ERR|COR|VAR)(?:\b|(?=[A-Z])|[,;:])",
    re.IGNORECASE,
)
LEAKED_META = re.compile(
    r"(?:^|[ ,;])(?:UER|ERR|COR|VAR|AU|SN\d+)(?=$|[ ,;:])",
    re.IGNORECASE,
)


class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"TCDB HTTP {exc.code} at {url}: cannot validate the complete "
            "1999 Bowman source; NO CSV written"
        ) from exc
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"TCDB request failed at {url}: {exc}; NO CSV written"
        ) from exc


def clean_subject(raw: str) -> str:
    value = " ".join(raw.split()).strip()
    match = META_START.search(value)
    if match:
        value = value[: match.start()].strip(" ,;")
    # TCDB autograph rows can carry foil/series notes after the AU tag.
    value = re.sub(
        r"\s+(?:BLUE|SIL|SILVER|GOLD)\b.*$",
        "",
        value,
        flags=re.IGNORECASE,
    ).strip(" ,;")
    if not value or LEAKED_META.search(value):
        raise SystemExit(f"Source metadata leaked into player name: {raw!r} -> {value!r}")
    return value


def checklist_url(sid: int, slug: str = "1999-Bowman") -> str:
    return f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/{slug}"


def fetch_cards(
    url: str,
    expected: int,
    label: str,
    number_pattern: str,
    max_pages: int = 8,
) -> dict[str, tuple[str, str, str]]:
    number_re = re.compile(number_pattern, re.IGNORECASE)
    cards: dict[str, tuple[str, str, str]] = {}

    for page in range(1, max_pages + 1):
        parser = Rows()
        joiner = "&" if "?" in url else "?"
        parser.feed(fetch(f"{url}{joiner}PageIndex={page}"))
        parsed_count = 0
        added = 0

        for row in parser.rows:
            values = [v.strip() for v in row if v.strip()]
            for idx, value in enumerate(values):
                if not number_re.fullmatch(value) or idx + 1 >= len(values):
                    continue
                number = value.upper()
                raw = (
                    " ".join(values[idx + 1 : -1])
                    if idx + 2 < len(values)
                    else values[idx + 1]
                )
                if raw.lower() in ("add", "edit", "options"):
                    continue
                name = clean_subject(raw)
                team = values[-1] if idx + 2 < len(values) else ""
                if team == raw:
                    team = ""
                parsed_count += 1
                card = (name, team, raw)
                existing = cards.get(number)
                if existing is not None and existing[:2] != card[:2]:
                    raise SystemExit(
                        f"{label} duplicate #{number}: {existing[:2]!r} "
                        f"versus {card[:2]!r}; NO CSV written"
                    )
                if existing is None:
                    cards[number] = card
                    added += 1
                break

        print(
            f"{label} page {page}: {parsed_count} source rows; "
            f"+{added}; {len(cards)}/{expected}",
            flush=True,
        )
        if len(cards) == expected:
            break
        if page > 1 and parsed_count == 0:
            break

    if len(cards) != expected:
        raise SystemExit(
            f"{label}: expected {expected} unique cards, found {len(cards)}; "
            "NO CSV written"
        )
    return cards


def verify_base_numbering(base: dict[str, tuple[str, str, str]]) -> None:
    expected = {str(number) for number in range(1, 441)}
    if set(base) != expected:
        missing = sorted(expected - set(base), key=int)
        extra = sorted(set(base) - expected)
        raise SystemExit(
            f"Base numbering mismatch; missing={missing[:20]}, extra={extra[:20]}; "
            "NO CSV written"
        )


def fetch_rookies(base: dict[str, tuple[str, str, str]]) -> set[str]:
    rookies = fetch_cards(
        "https://www.tcdb.com/Rookies.cfm/sid/1300/1999-Bowman",
        EXPECTED_ROOKIES,
        "rookies",
        r"\d{1,3}",
        max_pages=4,
    )
    for number, (name, team, _raw) in rookies.items():
        if number not in base:
            raise SystemExit(f"Rookie index contains non-base card #{number}")
        base_name, base_team, _ = base[number]
        if name != base_name:
            raise SystemExit(
                f"Rookie #{number} identity mismatch: {name!r} vs Base {base_name!r}"
            )
        if team and base_team and team != base_team:
            raise SystemExit(
                f"Rookie #{number} team mismatch: {team!r} vs Base {base_team!r}"
            )
    print(f"True RCs verified from TCDB rookie index: {len(rookies)}", flush=True)
    return set(rookies)


# Strict, card-specific source spelling aliases. The canonical VCS name is
# always the Base name. Every alias still requires matching card number/team.
PARALLEL_ALIASES = {
    "148": ("Russell Branyan", "Russ Branyan"),
    "299": ("Jerry Hairston Jr.", "Jerry Hairston"),
    "344": ("CC Sabathia", "C.C. Sabathia"),
    "401": ("Wily Mo Pena", "Willi Mo Pena"),
    "424": ("Chris MaGruder", "Chris Magruder"),
}


def verify_parallel(
    label: str,
    cards: dict[str, tuple[str, str, str]],
    base: dict[str, tuple[str, str, str]],
    issues: list[str],
) -> dict[str, tuple[str, str, str]]:
    if set(cards) != set(base):
        missing = sorted(set(base) - set(cards), key=int)
        extra = sorted(set(cards) - set(base), key=int)
        issues.append(
            f"{label}: numbering mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )
        return cards
    team_updates = []
    for number, (name, team, raw) in list(cards.items()):
        base_name, base_team, _ = base[number]
        alias = (
            PARALLEL_ALIASES.get(number) == (name, base_name)
            and team == base_team
        )
        if name != base_name and not alias:
            issues.append(
                f"{label} #{number}: subject {name!r} ({team!r}) "
                f"does not match Base {base_name!r} ({base_team!r})"
            )
            continue
        if alias:
            print(f"{label} #{number}: {name} -> {base_name} (approved alias)")
        if team != base_team:
            team_updates.append((number, name, team, base_team))
        cards[number] = (base_name, base_team, raw)
    if len(team_updates) > 25:
        issues.append(
            f"{label}: {len(team_updates)} team mismatches require manual review"
        )
    for number, name, old, new in team_updates:
        print(f"{label} #{number} {name}: team {old!r} -> Base {new!r}")
    print(
        f"{label}: verified {len(cards)} source subjects; "
        f"{len(team_updates)} team discrepancies; "
        f"{len(issues)} cumulative issues",
        flush=True,
    )
    return cards


def parse_autographs(
    cards: dict[str, tuple[str, str, str]]
) -> dict[str, list[tuple[str, str, str, str]]]:
    grouped = {
        "certified-autographs-blue": [],
        "certified-autographs-silver": [],
        "certified-autographs-gold": [],
    }
    observed = Counter()

    for number, (name, team, raw) in sorted(
        cards.items(), key=lambda item: int(item[0][2:])
    ):
        # TCDB sometimes joins the foil and series without whitespace:
        # "BLUESeries One", "SILSeries Two", etc.
        metadata = re.search(
            r"\b(BLUE|SILVER|SIL|GOLD)\s*Series\s*(One|Two)\b",
            raw,
            re.IGNORECASE,
        )
        if not metadata:
            raise SystemExit(
                f"Certified Autograph #{number} missing foil/series metadata: {raw!r}"
            )
        foil = metadata.group(1).upper()
        if foil == "SIL":
            foil = "SILVER"
        series = f"Series {metadata.group(2).title()}"
        observed[(series, foil)] += 1

        if not team:
            raise SystemExit(f"Certified Autograph #{number} {name} missing team")

        key = {
            "BLUE": "certified-autographs-blue",
            "SILVER": "certified-autographs-silver",
            "GOLD": "certified-autographs-gold",
        }[foil]
        grouped[key].append((number, name, team, series))

    if dict(observed) != AUTO_EXPECTED:
        raise SystemExit(
            f"Certified Autograph foil/series distribution changed: "
            f"{dict(observed)!r}; expected {AUTO_EXPECTED!r}"
        )
    return grouped


def fetch_box_checklists() -> list[tuple[str, str, str, str, str, str]]:
    url = (
        "https://www.tcdb.com/Checklist.cfm/sid/309944/"
        "1999-Bowman---Checklists-/-Certificate-Requests"
    )
    parser = Rows()
    parser.feed(fetch(url))
    rows = []
    for row in parser.rows:
        values = [v.strip() for v in row if v.strip()]
        for idx, value in enumerate(values):
            if value.upper() != "NNO" or idx + 1 >= len(values):
                continue
            raw = values[idx + 1]
            if "Series One Checklist" in raw:
                rows.append((
                    "checklists-certificate-requests",
                    "S1-NNO",
                    "Series One Checklist / Certificate Request",
                    "",
                    "Checklist",
                    "Series One",
                ))
            elif "Series Two Checklist" in raw:
                rows.append((
                    "checklists-certificate-requests",
                    "S2-NNO",
                    "Series Two Checklist / Certificate Request",
                    "",
                    "Checklist",
                    "Series Two",
                ))
            break
    if len(rows) != 2 or len({row[1] for row in rows}) != 2:
        raise SystemExit(
            f"Expected two box checklist/certificate cards; found {len(rows)}"
        )
    return rows


def self_test() -> None:
    if clean_subject("Calvin Murray UERMarked as Bowman Rookie Card but first Bowman card is 1992") != "Calvin Murray":
        raise SystemExit("Run-together TCDB UER annotation regression")
    if clean_subject("Paul Hoover RC, UER") != "Paul Hoover":
        raise SystemExit("RC/UER normalization regression")
    if clean_subject("Ben Grieve SN99") != "Ben Grieve":
        raise SystemExit("SN99 normalization regression")
    if clean_subject("Ruben Mateo AU, BLUE Series One") != "Ruben Mateo":
        raise SystemExit("Autograph normalization regression")
    if not re.search(
        r"\\b(BLUE|SILVER|SIL|GOLD)\\s*Series\\s*(One|Two)\\b",
        "Ruben Mateo AU, BLUESeries One",
        re.IGNORECASE,
    ):
        raise SystemExit("Joined autograph foil/series parser regression")
    if sum(AUTO_EXPECTED.values()) != 70:
        raise SystemExit("Expected 70 Certified Autographs")
    if sum(v for (series, foil), v in AUTO_EXPECTED.items() if foil == "BLUE") != 40:
        raise SystemExit("Expected 40 Blue Certified Autographs")
    print("1999 Bowman offline self-tests passed", flush=True)


def main() -> None:
    self_test()

    source_cards = {}
    for key, (sid, expected, pattern) in SOURCES.items():
        source_cards[key] = fetch_cards(
            checklist_url(sid),
            expected,
            key,
            pattern,
        )

    base = source_cards["base"]
    verify_base_numbering(base)
    rookies = fetch_rookies(base)

    parallel_issues: list[str] = []
    gold = verify_parallel("gold", source_cards["gold"], base, parallel_issues)
    international = verify_parallel(
        "international", source_cards["international"], base, parallel_issues
    )
    if parallel_issues:
        print("=== ALL PARALLEL SOURCE DISCREPANCIES ===", flush=True)
        for issue in parallel_issues:
            print("  " + issue, flush=True)
        raise SystemExit(
            f"{len(parallel_issues)} parallel discrepancies need review; "
            "NO CSV written"
        )

    auto_groups = parse_autographs(source_cards["certified-autographs"])

    rows: list[tuple[str, str, str, str, str, str]] = []

    for number in sorted(base, key=int):
        name, team, _raw = base[number]
        if not team:
            raise SystemExit(f"Base #{number} {name} missing team")
        if number in rookies:
            name += " RC"
        rows.append(("base", number, name, team, "", ""))

    for set_key, cards, variant in (
        ("gold", gold, "Gold SN99"),
        ("international", international, "International"),
    ):
        for number in sorted(cards, key=int):
            name, team, _raw = cards[number]
            if not team:
                raise SystemExit(f"{set_key} #{number} {name} missing team")
            rows.append((set_key, number, name, team, "", variant))

    insert_variants = {
        "roy-favorites": "2000 Rookie of the Year Favorites",
        "early-risers": "Early Risers",
        "late-bloomers": "Late Bloomers",
        "scouts-choice": "Scouts' Choice",
    }
    for set_key in ("roy-favorites", "early-risers", "late-bloomers", "scouts-choice"):
        cards = source_cards[set_key]
        def sort_insert(item):
            m = re.search(r"(\d+)$", item)
            return int(m.group(1)) if m else 0
        for number in sorted(cards, key=sort_insert):
            name, team, _raw = cards[number]
            if not team:
                raise SystemExit(f"{set_key} #{number} {name} missing team")
            rows.append(
                (set_key, number, name, team, "", insert_variants[set_key])
            )

    auto_variant = {
        "certified-autographs-blue": "Blue Foil Certified Autograph",
        "certified-autographs-silver": "Silver Foil Certified Autograph",
        "certified-autographs-gold": "Gold Foil Certified Autograph",
    }
    for set_key in (
        "certified-autographs-blue",
        "certified-autographs-silver",
        "certified-autographs-gold",
    ):
        for number, name, team, series in auto_groups[set_key]:
            rows.append(
                (set_key, number, name, team, series, auto_variant[set_key])
            )

    rows.extend(fetch_box_checklists())

    expected_total = 440 + 440 + 440 + 10 + 11 + 10 + 21 + 40 + 20 + 10 + 2
    if len(rows) != expected_total:
        raise SystemExit(
            f"Expected {expected_total} collectible rows; got {len(rows)}"
        )

    seen = set()
    for row in rows:
        identity = (row[0], row[1])
        if identity in seen:
            raise SystemExit(f"Duplicate ProductSet/cardNumber key: {identity}")
        seen.add(identity)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(rows)

    counts = Counter(row[0] for row in rows)
    print("=== 1999 BOWMAN BASEBALL GENERATED ===")
    print(f"Product Sets: {len(counts)}")
    print(f"Collectible cards: {len(rows)}")
    for key in sorted(counts):
        print(f"  {key}: {counts[key]}")
    print(f"True Base RCs: {len(rookies)}")
    print("Physical Series 1/2 combined into one 440-card Base")
    print("Pre-Production 6-card dealer promo excluded")
    print(f"CSV: {OUTPUT}")
    print("Status: UNRELEASED; images/pricing/release QA pending")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run offline regression tests only; no TCDB requests",
    )
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        main()
