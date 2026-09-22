from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1997-ultra-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/1081/1997-Ultra"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/1081/1997-Ultra"

# Gold Medallion, Platinum Medallion, and Top 30 Gold Medallion are generated
# by Set Factory from their source checklists, so they are intentionally not
# duplicated as explicit CSV rows here.
SOURCES = [
    {"key": "baseball-rules", "url": "https://www.tcdb.com/Checklist.cfm/sid/1082/1997-Ultra-Baseball-Rules", "expected": 10, "pattern": r"\d{1,2}", "subset": "Baseball Rules!", "numeric": True},
    {"key": "checklists-s1", "url": "https://www.tcdb.com/Checklist.cfm/sid/1083/1997-Ultra-Checklists-Series-One", "expected": 10, "pattern": r"\d{1,2}", "subset": "Checklists (Series One)", "numeric": True},
    {"key": "checklists-s2", "url": "https://www.tcdb.com/Checklist.cfm/sid/149548/1997-Ultra-Checklists-Series-Two", "expected": 10, "pattern": r"\d{1,2}", "subset": "Checklists (Series Two)", "numeric": True},
    {"key": "diamond-producers", "url": "https://www.tcdb.com/Checklist.cfm/sid/1084/1997-Ultra-Diamond-Producers", "expected": 12, "pattern": r"\d{1,2}", "subset": "Diamond Producers", "numeric": True},
    {"key": "double-trouble", "url": "https://www.tcdb.com/Checklist.cfm/sid/1085/1997-Ultra-Double-Trouble", "expected": 20, "pattern": r"\d{1,2}", "subset": "Double Trouble", "numeric": True},
    {"key": "emerald-autographstix-redemptions", "url": "https://www.tcdb.com/Checklist.cfm/sid/10983/1997-Ultra-Emerald-Autographstix-Redemptions", "expected": 6, "pattern": r"(?:[A-Za-z]{0,4})?\d{1,2}", "subset": "Emerald Autographstix Redemptions", "numeric": False},
    {"key": "fame-game", "url": "https://www.tcdb.com/Checklist.cfm/sid/1086/1997-Ultra-Fame-Game", "expected": 18, "pattern": r"\d{1,2}", "subset": "Fame Game", "numeric": True},
    {"key": "fielders-choice", "url": "https://www.tcdb.com/Checklist.cfm/sid/1087/1997-Ultra-Fielders-Choice", "expected": 18, "pattern": r"\d{1,2}", "subset": "Fielder's Choice", "numeric": True},
    {"key": "golden-prospects", "url": "https://www.tcdb.com/Checklist.cfm/sid/1088/1997-Ultra-Golden-Prospects", "expected": 10, "pattern": r"\d{1,2}", "subset": "Golden Prospects", "numeric": True},
    {"key": "hideki-irabu-commemorative", "url": "https://www.tcdb.com/Checklist.cfm/sid/312014/1997-Ultra-Hideki-Irabu-Commemorative-Edition", "expected": 3, "pattern": r"CE\d", "subset": "Hideki Irabu Commemorative Edition", "numeric": False},
    {"key": "hideki-irabu-5x7", "url": "https://www.tcdb.com/Checklist.cfm/sid/10985/1997-Ultra-Hideki-Irabu-Commemorative-Edition-5x7", "expected": 4, "pattern": r"C\d", "subset": "Hideki Irabu Commemorative Edition 5x7", "numeric": False},
    {"key": "hitting-machines", "url": "https://www.tcdb.com/Checklist.cfm/sid/1089/1997-Ultra-Hitting-Machines", "expected": 18, "pattern": r"\d{1,2}", "subset": "Hitting Machines", "numeric": True},
    {"key": "hr-kings", "url": "https://www.tcdb.com/Checklist.cfm/sid/1090/1997-Ultra-HR-Kings-Home-Run-Kings", "expected": 12, "pattern": r"\d{1,2}", "subset": "HR Kings (Home Run Kings)", "numeric": True},
    {"key": "leather-shop", "url": "https://www.tcdb.com/Checklist.cfm/sid/1091/1997-Ultra-Leather-Shop", "expected": 12, "pattern": r"\d{1,2}", "subset": "Leather Shop", "numeric": True},
    {"key": "power-plus-s1", "url": "https://www.tcdb.com/Checklist.cfm/sid/1092/1997-Ultra-Power-Plus-Series-One", "expected": 12, "pattern": r"\d{1,2}", "subset": "Power Plus (Series One)", "numeric": True},
    {"key": "power-plus-s2", "url": "https://www.tcdb.com/Checklist.cfm/sid/149469/1997-Ultra-Power-Plus-Series-Two", "expected": 12, "pattern": r"\d{1,2}", "subset": "Power Plus (Series Two)", "numeric": True},
    {"key": "rbi-kings", "url": "https://www.tcdb.com/Checklist.cfm/sid/1094/1997-Ultra-RBI-Kings", "expected": 10, "pattern": r"\d{1,2}", "subset": "RBI Kings", "numeric": True},
    {"key": "rookie-reflections", "url": "https://www.tcdb.com/Checklist.cfm/sid/1095/1997-Ultra-Rookie-Reflections", "expected": 10, "pattern": r"\d{1,2}", "subset": "Rookie Reflections", "numeric": True},
    {"key": "season-crowns", "url": "https://www.tcdb.com/Checklist.cfm/sid/1096/1997-Ultra-Season-Crowns", "expected": 12, "pattern": r"\d{1,2}", "subset": "Season Crowns", "numeric": True},
    {"key": "starring-role", "url": "https://www.tcdb.com/Checklist.cfm/sid/1097/1997-Ultra-Starring-Role", "expected": 12, "pattern": r"\d{1,2}", "subset": "Starring Role", "numeric": True},
    {"key": "thunderclap", "url": "https://www.tcdb.com/Checklist.cfm/sid/1098/1997-Ultra-Thunderclap", "expected": 10, "pattern": r"\d{1,2}", "subset": "Thunderclap", "numeric": True},
    {"key": "top-30", "url": "https://www.tcdb.com/Checklist.cfm/sid/1099/1997-Ultra-Top-30", "expected": 30, "pattern": r"\d{1,2}", "subset": "Top 30", "numeric": True},
]

