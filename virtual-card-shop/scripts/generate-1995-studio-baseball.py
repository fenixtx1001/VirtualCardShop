from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1995-studio-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/586/1995-Studio"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/586/1995-Studio"
GOLD_URL = "https://www.tcdb.com/Checklist.cfm/sid/587/1995-Studio-Gold"
PLATINUM_URL = "https://www.tcdb.com/Checklist.cfm/sid/588/1995-Studio-Platinum"

SOURCES = [
    {"key": "gold", "url": GOLD_URL, "expected": 50, "subset": "Gold"},
    {"key": "platinum", "url": PLATINUM_URL, "expected": 25, "subset": "Platinum"},
]

EXPECTED_COUNTS = {"base": 200, "gold": 50, "platinum": 25}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())
EXPECTED_PRODUCT_SETS = len(EXPECTED_COUNTS)
EXPECTED_TRUE_RCS = 0


class RowParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.in_tr = False
        self.in_td = False
        self.row: list[str] = []
        self.cell: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag == "tr":
            self.in_tr = True
            self.row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.cell = []

    def handle_data(self, data: str) -> None:
        if self.in_td:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "td" and self.in_td:
            self.row.append(" ".join("".join(self.cell).split()))
            self.in_td = False
            self.cell = []
        elif tag == "tr" and self.in_tr:
            if self.row:
                self.rows.append(self.row)
            self.in_tr = False
            self.row = []


def fetch(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def page_url(url: str, page_index: int) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}PageIndex={page_index}"


def parse_rows(html: str, number_pattern: str) -> list[tuple[str, str, str]]:
    parser = RowParser()
    parser.feed(html)
    pattern = re.compile(rf"^(?:{number_pattern})$", re.IGNORECASE)
    found: list[tuple[str, str, str]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            card_number = value.strip()
            if not pattern.fullmatch(card_number):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[i + 2].strip() if i + 2 < len(vals) else ""
            found.append((card_number.upper(), raw_name, team))
            break

    return found


def fetch_numbered_set(
    url: str,
    expected: int,
    *,
    max_pages: int = 5,
) -> list[tuple[str, str, str]]:
    cards: dict[int, tuple[str, str, str]] = {}

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), r"\d{1,3}")
        before = len(cards)

        for raw_number, raw_name, team in parsed:
            number = int(raw_number)
            if 1 <= number <= expected:
                cards[number] = (raw_number, raw_name, team)

        added = len(cards) - before
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique {len(cards)}"
        )

        if len(cards) == expected:
            break
        if page_index > 1 and not parsed:
            break

    required = set(range(1, expected + 1))
    actual = set(cards)
    if actual != required:
        missing = sorted(required - actual)
        extra = sorted(actual - required)
        raise SystemExit(
            f"{url}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    return [cards[number] for number in range(1, expected + 1)]


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)

NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:(?:RC|ROO|UER|ERR|COR|VAR|SP|MEM|AU|CUT|EXCH)+|"
    r"PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def normalize_repeated_markers(text: str) -> str:
    for marker in ("MEM", "AU", "VAR", "ERR", "COR", "UER", "RC", "ROO"):
        text = re.sub(
            rf"\b(?:{marker}){{2,}}\b",
            marker,
            text,
            flags=re.IGNORECASE,
        )
    return text


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split())
    match = NOTE_START.search(raw)

    if match:
        player = raw[: match.start()].strip().rstrip(",")
        notes = raw[match.start() :].strip(" ,;")
    else:
        player = raw.strip().rstrip(",")
        notes = ""

    if not player:
        raise SystemExit(f"Could not derive clean player/subject from {raw_name!r}")

    # TCDB renders the two checklist subjects as e.g. "Checklist: 1-100 CL".
    # CL is source metadata, not part of the display-facing subject.
    if player.lower().startswith("checklist"):
        player = re.sub(r"\s+CL$", "", player, flags=re.IGNORECASE).strip()

    notes = normalize_repeated_markers(notes)
    notes = ODDS_TEXT.sub("", notes)
    notes = re.sub(r"\b(?:RC|ROO)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*,+", ", ", notes)
    notes = re.sub(r"^[,;\s]+|[,;\s]+$", "", notes)
    return player, notes


def variant_text(*parts: str) -> str:
    seen: list[str] = []
    for part in parts:
        cleaned = ODDS_TEXT.sub("", part or "").strip(" ,;")
        cleaned = normalize_repeated_markers(cleaned)
        if not cleaned:
            continue
        cleaned = re.sub(r"\s*,\s*", "; ", cleaned)
        for piece in [item.strip() for item in cleaned.split(";") if item.strip()]:
            if piece not in seen:
                seen.append(piece)
    return "; ".join(seen)


def normalize_team(player: str, raw_team: str) -> str:
    team = " ".join(raw_team.split()).strip()
    if team:
        return team

    # Checklist cards represent the league-wide product checklist and do not
    # belong to one club. Preserve complete team data with the neutral MLB value.
    if player.lower().startswith("checklist"):
        return "MLB"

    raise SystemExit(f"{player} is missing team data")


