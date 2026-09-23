from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1999-score-football.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/4330/1999-Score"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/4330/1999-Score"

SOURCES = [
    {
        "key": "10th-anniversary-reprints",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35384/1999-Score---10th-Anniversary-Reprints",
        "pattern": r"\d{1,3}[A-Za-z]?",
        "expected": 20,
        "subset": "10th Anniversary Reprints",
    },
    {
        "key": "complete-players",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35387/1999-Score---Complete-Players",
        "pattern": r"\d{1,2}",
        "expected": 30,
        "subset": "Complete Players",
    },
    {
        "key": "future-franchise",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35389/1999-Score---Future-Franchise",
        "pattern": r"\d{1,2}",
        "expected": 31,
        "subset": "Future Franchise",
    },
    {
        "key": "millennium-men",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/4331/1999-Score---Millennium-Men",
        "pattern": r"\d{1,2}",
        "expected": 3,
        "subset": "Millennium Men",
    },
    {
        "key": "numbers-game",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35390/1999-Score---Numbers-Game",
        "pattern": r"\d{1,2}",
        "expected": 30,
        "subset": "Numbers Game",
    },
    {
        "key": "rookie-preview-autographs",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35391/1999-Score---Rookie-Preview-Autographs",
        "pattern": r"NNO",
        "expected": 35,
        "subset": "Rookie Preview Autographs",
        "physical_nno": True,
    },
    {
        "key": "scoring-core",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35392/1999-Score---Scoring-Core",
        "pattern": r"\d{1,2}",
        "expected": 30,
        "subset": "Scoring Core",
    },
    {
        "key": "settle-the-score",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35393/1999-Score---Settle-the-Score",
        "pattern": r"\d{1,2}",
        "expected": 30,
        "subset": "Settle the Score",
    },
    {
        "key": "the-franchise",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/35388/1999-Score---The-Franchise",
        "pattern": r"\d{1,2}",
        "expected": 31,
        "subset": "The Franchise",
    },
]

EXPECTED_BASE = 275
EXPECTED_TRUE_RCS = 40
EXPECTED_EXPLICIT = EXPECTED_BASE + sum(int(source["expected"]) for source in SOURCES)
EXPECTED_DERIVED = 20 + 3 + 275 + 275
EXPECTED_RESOLVED = EXPECTED_EXPLICIT + EXPECTED_DERIVED
EXPECTED_PRODUCT_SETS = 14


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
        for index, value in enumerate(vals):
            card_number = value.strip()
            if not pattern.fullmatch(card_number):
                continue
            if index + 1 >= len(vals):
                continue

            raw_name = vals[index + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[-1].strip() if index + 2 < len(vals) else ""
            found.append((card_number.upper(), raw_name, team))
            break

    return found


META_TOKEN = re.compile(
    r"\b(?:RC|ROO|AP|GC|UER|ERR|COR|VAR|AU|AUTO|MEM|SN\d+|PR\d+|RDM|EXCH|SP)\b",
    re.IGNORECASE,
)

ODDS_TEXT = re.compile(
    r"(?:inserted\s+)?1\s*:\s*\d+(?:\s+packs?)?",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split()).strip()
    raw = ODDS_TEXT.sub("", raw).strip(" ,;")
    pieces = [piece.strip() for piece in re.split(r"\s*,\s*", raw) if piece.strip()]

    player_parts: list[str] = []
    notes: list[str] = []
    for piece in pieces:
        matches = META_TOKEN.findall(piece)
        if not matches:
            player_parts.append(piece)
            continue

        cleaned = piece
        for match in matches:
            upper = match.upper()
            if upper not in {"RC", "ROO", "AP", "GC", "SP"}:
                notes.append(upper)
            cleaned = re.sub(rf"\b{re.escape(match)}\b", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip(" ,;")
        if cleaned:
            player_parts.append(cleaned)

    player = " ".join(" ".join(player_parts).split()).strip(" ,;")
    if not player:
        raise SystemExit(f"Could not derive clean player/subject from {raw_name!r}")
    return player, "; ".join(dict.fromkeys(notes))


def variant_text(*parts: str) -> str:
    result: list[str] = []
    for part in parts:
        for piece in [item.strip() for item in (part or "").split(";") if item.strip()]:
            if piece not in result:
                result.append(piece)
    return "; ".join(result)


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def validate_team(card_number: str, player: str, team: str, subset: str) -> str:
    normalized = " ".join(team.split()).strip()
    if not normalized and not is_checklist_card(player, subset):
        raise SystemExit(f"{subset} #{card_number} {player} is missing team data")
    return normalized


def fetch_unique_rows(
    url: str,
    pattern: str,
    expected: int,
    label: str,
    *,
    max_pages: int = 6,
) -> list[tuple[str, str, str]]:
    found: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    print(f"{label}:")

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), pattern)
        added = 0
        for row in parsed:
            if row in seen:
                continue
            seen.add(row)
            found.append(row)
            added += 1

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique records {len(found)}"
        )
        if len(found) >= expected:
            break
        if page_index > 1 and (not parsed or added == 0):
            break

    if len(found) != expected:
        raise SystemExit(f"{label}: expected {expected} records, found {len(found)}")
    return found


