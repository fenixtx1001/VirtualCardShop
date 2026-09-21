from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1993-sp-football.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/3369/1993-SP"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/3369/1993-SP"
ALL_PRO_URL = "https://www.tcdb.com/Checklist.cfm/sid/3370/1993-SP---All-Pro"

EXPECTED_COUNTS = {"base": 270, "all-pro": 15}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())
EXPECTED_PRODUCT_SETS = len(EXPECTED_COUNTS)
EXPECTED_TRUE_RCS = 73

# TCDB documents this in set trivia / errors context, but the normal checklist
# row for #193 does not currently include the UER annotation. Preserve the
# known collector metadata explicitly instead of depending on that row text.
RONNIE_LOTT_UER = (
    "UER: Bio on back lists Lott as being drafted with the 26th pick, should be 8th"
)


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
            if not pattern.fullmatch(card_number) or i + 1 >= len(vals):
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
    max_pages: int = 5,
) -> list[tuple[str, str, str]]:
    cards: dict[str, tuple[str, str, str]] = {}

    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), number_pattern)
        before = len(cards)
        for row in parsed:
            cards[row[0].upper()] = row
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
        raise SystemExit(f"{url}: expected {expected} unique cards, found {len(cards)}")

    return list(cards.values())


ODDS_TEXT = re.compile(
    r"(?:,?\s*)?(?:inserted\s+)?(?:at\s+)?(?:a\s+rate\s+of\s+)?"
    r"1\s*:\s*\d+\s*(?:hobby\s+|retail\s+)?(?:packs?)?",
    re.IGNORECASE,
)
NOTE_START = re.compile(
    r"(?:^|\s)(?=(?:(?:RC|ROO|PP|PB|FOIL|UER|ERR|COR|VAR|SP|MEM|AU|CUT|EXCH)+|"
    r"PR\d+|SN\d+)\b)",
    re.IGNORECASE,
)


def normalize_repeated_markers(text: str) -> str:
    for marker in (
        "RC", "ROO", "PP", "PB", "FOIL", "UER", "ERR", "COR", "VAR", "MEM", "AU"
    ):
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
        raise SystemExit(f"Could not derive clean player from {raw_name!r}")

    notes = normalize_repeated_markers(notes)
    notes = ODDS_TEXT.sub("", notes)
    notes = re.sub(r"\bRC\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    notes = re.sub(r"\s*,\s*,+", ", ", notes)
    notes = re.sub(r"^[,;\s]+|[,;\s]+$", "", notes)
    return player, notes


def subset_from_notes(number: int, notes: str) -> str:
    if 1 <= number <= 18 or re.search(r"\bPP\b", notes, re.IGNORECASE):
        return "Premier Prospects"
    if re.search(r"\bPB\b", notes, re.IGNORECASE):
        return "Pro Bowl"
    if re.search(r"\bROO\b", notes, re.IGNORECASE):
        return "Rookie"
    return ""


def clean_variant_text(text: str) -> str:
    value = ODDS_TEXT.sub("", text or "")
    value = normalize_repeated_markers(value)
    value = re.sub(r"\s*,\s*", "; ", value)
    value = re.sub(r"\s*;\s*;\s*", "; ", value)
    return re.sub(r"^[,;\s]+|[,;\s]+$", "", value)


def variant_from_notes(notes: str) -> str:
    value = re.sub(r"\b(?:PP|PB|ROO)\b\s*,?\s*", "", notes, flags=re.IGNORECASE)
    return clean_variant_text(value)


def merge_variant(*parts: str) -> str:
    pieces: list[str] = []
    for part in parts:
        cleaned = clean_variant_text(part)
        if not cleaned:
            continue
        for piece in [p.strip() for p in cleaned.split(";") if p.strip()]:
            if piece not in pieces:
                pieces.append(piece)
    return "; ".join(pieces)


def load_true_rc_numbers() -> set[int]:
    print("rookie-index:")
    rookie_numbers: set[int] = set()

    for page_index in range(1, 4):
        rows = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        for card_number, _raw_name, _team in rows:
            number = int(card_number)
            if 1 <= number <= 270:
                rookie_numbers.add(number)

        print(
            f"  page {page_index}: parsed {len(rows)} rows; "
            f"{len(rookie_numbers)} unique recognized RC card numbers"
        )

        if len(rookie_numbers) >= EXPECTED_TRUE_RCS:
            break
        if page_index > 1 and not rows:
            break

    if len(rookie_numbers) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} TCDB-recognized rookie cards, "
            f"found {len(rookie_numbers)}"
        )

    return rookie_numbers