def validate_no_true_rookies() -> None:
    print("rookie-index:")
    rows = parse_rows(fetch(page_url(ROOKIES_URL, 1)), r"\d{1,3}")
    recognized = {
        int(card_number)
        for card_number, _raw_name, _team in rows
        if card_number.isdigit() and 1 <= int(card_number) <= 200
    }
    print(
        f"  page 1: parsed {len(rows)} rows; "
        f"{len(recognized)} unique recognized RC card numbers"
    )

    if len(recognized) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            "1995 Studio rookie index changed; "
            f"expected {EXPECTED_TRUE_RCS}, found {len(recognized)}: "
            f"{sorted(recognized)}"
        )


def build_base_rows() -> list[list[str]]:
    print("base:")
    parsed = fetch_numbered_set(BASE_URL, 200)
    rows: list[list[str]] = []

    for raw_number, raw_name, raw_team in parsed:
        player, source_notes = clean_player_and_notes(raw_name)
        try:
            team = normalize_team(player, raw_team)
        except SystemExit as exc:
            raise SystemExit(f"Base #{raw_number} {exc}") from None

        subset = "Checklist" if player.lower().startswith("checklist") else ""

        rows.append(
            [
                "base",
                raw_number,
                player,
                team,
                subset,
                variant_text(source_notes),
            ]
        )

    return rows


def build_insert_rows(
    source: dict[str, object],
    base_by_number: dict[int, list[str]],
) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    subset = str(source["subset"])

    print(f"{key}:")
    parsed = fetch_numbered_set(url, expected)
    rows: list[list[str]] = []

    for raw_number, raw_name, raw_team in parsed:
        number = int(raw_number)
        player, source_notes = clean_player_and_notes(raw_name)
        try:
            team = normalize_team(player, raw_team)
        except SystemExit as exc:
            raise SystemExit(f"{key} #{raw_number} {exc}") from None

        # Gold #1-50 and Platinum #1-25 intentionally mirror the first portion
        # of the flagship checklist. Validate that TCDB has not drifted or been
        # misparsed rather than silently creating mismatched insert subjects.
        base = base_by_number[number]
        if player != base[2] or team != base[3]:
            raise SystemExit(
                f"{key} #{number} does not match Base #{number}: "
                f"insert=({player!r}, {team!r}), base=({base[2]!r}, {base[3]!r})"
            )

        rows.append(
            [
                key,
                raw_number,
                player,
                team,
                subset,
                variant_text(source_notes),
            ]
        )

    return rows


def main() -> None:
    validate_no_true_rookies()

    all_rows = build_base_rows()
    actual_counts: dict[str, int] = {"base": len(all_rows)}
    base_by_number = {
        int(row[1]): row
        for row in all_rows
        if row[0] == "base"
    }

    for source in SOURCES:
        key = str(source["key"])
        rows = build_insert_rows(source, base_by_number)
        all_rows.extend(rows)
        actual_counts[key] = len(rows)

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} explicit rows, found {len(all_rows)}"
        )

    rc_labels = [row for row in all_rows if row[2].endswith(" RC")]
    if rc_labels:
        raise SystemExit(
            f"Unexpected RC labels in a zero-RC set; example: {rc_labels[0]}"
        )

    bad_odds = [
        (row[0], row[1], row[5])
        for row in all_rows
        if re.search(r"\b(?:inserted\s+)?1\s*:\s*\d+\b", row[5], re.IGNORECASE)
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant metadata: {bad_odds[:10]}")

    dirty_players = [
        (row[0], row[1], row[2])
        for row in all_rows
        if re.search(
            r"\b(?:UER|ERR|COR|VAR|MEM|AU|PR\d+|SN\d+)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if dirty_players:
        raise SystemExit(
            f"Collector metadata leaked into Player; example: {dirty_players[0]}"
        )

    missing_teams = [row for row in all_rows if not row[3].strip()]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} cards missing team data; "
            f"example: {missing_teams[0]}"
        )

    base_lookup = {
        int(row[1]): row
        for row in all_rows
        if row[0] == "base"
    }
    expected_checklists = {
        199: "Checklist: 1-100",
        200: "Checklist: 101-200",
    }
    for number, expected_player in expected_checklists.items():
        row = base_lookup[number]
        if row[2] != expected_player or row[3] != "MLB" or row[4] != "Checklist":
            raise SystemExit(
                f"Checklist normalization failed for Base #{number}: {row}; "
                f"expected player={expected_player!r}, team='MLB', subset='Checklist'"
            )

    # Spot-check recognizable cards and insert mirrors.
    expected_spots = {
        ("base", "1"): ("Frank Thomas", "Chicago White Sox"),
        ("base", "5"): ("Ken Griffey Jr.", "Seattle Mariners"),
        ("gold", "18"): ("Alex Rodriguez", "Seattle Mariners"),
        ("platinum", "8"): ("Cal Ripken Jr.", "Baltimore Orioles"),
    }
    row_lookup = {(row[0], row[1]): row for row in all_rows}
    for key, (expected_player, expected_team) in expected_spots.items():
        row = row_lookup.get(key)
        if not row or row[2] != expected_player or row[3] != expected_team:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; "
                f"expected ({expected_player!r}, {expected_team!r})"
            )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1995 STUDIO BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print("Recognized true RC cards labeled in Base player row: 0")
    print("Checklist #199-200 normalized to team MLB / subset Checklist")
    print("Gold subjects validated against Base #1-50")
    print("Platinum subjects validated against Base #1-25")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