EXPECTED_TRUE_RCS = 28
EXPECTED_BASE = 553
EXPECTED_EXPLICIT = EXPECTED_BASE + sum(int(source["expected"]) for source in SOURCES) + 1
EXPECTED_RESOLVED = EXPECTED_EXPLICIT + EXPECTED_BASE + EXPECTED_BASE + 30


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

            team = vals[-1].strip() if i + 2 < len(vals) else ""
            if team == raw_name:
                team = ""
            found.append((card_number.upper(), raw_name, team))
            break

    return found


def fetch_set_rows(
    url: str,
    number_pattern: str,
    expected: int,
    label: str,
    *,
    numeric: bool,
    max_pages: int = 8,
) -> list[tuple[str, str, str]]:
    rows: dict[str, tuple[str, str, str]] = {}

    print(f"{label}:")
    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        before = len(rows)

        for number, raw_name, team in parsed:
            rows.setdefault(number.upper(), (number.upper(), raw_name, team))

        added = len(rows) - before
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique {len(rows)}"
        )

        if numeric:
            actual_numbers = {
                int(number) for number in rows if number.isdigit() and 1 <= int(number) <= expected
            }
            if actual_numbers == set(range(1, expected + 1)):
                break
        elif len(rows) >= expected:
            break

        if page_index > 1 and (not parsed or added == 0):
            break

    if numeric:
        expected_numbers = set(range(1, expected + 1))
        actual_numbers = {
            int(number) for number in rows if number.isdigit() and 1 <= int(number) <= expected
        }
        if actual_numbers != expected_numbers:
            missing = sorted(expected_numbers - actual_numbers)
            extra = sorted(actual_numbers - expected_numbers)
            raise SystemExit(
                f"{label}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
            )
        return [rows[str(number)] for number in range(1, expected + 1)]

    if len(rows) != expected:
        raise SystemExit(f"{label}: expected {expected} unique rows, found {len(rows)}")

    def natural_key(item: tuple[str, str, str]):
        number = item[0]
        match = re.search(r"(\d+)$", number)
        return (re.sub(r"\d+$", "", number), int(match.group(1)) if match else 999999, number)

    return sorted(rows.values(), key=natural_key)


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)

NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:RC|ROO|CL|UER|ERR|COR|VAR|SP|MEM|AU|AUTO|CUT|EXCH|RDM|"
    r"PR\d+|SN\d+|SAM)\b)",
    re.IGNORECASE,
)


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

    notes = ODDS_TEXT.sub("", notes)
    notes = re.sub(r"\b(?:RC|ROO)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*", "; ", notes)
    notes = re.sub(r"\s*;\s*;\s*", "; ", notes)
    return player, notes.strip(" ;,")


def variant_text(*parts: str) -> str:
    out: list[str] = []
    for part in parts:
        cleaned = ODDS_TEXT.sub("", part or "").strip(" ,;")
        if not cleaned:
            continue
        for piece in re.split(r"\s*;\s*|\s*,\s*", cleaned):
            piece = piece.strip()
            if piece and piece not in out:
                out.append(piece)
    return "; ".join(out)


