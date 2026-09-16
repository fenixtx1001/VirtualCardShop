from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1998-collectors-edge-advantage-football.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/4198/1998-Collectors-Edge-Advantage"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/4198/1998-Collectors-Edge-Advantage"

SOURCES = {
    "base": (BASE_URL, r"\d{1,3}[A-Za-z]?", 200, "Base"),
    "50-point": ("https://www.tcdb.com/Checklist.cfm/sid/34583/1998-Collectors-Edge-Advantage-50-Point", r"\d{1,3}", 180, "50-Point"),
    "gold": ("https://www.tcdb.com/Checklist.cfm/sid/34584/1998-Collectors-Edge-Advantage-Gold", r"\d{1,3}", 180, "Gold"),
    "silver": ("https://www.tcdb.com/Checklist.cfm/sid/34590/1998-Collectors-Edge-Advantage-Silver", r"\d{1,3}", 200, "Silver"),
    "livin-large": ("https://www.tcdb.com/Checklist.cfm/sid/4199/1998-Collectors-Edge-Advantage-Livin-Large", r"\d{1,3}", 22, "Livin' Large"),
    "livin-large-holofoil": ("https://www.tcdb.com/Checklist.cfm/sid/34585/1998-Collectors-Edge-Advantage-Livin-Large-Holofoil", r"\d{1,3}", 22, "Livin' Large Holofoil"),
    "memorable-moments": ("https://www.tcdb.com/Checklist.cfm/sid/34586/1998-Collectors-Edge-Advantage-Memorable-Moments", r"[A-Za-z]{1,3}-\d+", 13, "Memorable Moments"),
    "personal-victory": ("https://www.tcdb.com/Checklist.cfm/sid/34587/1998-Collectors-Edge-Advantage-Personal-Victory", r"[A-Za-z]{1,3}-\d+", 6, "Personal Victory"),
    "prime-connection": ("https://www.tcdb.com/Checklist.cfm/sid/4200/1998-Collectors-Edge-Advantage-Prime-Connection", r"\d{1,3}", 25, "Prime Connection"),
    "showtime": ("https://www.tcdb.com/Checklist.cfm/sid/4201/1998-Collectors-Edge-Advantage-Showtime", r"\d{1,3}", 23, "Showtime"),
    "showtime-holofoil": ("https://www.tcdb.com/Checklist.cfm/sid/34588/1998-Collectors-Edge-Advantage-Showtime-Holofoil", r"\d{1,3}", 23, "Showtime Holofoil"),
}

NUMERIC_RANGES = {
    "base": (1, 200),
    "50-point": (1, 180),
    "gold": (1, 180),
    "silver": (1, 200),
}

EXPECTED_TOTAL = sum(value[2] for value in SOURCES.values())


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
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def page_url(url: str, page_index: int) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}PageIndex={page_index}"


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
            found.append((card_number.upper(), raw_name, team))
            break

    return found


def normalize_numeric_variant(number: str) -> str:
    """Collapse TCDB lettered labels such as 196a/196b to logical #196."""
    raw = number.strip().upper()
    match = re.fullmatch(r"(\d{1,3})[A-Z]", raw)
    return match.group(1) if match else raw


def logical_numbers(
    rows: list[tuple[str, str, str]], *, normalize_letters: bool
) -> set[str]:
    return {
        normalize_numeric_variant(number) if normalize_letters else number
        for number, _name, _team in rows
    }


def fetch_set_rows(
    url: str,
    number_pattern: str,
    label: str,
    *,
    expected_unique: int | None = None,
    numeric_range: tuple[int, int] | None = None,
    normalize_letters: bool = False,
    max_pages: int = 8,
) -> list[tuple[str, str, str]]:
    """Fetch only as many TCDB pages as are needed to complete the checklist.

    TCDB checklist pages can contain unrelated numeric tables after the actual
    checklist pagination is exhausted. Stopping when the expected logical
    checklist is complete prevents those rows from leaking into Set Factory.
    """
    rows: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    print(f"{label}:")
    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        added = 0
        for row in parsed:
            if row in seen:
                continue
            seen.add(row)
            rows.append(row)
            added += 1

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; unique records {len(rows)}"
        )

        numbers = logical_numbers(rows, normalize_letters=normalize_letters)

        if numeric_range is not None:
            first, last = numeric_range
            required = {str(n) for n in range(first, last + 1)}
            if required.issubset(numbers):
                break
        elif expected_unique is not None and len(numbers) >= expected_unique:
            break

        if page_index > 1 and (not parsed or added == 0):
            break

    return rows


META_START = re.compile(
    r"(?:^|\s)(?=(?:RC|ERR|COR|UER|VAR|MEM|AU|AUTO|SN\d+|PR\d+|SAM|SP|EXCH|RDM)\b)",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split())
    match = META_START.search(raw)
    if match:
        player = raw[: match.start()].strip().rstrip(",")
        notes = raw[match.start() :].strip(" ,;")
    else:
        player = raw.strip().rstrip(",")
        notes = ""

    notes = re.sub(r"\bRC\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*", "; ", notes)
    notes = re.sub(r"\s*;\s*;\s*", "; ", notes)
    return player, notes.strip(" ;,")


def variant_text(*parts: str) -> str:
    out: list[str] = []
    for part in parts:
        for piece in re.split(r"\s*;\s*|\s*,\s*", part or ""):
            piece = piece.strip()
            if piece and piece not in out:
                out.append(piece)
    return "; ".join(out)