def build_base_rows(true_rcs: set[int]) -> list[list[str]]:
    print("base:")
    parsed = fetch_set_rows(BASE_URL, r"\d{1,3}", 270)
    source: dict[int, tuple[str, str]] = {}

    for raw_number, raw_name, team in parsed:
        number = int(raw_number)
        if 1 <= number <= 270:
            source[number] = (raw_name, team)

    required = set(range(1, 271))
    if set(source) != required:
        missing = sorted(required - set(source))
        extra = sorted(set(source) - required)
        raise SystemExit(
            f"Base numbering mismatch; missing={missing[:30]}, extra={extra[:30]}"
        )

    rows: list[list[str]] = []
    for number in range(1, 271):
        raw_name, raw_team = source[number]
        player, source_notes = clean_player_and_notes(raw_name)
        team = " ".join(raw_team.split()).strip()

        if not team:
            raise SystemExit(f"Base #{number} {player} is missing team data")

        if number in true_rcs:
            player = f"{player} RC"

        variant = variant_from_notes(source_notes)
        if number == 193 and "UER" not in variant.upper():
            variant = merge_variant(variant, RONNIE_LOTT_UER)

        rows.append(
            [
                "base",
                str(number),
                player,
                team,
                subset_from_notes(number, source_notes),
                variant,
            ]
        )

    return rows


def build_all_pro_rows() -> list[list[str]]:
    print("all-pro:")
    parsed = fetch_set_rows(ALL_PRO_URL, r"AP\d{1,2}", 15, max_pages=2)
    rows: list[list[str]] = []

    for card_number, raw_name, raw_team in parsed:
        player, source_notes = clean_player_and_notes(raw_name)
        team = " ".join(raw_team.split()).strip()

        if not team:
            raise SystemExit(f"All-Pro #{card_number} {player} is missing team data")

        rows.append(
            [
                "all-pro",
                card_number,
                player,
                team,
                "All-Pro",
                variant_from_notes(source_notes),
            ]
        )

    return rows


def validate_base(rows: list[list[str]], true_rcs: set[int]) -> None:
    base = {int(row[1]): row for row in rows if row[0] == "base"}

    if len(base) != 270:
        raise SystemExit(f"Expected 270 Base rows, found {len(base)}")

    rc_rows = {number for number, row in base.items() if row[2].endswith(" RC")}
    if rc_rows != true_rcs:
        raise SystemExit(
            "Base RC labels do not match TCDB rookie index; "
            f"missing={sorted(true_rcs - rc_rows)[:20]}, "
            f"extra={sorted(rc_rows - true_rcs)[:20]}"
        )

    premier = [base[number] for number in range(1, 19)]
    if any(row[4] != "Premier Prospects" for row in premier):
        bad = next(row for row in premier if row[4] != "Premier Prospects")
        raise SystemExit(f"Premier Prospects subset validation failed: {bad}")

    if any("FOIL" not in row[5].upper() for row in premier):
        bad = next(row for row in premier if "FOIL" not in row[5].upper())
        raise SystemExit(f"Premier Prospects FOIL metadata missing: {bad}")

    expected_lott_detail = "26th pick, should be 8th"
    if "UER" not in base[193][5].upper() or expected_lott_detail.lower() not in base[193][5].lower():
        raise SystemExit(
            f"Base #193 Ronnie Lott must retain the documented UER detail in Variant: {base[193]}"
        )

    checks = {
        6: ("Jerome Bettis RC", "Los Angeles Rams"),
        9: ("Drew Bledsoe RC", "New England Patriots"),
        91: ("Mark Brunell RC", "Green Bay Packers"),
        193: ("Ronnie Lott", "New York Jets"),
        211: ("Larry Centers RC", "Phoenix Cardinals"),
        241: ("Dana Stubblefield RC", "San Francisco 49ers"),
        270: ("Ricky Sanders", "Washington Redskins"),
    }

    for number, (expected_player, expected_team) in checks.items():
        row = base[number]
        if row[2] != expected_player or row[3] != expected_team:
            raise SystemExit(
                f"Base #{number} spot validation failed: {row}; "
                f"expected ({expected_player!r}, {expected_team!r})"
            )


