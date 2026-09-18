from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1999-00-spx-basketball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/2848/1999-00-SPx"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/2848/1999-00-SPx"
WINNING_MATERIALS_URL = (
    "https://www.tcdb.com/Checklist.cfm/sid/2850/1999-00-SPx---Winning-Materials"
)

SOURCES = [
    {
        "key": "radiance",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/26335/1999-00-SPx---Radiance",
        "expected": 120,
        "pattern": r"\d{1,3}",
        "subset": "",
    },
    {
        "key": "spectrum",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/26336/1999-00-SPx---Spectrum",
        "expected": 120,
        "pattern": r"\d{1,3}",
        "subset": "",
    },
    {
        "key": "decade-of-jordan",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/2849/1999-00-SPx---Decade-of-Jordan",
        "expected": 10,
        "pattern": r"J\d{1,2}",
        "subset": "Decade of Jordan",
    },
    {
        "key": "masters",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/26333/1999-00-SPx---Masters",
        "expected": 15,
        "pattern": r"M\d{1,2}",
        "subset": "Masters",
    },
    {
        "key": "prolifics",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/26334/1999-00-SPx---Prolifics",
        "expected": 15,
        "pattern": r"P\d{1,2}",
        "subset": "Prolifics",
    },
    {
        "key": "spxcitement",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/26337/1999-00-SPx---SPxcitement",
        "expected": 20,
        "pattern": r"S\d{1,2}",
        "subset": "SPxcitement",
    },
    {
        "key": "spxtreme",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/26338/1999-00-SPx---SPxtreme",
        "expected": 20,
        "pattern": r"X\d{1,2}",
        "subset": "SPxtreme",
    },
    {
        "key": "starscape",
        "url": "https://www.tcdb.com/Checklist.cfm/sid/26339/1999-00-SPx---Starscape",
        "expected": 10,
        "pattern": r"ST\d{1,2}",
        "subset": "Starscape",
    },
]

EXPECTED_COUNTS = {
    "base": 120,
    "radiance": 120,
    "spectrum": 120,
    "decade-of-jordan": 10,
    "masters": 15,
    "prolifics": 15,
    "spxcitement": 20,
    "spxtreme": 20,
    "starscape": 10,
    "winning-materials": 8,
    "winning-materials-autographs": 2,
    "master-collection-redemption": 1,
}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())
EXPECTED_PRODUCT_SETS = len(EXPECTED_COUNTS)
EXPECTED_TRUE_RCS = 30

# Published set structure: every base rookie #91-120 is serial numbered.
# Unsigned rookies are /3500; signed rookies are /2500 except these five /500.
# TCDB's checklist display currently omits the SN annotation on two rookie rows,
# so the generator fills the known serial tier when the source row omits it.
ROOKIE_SN500_NUMBERS = {92, 93, 96, 98, 103}


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


def fetch_set_rows(
    url: str,
    number_pattern: str,
    expected: int,
    *,
    max_pages: int = 8,
) -> list[tuple[str, str, str]]:
    cards: dict[str, tuple[str, str, str]] = {}

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        before = len(cards)
        for row in parsed:
            cards[row[0]] = row
        added = len(cards) - before
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique {len(cards)}"
        )

        if len(cards) >= expected:
            break
        if page_index > 1 and not parsed:
            break

    if len(cards) != expected:
        raise SystemExit(
            f"{url}: expected {expected} unique cards, found {len(cards)}"
        )

    return list(cards.values())


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)

# TCDB sometimes concatenates adjacent annotation labels in a card-name cell
# (for example MEMMEM: or VARVAR:). Repeated metadata tokens are therefore
# treated as one metadata boundary before display-facing player cleanup.
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

    notes = normalize_repeated_markers(notes)
    notes = ODDS_TEXT.sub("", notes)
    notes = re.sub(r"\b(?:RC|ROO)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\bVAR\s*:\s*$", "", notes, flags=re.IGNORECASE)
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


def expected_rookie_serial(number: int, variant: str) -> str:
    if number in ROOKIE_SN500_NUMBERS:
        return "SN500"
    if re.search(r"\bAU\b", variant, re.IGNORECASE):
        return "SN2500"
    return "SN3500"


def normalize_rookie_serial(number: int, variant: str) -> str:
    expected = expected_rookie_serial(number, variant)
    source_serials = re.findall(r"\bSN\d+\b", variant, re.IGNORECASE)

    if source_serials:
        normalized = {serial.upper() for serial in source_serials}
        if normalized != {expected}:
            raise SystemExit(
                f"Base #{number}: source serial metadata {sorted(normalized)} "
                f"conflicts with published SPx rookie tier {expected}"
            )
        return variant

    return variant_text(variant, expected)


