from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1994-upper-deck-football.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/3477/1994-Upper-Deck"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/3477/1994-Upper-Deck"

SOURCES = {
    "base": (BASE_URL, r"\d{1,3}[A-Za-z]?", 330, "Base"),
    "predictors-award-winners": (
        "https://www.tcdb.com/Checklist.cfm/sid/3479/1994-Upper-Deck-Predictors-Award-Winners",
        r"HP\d{1,2}", 20, "Predictors: Award Winners",
    ),
    "predictors-league-leaders": (
        "https://www.tcdb.com/Checklist.cfm/sid/3481/1994-Upper-Deck-Predictors-League-Leaders",
        r"RP\d{1,2}", 30, "Predictors: League Leaders",
    ),
    "pro-bowl": (
        "https://www.tcdb.com/Checklist.cfm/sid/3480/1994-Upper-Deck-Pro-Bowl",
        r"PB\d{1,2}", 20, "Pro Bowl",
    ),
}

BASE_RANGE = (1, 330)
EXPECTED_EXPLICIT = sum(value[2] for value in SOURCES.values())
EXPECTED_RESOLVED = EXPECTED_EXPLICIT + 330 + 330


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
    raw = number.strip().upper()
    match = re.fullmatch(r"(\d{1,3})[A-Z]", raw)
    return match.group(1) if match else raw


def logical_numbers(rows: list[tuple[str, str, str]], *, normalize_letters: bool) -> set[str]:
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


META_TOKEN = re.compile(
    r"\b(?:ERR|COR|UER|VAR|MEM|AU|AUTO|SN\d+|PR\d+|RDM|EXCH)\b",
    re.IGNORECASE,
)

GLUED_METADATA_TAIL = re.compile(
    r"\s+(?:ERR|COR|UER|VAR)(?:ERR|COR|UER|VAR)?\s*:\s*.*$",
    re.IGNORECASE,
)


def clean_player_and_notes(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split())

    # TCDB can concatenate card-name metadata and its detail note inside the
    # same table cell, e.g. "Emmitt Smith CORCOR: 5699 total yards". Strip
    # that descriptive tail before token cleanup so it can never leak into
    # the display-facing Player field.
    raw = GLUED_METADATA_TAIL.sub("", raw).strip()

    tokens = [piece.strip() for piece in re.split(r"\s*,\s*", raw) if piece.strip()]
    player_parts: list[str] = []
    notes: list[str] = []

    for token in tokens:
        if token.upper() == "RC":
            continue
        if META_TOKEN.search(token):
            cleaned = token
            for match in META_TOKEN.findall(token):
                notes.append(match.upper())
                cleaned = re.sub(
                    rf"\b{re.escape(match)}\b", "", cleaned, flags=re.IGNORECASE
                ).strip(" ,;")
            if cleaned:
                player_parts.append(cleaned)
        else:
            player_parts.append(token)

    player = " ".join(" ".join(player_parts).split()).strip(" ,;")
    variant = "; ".join(dict.fromkeys(note for note in notes if note))
    return player, variant


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


def is_known_teamless_subject(player: str, subset: str) -> bool:
    return is_checklist_card(player, subset) or "long shot" in player.lower()