def load_true_rc_numbers() -> set[str]:
    rows = fetch_set_rows(
        ROOKIES_URL,
        r"\d{1,3}[A-Za-z]?",
        "rookie-index",
        normalize_letters=True,
        max_pages=6,
    )
    rc_numbers = {
        normalize_numeric_variant(number) for number, _name, _team in rows
    }
    print(
        f"Rookie index: {len(rows)} records; "
        f"{len(rc_numbers)} unique recognized RC card numbers"
    )
    return rc_numbers


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def build_set(
    key: str,
    url: str,
    pattern: str,
    expected: int,
    subset: str,
    true_rcs: set[str],
) -> list[list[str]]:
    source_rows = fetch_set_rows(
        url,
        pattern,
        key,
        expected_unique=expected,
        numeric_range=NUMERIC_RANGES.get(key),
        normalize_letters=(key == "base"),
    )

    grouped: dict[str, list[tuple[str, str, str]]] = {}
    for source_number, raw_name, team in source_rows:
        number = (
            normalize_numeric_variant(source_number)
            if key == "base"
            else source_number
        )
        grouped.setdefault(number, []).append((source_number, raw_name, team))

    if len(grouped) != expected:
        raise SystemExit(
            f"{key}: expected {expected} unique card numbers, found {len(grouped)}"
        )

    if key in NUMERIC_RANGES:
        first, last = NUMERIC_RANGES[key]
        expected_numbers = {str(n) for n in range(first, last + 1)}
        if set(grouped) != expected_numbers:
            missing = sorted(expected_numbers - set(grouped), key=int)
            extra = sorted(set(grouped) - expected_numbers, key=int)
            raise SystemExit(
                f"{key}: numbering mismatch; "
                f"missing={missing[:20]}, extra={extra[:20]}"
            )

    def sort_key(card_number: str):
        match = re.search(r"(\d+)$", card_number)
        return (int(match.group(1)) if match else 999999, card_number)

    rows: list[list[str]] = []
    for number in sorted(grouped, key=sort_key):
        versions = grouped[number]

        # TCDB lists Randy Moss as 196a (ERR) and 196b (COR). VCS keeps one
        # logical #196 card only, sourced from the corrected 196b entry. The
        # ERR/COR distinction is intentionally omitted from Variant.
        if key == "base" and number == "196":
            corrected = [
                version for version in versions if version[0].upper() == "196B"
            ]
            if len(corrected) != 1:
                raise SystemExit(
                    "base #196: expected exactly one corrected 196b row, "
                    f"found {len(corrected)}"
                )
            _source_number, raw_name, team = corrected[0]
            player, _notes = clean_player_and_notes(raw_name)
            version_notes: list[str] = []
        else:
            _source_number, raw_name, team = versions[0]
            player, notes = clean_player_and_notes(raw_name)
            version_notes = [notes]

            for _other_number, other_name, other_team in versions[1:]:
                other_player, other_notes = clean_player_and_notes(other_name)
                if other_player != player:
                    raise SystemExit(
                        f"{key} #{number}: variant rows have different subjects: "
                        f"{player!r} vs {other_player!r}"
                    )
                if team and other_team and other_team != team:
                    raise SystemExit(
                        f"{key} #{number}: variant rows have different teams: "
                        f"{team!r} vs {other_team!r}"
                    )
                if not team:
                    team = other_team
                version_notes.append(other_notes)

        if key == "base" and number in true_rcs:
            player = f"{player} RC"

        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"{key} #{number} {player} is missing team data")

        rows.append(
            [key, number, player, team, subset, variant_text(*version_notes)]
        )

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    all_rows: list[list[str]] = []

    for key, (url, pattern, expected, subset) in SOURCES.items():
        all_rows.extend(
            build_set(key, url, pattern, expected, subset, true_rcs)
        )

    counts = {key: 0 for key in SOURCES}
    for row in all_rows:
        counts[row[0]] += 1

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(
            f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}"
        )

    odds_leaks = [
        row
        for row in all_rows
        if re.search(r"\b1\s*:\s*\d+", row[5] or "")
    ]
    if odds_leaks:
        raise SystemExit(
            f"Card-level odds leaked into Variant; example: {odds_leaks[0]}"
        )

    suspicious_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:ERR|COR|UER|MEM|SN\d+|PR\d+|SAM|Variation|Inserted)\b",
            row[2],
            re.IGNORECASE,
        )
    ]
    if suspicious_players:
        raise SystemExit(
            f"Metadata leaked into Player; example: {suspicious_players[0]}"
        )

    missing_teams = [
        row
        for row in all_rows
        if not row[3].strip() and not is_checklist_card(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} non-checklist cards missing team data; "
            f"example: {missing_teams[0]}"
        )

    moss_rows = [
        row for row in all_rows if row[0] == "base" and row[1] == "196"
    ]
    if (
        len(moss_rows) != 1
        or moss_rows[0][2] != "Randy Moss RC"
        or moss_rows[0][5]
    ):
        raise SystemExit(f"Randy Moss #196 normalization failed: {moss_rows}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(
            ["setKey", "cardNumber", "player", "team", "subset", "variant"]
        )
        writer.writerows(all_rows)

    print("=== 1998 COLLECTOR'S EDGE ADVANTAGE FOOTBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key in SOURCES:
        print(f"  {key}: {counts[key]}")
    print(
        "Recognized true RC cards labeled in Base player row: "
        f"{len(true_rcs)}"
    )
    print(
        "Randy Moss #196: one VCS card, corrected 196b source retained, "
        "ERR/COR Variant omitted"
    )
    print(f"Expected Product Sets: {len(SOURCES)}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Team data: COMPLETE (checklist-card exception allowed)")


if __name__ == "__main__":
    main()