def load_true_rc_numbers() -> set[int]:
    rookie_numbers: set[int] = set()

    print("rookie-index:")
    for page_index in range(1, 5):
        rows = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        for card_number, _raw_name, _team in rows:
            number = int(card_number)
            if 1 <= number <= 120:
                rookie_numbers.add(number)
        print(
            f"  page {page_index}: parsed {len(rows)} rows; "
            f"{len(rookie_numbers)} unique recognized RC card numbers"
        )
        if len(rookie_numbers) >= EXPECTED_TRUE_RCS:
            break

    if len(rookie_numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} recognized true RC cards from TCDB rookie index, "
            f"found {len(rookie_numbers)}"
        )

    return rookie_numbers


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    print("base:")
    source_rows = fetch_set_rows(BASE_URL, r"\d{1,3}", 120)
    cards: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, team in source_rows:
        number = int(raw_number)
        if 1 <= number <= 120:
            cards[number] = (raw_name, team)

    missing = [number for number in range(1, 121) if number not in cards]
    if missing:
        raise SystemExit(f"Base checklist incomplete; missing card numbers: {missing}")

    rows: list[list[str]] = []
    for number in range(1, 121):
        raw_name, team = cards[number]
        player, source_notes = clean_player_and_notes(raw_name)
        variant = variant_text(source_notes)

        if number in true_rcs:
            player = f"{player} RC"

        if 91 <= number <= 120:
            variant = normalize_rookie_serial(number, variant)

        if not team:
            raise SystemExit(f"Base #{number} {player} is missing team data")

        rows.append(
            [
                "base",
                str(number),
                player,
                team,
                "Rookie" if 91 <= number <= 120 else "",
                variant,
            ]
        )

    return rows


def build_source_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    url = str(source["url"])
    expected = int(source["expected"])
    pattern = str(source["pattern"])
    subset = str(source.get("subset", ""))

    print(f"{key}:")
    parsed = fetch_set_rows(url, pattern, expected)
    rows: list[list[str]] = []

    for card_number, raw_name, team in parsed:
        player, source_notes = clean_player_and_notes(raw_name)
        if not team:
            raise SystemExit(f"{key} #{card_number} {player} is missing team data")

        rows.append(
            [
                key,
                card_number,
                player,
                team,
                subset,
                variant_text(source_notes),
            ]
        )

    return rows


def build_winning_materials_rows() -> tuple[list[list[str]], list[list[str]]]:
    print("winning-materials:")
    parsed = fetch_set_rows(
        WINNING_MATERIALS_URL,
        r"WM\d{1,2}[A-Za-z]?",
        10,
        max_pages=3,
    )

    regular: list[list[str]] = []
    autographs: list[list[str]] = []

    for card_number, raw_name, team in parsed:
        player, source_notes = clean_player_and_notes(raw_name)
        if not team:
            raise SystemExit(
                f"winning-materials #{card_number} {player} is missing team data"
            )

        row = [
            "winning-materials-autographs"
            if card_number.upper().endswith("A")
            else "winning-materials",
            card_number,
            player,
            team,
            "Winning Materials Autographs"
            if card_number.upper().endswith("A")
            else "Winning Materials",
            variant_text(source_notes),
        ]

        if card_number.upper().endswith("A"):
            autographs.append(row)
        else:
            regular.append(row)

    expected_regular_numbers = {"WM1", "WM2", "WM4", "WM5", "WM6", "WM8", "WM9", "WM10"}
    actual_regular_numbers = {row[1].upper() for row in regular}
    if actual_regular_numbers != expected_regular_numbers:
        raise SystemExit(
            "Winning Materials ordinary checklist changed; "
            f"expected={sorted(expected_regular_numbers)}, "
            f"actual={sorted(actual_regular_numbers)}"
        )

    expected_auto_numbers = {"WM1A", "WM2A"}
    actual_auto_numbers = {row[1].upper() for row in autographs}
    if actual_auto_numbers != expected_auto_numbers:
        raise SystemExit(
            "Winning Materials autograph checklist changed; "
            f"expected={sorted(expected_auto_numbers)}, "
            f"actual={sorted(actual_auto_numbers)}"
        )

    return regular, autographs