def load_true_rc_numbers() -> set[str]:
    rows = fetch_set_rows(
        ROOKIES_URL,
        r"\d{1,3}",
        EXPECTED_TRUE_RCS,
        "rookie-index",
        numeric=False,
        max_pages=3,
    )
    rc_numbers = {number for number, _name, _team in rows if number.isdigit()}
    if len(rc_numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} recognized RC numbers, found {len(rc_numbers)}"
        )
    print(f"Rookie index: {len(rc_numbers)} recognized true RC card numbers")
    return rc_numbers


def normalize_team(player: str, team: str, subset: str) -> str:
    cleaned = " ".join(team.split()).strip()
    if cleaned:
        return cleaned

    if "checklist" in subset.lower() or "checklist" in player.lower():
        return "MLB"

    raise SystemExit(f"{subset}: {player} is missing team data")


def build_base_rows(true_rcs: set[str]) -> list[list[str]]:
    parsed = fetch_set_rows(
        BASE_URL,
        r"\d{1,3}",
        EXPECTED_BASE,
        "base",
        numeric=True,
        max_pages=8,
    )

    rows: list[list[str]] = []
    for number, raw_name, raw_team in parsed:
        player, notes = clean_player_and_notes(raw_name)
        team = normalize_team(player, raw_team, "Base")

        if number in true_rcs:
            player = f"{player} RC"

        rows.append(["base", number, player, team, "", variant_text(notes)])

    return rows


def build_source_rows(source: dict[str, object]) -> list[list[str]]:
    key = str(source["key"])
    expected = int(source["expected"])
    subset = str(source["subset"])
    parsed = fetch_set_rows(
        str(source["url"]),
        str(source["pattern"]),
        expected,
        key,
        numeric=bool(source["numeric"]),
    )

    rows: list[list[str]] = []
    for number, raw_name, raw_team in parsed:
        player, notes = clean_player_and_notes(raw_name)
        team = normalize_team(player, raw_team, subset)
        rows.append([key, number, player, team, subset, variant_text(notes)])
    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    all_rows = build_base_rows(true_rcs)
    counts: dict[str, int] = {"base": len(all_rows)}

    for source in SOURCES:
        rows = build_source_rows(source)
        all_rows.extend(rows)
        counts[str(source["key"])] = len(rows)

    # TCDB catalogs this as a standalone insert on the parent set rather than
    # as an Insert Set with its own checklist page.
    all_rows.append(
        [
            "andruw-jones-autograph",
            "NNO",
            "Andruw Jones",
            "Atlanta Braves",
            "Autograph",
            "AU",
        ]
    )
    counts["andruw-jones-autograph"] = 1

    if len(all_rows) != EXPECTED_EXPLICIT:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT} explicit CSV rows, found {len(all_rows)}"
        )

    rc_rows = [row for row in all_rows if row[2].endswith(" RC")]
    if len(rc_rows) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} true RC labels, found {len(rc_rows)}"
        )
    if any(row[0] != "base" for row in rc_rows):
        raise SystemExit("RC labels leaked outside the Base player rows")

    odds_leaks = [
        row for row in all_rows if re.search(r"\b1\s*:\s*\d+\b", row[5] or "")
    ]
    if odds_leaks:
        raise SystemExit(
            f"Card-level odds leaked into Variant; example: {odds_leaks[0]}"
        )

    dirty_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:UER|ERR|COR|VAR|MEM|AU|AUTO|EXCH|RDM|PR\d+|SN\d+|SAM|CL)\b",
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
            f"Found {len(missing_teams)} rows missing team data; example: {missing_teams[0]}"
        )

    row_lookup = {(row[0], row[1]): row for row in all_rows}
    spot_checks = {
        ("base", "99"): ("Derek Jeter", "New York Yankees"),
        ("base", "121"): ("Ken Griffey, Jr.", "Seattle Mariners"),
        ("base", "518"): ("David Arias RC", "Minnesota Twins"),
        ("base", "553"): ("Hideki Irabu RC", "New York Yankees"),
        ("top-30", "9"): ("Derek Jeter", "New York Yankees"),
        ("thunderclap", "8"): ("Ken Griffey, Jr.", "Seattle Mariners"),
    }
    for key, (expected_player, expected_team) in spot_checks.items():
        row = row_lookup.get(key)
        if not row or row[2] != expected_player or row[3] != expected_team:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; "
                f"expected ({expected_player!r}, {expected_team!r})"
            )

    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1997 ULTRA BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key, count in counts.items():
        print(f"  {key}: {count}")
    print(f"Recognized true RC cards labeled in Base player row: {len(rc_rows)}")
    print("Derived Product Sets: Gold Medallion 553; Platinum Medallion 553; Top 30 Gold Medallion 30")
    print("Expected Product Sets: 27")
    print(f"Total resolved cards expected: {EXPECTED_RESOLVED}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Team data: COMPLETE")


if __name__ == "__main__":
    main()