def load_true_rc_numbers() -> set[str]:
    rows = fetch_unique_rows(
        ROOKIES_URL,
        r"\d{1,3}",
        EXPECTED_TRUE_RCS,
        "rookie-index",
        max_pages=4,
    )
    numbers = {number for number, _raw_name, _team in rows}
    if len(numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Rookie index expected {EXPECTED_TRUE_RCS} unique card numbers, found {len(numbers)}"
        )
    print(f"Rookie index: {len(numbers)} verified true RC numbers")
    return numbers


def base_subset(number: int) -> str:
    if 221 <= number <= 260:
        return "Rookie"
    if 261 <= number <= 270:
        return "All-Pro"
    if 271 <= number <= 275:
        return "Great Combos"
    return ""


def build_base(true_rcs: set[str]) -> list[list[str]]:
    source_rows = fetch_unique_rows(BASE_URL, r"\d{1,3}", EXPECTED_BASE, "base")
    grouped: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, raw_team in source_rows:
        number = int(raw_number)
        if not (1 <= number <= EXPECTED_BASE):
            continue
        if number in grouped:
            raise SystemExit(f"base: duplicate card number #{number}")
        player, notes = clean_player_and_notes(raw_name)
        subset = base_subset(number)
        team = validate_team(raw_number, player, raw_team, subset or "Base")
        if str(number) in true_rcs:
            player = f"{player} RC"
        grouped[number] = (player, team, notes)

    required = set(range(1, EXPECTED_BASE + 1))
    if set(grouped) != required:
        missing = sorted(required - set(grouped))
        extra = sorted(set(grouped) - required)
        raise SystemExit(
            f"base numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, EXPECTED_BASE + 1):
        player, team, notes = grouped[number]
        rows.append(["base", str(number), player, team, base_subset(number), notes])
    return rows


def build_insert(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    pattern = str(source["pattern"])
    expected = int(source["expected"])
    subset = str(source["subset"])
    physical_nno = bool(source.get("physical_nno", False))

    source_rows = fetch_unique_rows(url, pattern, expected, key)
    rows: list[list[str]] = []

    if physical_nno:
        for sequence, (_raw_number, raw_name, raw_team) in enumerate(source_rows, start=1):
            player, notes = clean_player_and_notes(raw_name)
            team = validate_team(str(sequence), player, raw_team, subset)
            rows.append(
                [
                    key,
                    str(sequence),
                    player,
                    team,
                    subset,
                    variant_text("Physical NNO", notes),
                ]
            )
        return rows

    by_number: dict[str, tuple[str, str, str]] = {}
    for number, raw_name, raw_team in source_rows:
        if number in by_number:
            raise SystemExit(f"{key}: duplicate card number {number}")
        player, notes = clean_player_and_notes(raw_name)
        team = validate_team(number, player, raw_team, subset)
        by_number[number] = (player, team, notes)

    def sort_key(number: str) -> tuple[int, str]:
        match = re.match(r"^(\d+)", number)
        return (int(match.group(1)) if match else 999999, number)

    for number in sorted(by_number, key=sort_key):
        player, team, notes = by_number[number]
        rows.append([key, number, player, team, subset, notes])
    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    all_rows = build_base(true_rcs)
    counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        rows = build_insert(source)
        all_rows.extend(rows)
        counts[str(source["key"])] = len(rows)

    if len(all_rows) != EXPECTED_EXPLICIT:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT} explicit CSV rows, found {len(all_rows)}"
        )

    rc_rows = [row for row in all_rows if row[2].endswith(" RC")]
    if len(rc_rows) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} true RC labels in Base, found {len(rc_rows)}"
        )
    if any(row[0] != "base" for row in rc_rows):
        raise SystemExit("RC label leaked outside Base")

    keys = {(row[0], row[1]) for row in all_rows}
    if len(keys) != len(all_rows):
        raise SystemExit("Duplicate ProductSet/cardNumber key detected")

    bad_odds = [row for row in all_rows if re.search(r"\b1\s*:\s*\d+\b", row[5] or "")]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant: {bad_odds[:5]}")

    dirty_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:UER|ERR|COR|VAR|AU|SN\d+|PR\d+|RDM|EXCH)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if dirty_players:
        raise SystemExit(f"Collector metadata leaked into Player: {dirty_players[:5]}")

    missing_teams = [
        row
        for row in all_rows
        if not row[3].strip() and not is_checklist_card(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(f"Unexpected missing team data: {missing_teams[:5]}")

    lookup = {(row[0], row[1]): row for row in all_rows}
    if lookup[("base", "1")][2:4] != ["Randy Moss", "Minnesota Vikings"]:
        raise SystemExit(f"Base #1 spot check failed: {lookup[(\"base\", \"1\")]}")
    if lookup[("base", "222")][2] != "Ricky Williams RC":
        raise SystemExit(f"Base #222 RC spot check failed: {lookup[(\"base\", \"222\")]}")
    if lookup[("complete-players", "21")][2:4] != ["Ricky Williams", "New Orleans Saints"]:
        raise SystemExit(
            f"Complete Players #21 spot check failed: {lookup[(\"complete-players\", \"21\")] }"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1999 SCORE FOOTBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Base cards: {counts['base']}")
    print(f"Verified true RC cards: {len(rc_rows)}")
    for source in SOURCES:
        key = str(source["key"])
        print(f"{key}: {counts[key]}")
    print(f"Explicit CSV rows: {len(all_rows)}")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_RESOLVED}")


if __name__ == "__main__":
    main()