def build_redemption_row() -> list[str]:
    return [
        "master-collection-redemption",
        "MCR",
        "Michael Jordan",
        "Chicago Bulls",
        "Master Collection Redemption",
        "Redemption; PR5",
    ]


def validate_base_metadata(rows: list[list[str]]) -> None:
    base = {int(row[1]): row for row in rows if row[0] == "base"}

    rc_rows = [row for row in base.values() if row[2].endswith(" RC")]
    if len(rc_rows) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} RC labels in Base, found {len(rc_rows)}"
        )

    serialized_rookies = [
        row for number, row in base.items() if 91 <= number <= 120 and "SN" in row[5]
    ]
    if len(serialized_rookies) != 30:
        raise SystemExit(
            "Expected all 30 base rookie cards #91-120 to retain serial-number metadata; "
            f"found {len(serialized_rookies)}"
        )

    autograph_rookies = [
        row for number, row in base.items() if 91 <= number <= 120 and "AU" in row[5]
    ]
    if len(autograph_rookies) != 20:
        raise SystemExit(
            f"Expected 20 autographed base rookie cards, found {len(autograph_rookies)}"
        )

    for number in range(91, 121):
        row = base[number]
        expected_sn = expected_rookie_serial(number, row[5])
        if expected_sn not in row[5]:
            raise SystemExit(
                f"Base #{number} serial normalization failed: {row}; "
                f"expected {expected_sn}"
            )

    checks = {
        91: ("Elton Brand RC", "SN3500"),
        92: ("Steve Francis RC", "SN500"),
        101: ("Trajan Langdon RC", "SN2500"),
    }
    for number, (expected_player, expected_sn) in checks.items():
        row = base[number]
        if row[2] != expected_player or expected_sn not in row[5]:
            raise SystemExit(
                f"Base #{number} metadata validation failed: {row}; "
                f"expected player={expected_player!r}, serial={expected_sn}"
            )


def validate_parallel_metadata(rows: list[list[str]]) -> None:
    radiance = [row for row in rows if row[0] == "radiance"]
    spectrum = [row for row in rows if row[0] == "spectrum"]

    if any("SN100" not in row[5] for row in radiance):
        example = next(row for row in radiance if "SN100" not in row[5])
        raise SystemExit(f"Radiance SN100 metadata missing; example: {example}")

    if any("SN1" not in row[5] for row in spectrum):
        example = next(row for row in spectrum if "SN1" not in row[5])
        raise SystemExit(f"Spectrum SN1 metadata missing; example: {example}")


def validate_winning_materials_metadata(rows: list[list[str]]) -> None:
    autos = {
        row[1].upper(): row
        for row in rows
        if row[0] == "winning-materials-autographs"
    }

    expected = {
        "WM1A": ("Michael Jordan", "SN23"),
        "WM2A": ("Karl Malone", "SN32"),
    }
    for number, (player, serial) in expected.items():
        row = autos.get(number)
        if not row:
            raise SystemExit(f"Missing Winning Materials autograph {number}")
        if row[2] != player or "AU" not in row[5] or "MEM" not in row[5] or serial not in row[5]:
            raise SystemExit(
                f"Winning Materials autograph metadata failed for {number}: {row}"
            )


def main() -> None:
    true_rcs = load_true_rc_numbers()
    all_rows = build_base_rows(true_rcs)
    actual_counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        key = str(source["key"])
        rows = build_source_rows(source)
        all_rows.extend(rows)
        actual_counts[key] = len(rows)

    regular_wm, autograph_wm = build_winning_materials_rows()
    all_rows.extend(regular_wm)
    all_rows.extend(autograph_wm)
    actual_counts["winning-materials"] = len(regular_wm)
    actual_counts["winning-materials-autographs"] = len(autograph_wm)

    redemption = build_redemption_row()
    all_rows.append(redemption)
    actual_counts["master-collection-redemption"] = 1

    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} explicit rows, found {len(all_rows)}"
        )

    validate_base_metadata(all_rows)
    validate_parallel_metadata(all_rows)
    validate_winning_materials_metadata(all_rows)

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

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1999-00 SPX BASKETBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, expected in EXPECTED_COUNTS.items():
        print(f"  {key}: {expected}")
    print(f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}")
    print("Base collector checklist: 120 cards, kept intact")
    print("Base rookie serial metadata: 30/30 retained")
    print("Base rookie autograph metadata: 20 cards retained")
    print("Radiance metadata: SN100 retained")
    print("Spectrum metadata: SN1 retained")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