def validate_all_pro(rows: list[list[str]]) -> None:
    lookup = {row[1].upper(): row for row in rows if row[0] == "all-pro"}
    expected = {
        "AP1": ("Steve Young", "San Francisco 49ers"),
        "AP7": ("Emmitt Smith", "Dallas Cowboys"),
        "AP15": ("Derrick Thomas", "Kansas City Chiefs"),
    }

    if len(lookup) != 15:
        raise SystemExit(f"Expected 15 All-Pro cards, found {len(lookup)}")

    for number, (player, team) in expected.items():
        row = lookup.get(number)
        if not row or row[2] != player or row[3] != team:
            raise SystemExit(
                f"All-Pro {number} spot validation failed: {row}; "
                f"expected ({player!r}, {team!r})"
            )


def main() -> None:
    true_rcs = load_true_rc_numbers()
    base_rows = build_base_rows(true_rcs)
    all_pro_rows = build_all_pro_rows()
    all_rows = [*base_rows, *all_pro_rows]

    actual_counts = {"base": len(base_rows), "all-pro": len(all_pro_rows)}
    for key, expected in EXPECTED_COUNTS.items():
        actual = actual_counts.get(key, 0)
        if actual != expected:
            raise SystemExit(f"{key}: expected {expected} rows, found {actual}")

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} explicit rows, found {len(all_rows)}")

    validate_base(all_rows, true_rcs)
    validate_all_pro(all_rows)

    seen: set[tuple[str, str]] = set()
    duplicates: set[tuple[str, str]] = set()
    for row in all_rows:
        key = (row[0], row[1].upper())
        if key in seen:
            duplicates.add(key)
        seen.add(key)
    if duplicates:
        raise SystemExit(f"Duplicate ProductSet/card numbers found: {sorted(duplicates)[:10]}")

    bad_odds = [
        (row[0], row[1], row[5])
        for row in all_rows
        if re.search(r"\b(?:inserted\s+)?1\s*:\s*\d+\b", row[5], re.IGNORECASE)
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant metadata: {bad_odds[:10]}")

    dirty_players = []
    for row in all_rows:
        display = re.sub(r" RC$", "", row[2], flags=re.IGNORECASE)
        if re.search(
            r"\b(?:PP|PB|ROO|FOIL|UER|ERR|COR|VAR|MEM|AU|PR\d+|SN\d+)\b",
            display,
            re.IGNORECASE,
        ):
            dirty_players.append((row[0], row[1], row[2]))
    if dirty_players:
        raise SystemExit(f"Collector metadata leaked into Player; example: {dirty_players[0]}")

    missing_teams = [row for row in all_rows if not row[3].strip()]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} cards missing team data; example: {missing_teams[0]}"
        )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1993 SP FOOTBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    print("  base: 270")
    print("  all-pro: 15")
    print(f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}")
    print("Premier Prospects #1-18: validated with FOIL metadata")
    print("Ronnie Lott #193 UER: documented trivia metadata retained in Variant")
    print("Historical pack configuration: 12 cards/pack, 24 packs/box")
    print("All-Pro ProductSet odds: 1:15 packs")
    print("Joe Montana promo: excluded")
    print("Card-level odds in Variant: 0")
    print("Team data: COMPLETE")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")


if __name__ == "__main__":
    main()