def build_base(true_rcs: set[str]) -> list[list[str]]:
    source_rows = fetch_set_rows(
        BASE_URL,
        r"\d{1,3}[A-Za-z]?",
        "base",
        expected_unique=330,
        numeric_range=BASE_RANGE,
        normalize_letters=True,
    )

    grouped: dict[str, list[tuple[str, str, str]]] = {}
    for source_number, raw_name, team in source_rows:
        number = normalize_numeric_variant(source_number)
        grouped.setdefault(number, []).append((source_number, raw_name, team))

    expected_numbers = {str(n) for n in range(1, 331)}
    if set(grouped) != expected_numbers:
        missing = sorted(expected_numbers - set(grouped), key=int)
        extra = sorted(set(grouped) - expected_numbers, key=int)
        raise SystemExit(
            f"base: numbering mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )

    rows: list[list[str]] = []
    for number in sorted(grouped, key=int):
        versions = grouped[number]

        if number == "157":
            corrected = [v for v in versions if v[0].upper() == "157B"]
            if len(corrected) != 1:
                raise SystemExit(
                    f"base #157: expected exactly one corrected 157b row, found {len(corrected)}"
                )
            _source_number, raw_name, team = corrected[0]
            player, _notes = clean_player_and_notes(raw_name)
            variant = ""
            if player != "Emmitt Smith":
                raise SystemExit(
                    f"base #157: corrected source did not normalize to Emmitt Smith: {player!r}"
                )
        else:
            _source_number, raw_name, team = versions[0]
            player, variant = clean_player_and_notes(raw_name)

            if len(versions) > 1:
                other_subjects = {
                    clean_player_and_notes(other_name)[0]
                    for _other_number, other_name, _other_team in versions[1:]
                }
                if other_subjects and other_subjects != {player}:
                    raise SystemExit(
                        f"base #{number}: multiple source rows with different subjects: "
                        f"{player!r} vs {sorted(other_subjects)!r}"
                    )

        if number in true_rcs:
            player = f"{player} RC"

        if not team and not is_known_teamless_subject(player, "Base"):
            raise SystemExit(f"base #{number} {player} is missing team data")

        rows.append(["base", number, player, team, "Base", variant])

    return rows


def build_insert(
    key: str,
    url: str,
    pattern: str,
    expected: int,
    subset: str,
) -> list[list[str]]:
    source_rows = fetch_set_rows(
        url,
        pattern,
        key,
        expected_unique=expected,
    )

    grouped: dict[str, tuple[str, str]] = {}
    for number, raw_name, team in source_rows:
        if number in grouped:
            raise SystemExit(f"{key}: duplicate card number {number}")
        grouped[number] = (raw_name, team)

    if len(grouped) != expected:
        raise SystemExit(
            f"{key}: expected {expected} unique card numbers, found {len(grouped)}"
        )

    def sort_key(card_number: str) -> tuple[str, int]:
        match = re.fullmatch(r"([A-Z]+)(\d+)", card_number.upper())
        if not match:
            return (card_number, 999999)
        return (match.group(1), int(match.group(2)))

    rows: list[list[str]] = []
    for number in sorted(grouped, key=sort_key):
        raw_name, team = grouped[number]
        player, variant = clean_player_and_notes(raw_name)

        if not team and not is_known_teamless_subject(player, subset):
            raise SystemExit(f"{key} #{number} {player} is missing team data")

        rows.append([key, number, player, team, subset, variant])

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()
    all_rows: list[list[str]] = []
    all_rows.extend(build_base(true_rcs))

    for key, (url, pattern, expected, subset) in SOURCES.items():
        if key == "base":
            continue
        all_rows.extend(build_insert(key, url, pattern, expected, subset))

    counts = {key: 0 for key in SOURCES}
    for row in all_rows:
        counts[row[0]] += 1

    if len(all_rows) != EXPECTED_EXPLICIT:
        raise SystemExit(
            f"Expected {EXPECTED_EXPLICIT} explicit CSV rows, found {len(all_rows)}"
        )

    odds_leaks = [
        row for row in all_rows if re.search(r"\b1\s*:\s*\d+", row[5] or "")
    ]
    if odds_leaks:
        raise SystemExit(
            f"Card-level odds leaked into Variant; example: {odds_leaks[0]}"
        )

    suspicious_players = [
        row
        for row in all_rows
        if re.search(
            r"\b(?:ERR|COR|UER|MEM|SN\d+|PR\d+|RDM|Variation|Inserted)\b",
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
        if not row[3].strip() and not is_known_teamless_subject(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(
            f"Found {len(missing_teams)} unexpected cards missing team data; example: {missing_teams[0]}"
        )

    emmitt_rows = [
        row for row in all_rows if row[0] == "base" and row[1] == "157"
    ]
    if (
        len(emmitt_rows) != 1
        or emmitt_rows[0][0:3] != ["base", "157", "Emmitt Smith"]
        or emmitt_rows[0][5]
    ):
        raise SystemExit(f"Emmitt Smith #157 normalization failed: {emmitt_rows}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1994 UPPER DECK FOOTBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    for key in SOURCES:
        print(f"  {key}: {counts[key]}")
    print("  electric: 330 (derived from Base)")
    print("  electric-gold: 330 (derived from Base)")
    print(f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}")
    print(
        "Emmitt Smith #157: one VCS card, corrected 157b source retained, ERR/COR Variant omitted"
    )
    print("Predictor Exchange mail-in sets: EXCLUDED")
    print("Promos / Pro Bowl Samples: EXCLUDED")
    print("Expected Product Sets: 6")
    print(f"Total resolved cards expected: {EXPECTED_RESOLVED}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print(
        "Team data: COMPLETE (checklist and generic Long Shot predictor subjects may be teamless)"
    )


if __name__ == "__main__":
    main()
