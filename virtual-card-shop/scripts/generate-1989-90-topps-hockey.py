from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1989-90-topps-hockey.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/4869/1989-90-Topps"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/4869/1989-90-Topps"
STICKERS_URL = "https://www.tcdb.com/Checklist.cfm/sid/8782/1989-90-Topps-Stickers"

BASE_EXPECTED = 198
STICKERS_EXPECTED = 33
EXPECTED_TOTAL = BASE_EXPECTED + STICKERS_EXPECTED


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


METADATA_START = re.compile(
    r"(?:,\s*|\s+)(?:ERR|COR|UER|VAR)(?:ERR|COR|UER|VAR)?\b(?:\s*:)?",
    re.IGNORECASE,
)


def clean_subject(raw_name: str) -> str:
    raw = " ".join(raw_name.split()).strip()

    # TCDB sometimes nests one or more error/variation descriptions inside the
    # same subject cell. Everything beginning with the first ERR/COR/UER/VAR
    # marker is source metadata, never part of the VCS Player display name.
    match = METADATA_START.search(raw)
    if match:
        raw = raw[: match.start()].strip(" ,;")

    # RC is controlled exclusively by the verified rookie index below.
    raw = re.sub(r"\bRC\b", "", raw, flags=re.IGNORECASE)

    # Preserve compact collector abbreviations such as DP and AS, but convert
    # comma-separated suffixes into the project's normal space-delimited form.
    raw = re.sub(r"\s*,\s*", " ", raw)
    raw = " ".join(raw.split()).strip(" ,;")

    # Variation markup can repeat an already-present short abbreviation in the
    # same cell (for example AS AS). Collapse those harmless duplicates.
    raw = re.sub(r"\b(AS|DP)\s+\1\b", r"\1", raw, flags=re.IGNORECASE)
    return raw


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


def build_base(true_rcs: set[str]) -> list[list[str]]:
    source_rows = fetch_set_rows(
        BASE_URL,
        r"\d{1,3}[A-Za-z]?",
        "base",
        expected_unique=BASE_EXPECTED,
        numeric_range=(1, BASE_EXPECTED),
        normalize_letters=True,
    )

    grouped: dict[str, list[tuple[str, str, str]]] = {}
    for source_number, raw_name, team in source_rows:
        number = normalize_numeric_variant(source_number)
        grouped.setdefault(number, []).append((source_number, raw_name, team))

    expected_numbers = {str(n) for n in range(1, BASE_EXPECTED + 1)}
    if set(grouped) != expected_numbers:
        missing = sorted(expected_numbers - set(grouped), key=int)
        extra = sorted(set(grouped) - expected_numbers, key=int)
        raise SystemExit(
            f"base: numbering mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )

    rows: list[list[str]] = []
    for number in sorted(grouped, key=int):
        versions = grouped[number]

        # TCDB lists Randy Cunneyworth as 63a ERR and 63b COR. VCS keeps one
        # logical #63, using the corrected card and omitting ERR/COR metadata.
        if number == "63":
            corrected = [version for version in versions if version[0].upper() == "63B"]
            if len(corrected) != 1:
                raise SystemExit(
                    f"base #63: expected exactly one corrected 63b row, found {len(corrected)}"
                )
            _source_number, raw_name, team = corrected[0]
            player = clean_subject(raw_name)
            variant = ""
            if player != "Randy Cunneyworth":
                raise SystemExit(
                    f"base #63: corrected source did not normalize to Randy Cunneyworth: {player!r}"
                )
        else:
            _source_number, raw_name, team = versions[0]
            player = clean_subject(raw_name)
            variant = ""

            if len(versions) > 1:
                other_subjects = {
                    clean_subject(other_name)
                    for _other_number, other_name, _other_team in versions[1:]
                }
                if other_subjects and other_subjects != {player}:
                    raise SystemExit(
                        f"base #{number}: unexpected multiple subjects: "
                        f"{player!r} vs {sorted(other_subjects)!r}"
                    )

        if number in true_rcs:
            player = re.sub(r"(?:\s+RC)+$", "", player, flags=re.IGNORECASE).strip()
            player = f"{player} RC"

        if not team and not is_checklist_card(player, "Base"):
            raise SystemExit(f"base #{number} {player} is missing team data")

        rows.append(["base", number, player, team, "Base", variant])

    return rows


def build_stickers() -> list[list[str]]:
    source_rows = fetch_set_rows(
        STICKERS_URL,
        r"\d{1,2}",
        "stickers",
        expected_unique=STICKERS_EXPECTED,
        numeric_range=(1, STICKERS_EXPECTED),
    )

    grouped: dict[str, list[tuple[str, str]]] = {}
    for number, raw_name, team in source_rows:
        grouped.setdefault(number, []).append((raw_name, team))

    expected_numbers = {str(n) for n in range(1, STICKERS_EXPECTED + 1)}
    if set(grouped) != expected_numbers:
        missing = sorted(expected_numbers - set(grouped), key=int)
        extra = sorted(set(grouped) - expected_numbers, key=int)
        raise SystemExit(
            f"stickers: numbering mismatch; missing={missing[:20]}, extra={extra[:20]}"
        )

    rows: list[list[str]] = []
    for number in sorted(grouped, key=int):
        versions = grouped[number]
        raw_name, team = versions[0]
        player = clean_subject(raw_name)

        # The * / ** copyright variants are intentionally one VCS sticker.
        for other_name, other_team in versions[1:]:
            other_player = clean_subject(other_name)
            if other_player != player:
                raise SystemExit(
                    f"stickers #{number}: variation rows have different subjects: "
                    f"{player!r} vs {other_player!r}"
                )
            if team and other_team and other_team != team:
                raise SystemExit(
                    f"stickers #{number}: variation rows have different teams: "
                    f"{team!r} vs {other_team!r}"
                )
            if not team:
                team = other_team

        if not team and not is_checklist_card(player, "Stickers"):
            raise SystemExit(f"stickers #{number} {player} is missing team data")

        rows.append(["stickers", number, player, team, "Stickers", ""])

    return rows


def main() -> None:
    true_rcs = load_true_rc_numbers()

    base_rows = build_base(true_rcs)
    sticker_rows = build_stickers()
    all_rows = base_rows + sticker_rows

    if len(true_rcs) != 36:
        raise SystemExit(f"Expected 36 recognized RC card numbers, found {len(true_rcs)}")
    if len(base_rows) != BASE_EXPECTED:
        raise SystemExit(f"Expected {BASE_EXPECTED} Base rows, found {len(base_rows)}")
    if len(sticker_rows) != STICKERS_EXPECTED:
        raise SystemExit(
            f"Expected {STICKERS_EXPECTED} Stickers rows, found {len(sticker_rows)}"
        )
    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} total rows, found {len(all_rows)}")

    duplicate_rc = [row for row in base_rows if re.search(r"\bRC\s+RC\b", row[2])]
    if duplicate_rc:
        raise SystemExit(f"Duplicate RC label found; example: {duplicate_rc[0]}")

    metadata_leaks = [
        row
        for row in all_rows
        if re.search(r"\b(?:ERR|COR|UER|VAR)\b", row[2], re.IGNORECASE)
    ]
    if metadata_leaks:
        raise SystemExit(f"Metadata leaked into Player; example: {metadata_leaks[0]}")

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

    cunneyworth = [row for row in base_rows if row[1] == "63"]
    if (
        len(cunneyworth) != 1
        or cunneyworth[0][2] != "Randy Cunneyworth"
        or cunneyworth[0][5]
    ):
        raise SystemExit(f"Randy Cunneyworth #63 normalization failed: {cunneyworth}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1989-90 TOPPS HOCKEY CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Total explicit CSV rows: {len(all_rows)}")
    print(f"  base: {len(base_rows)}")
    print(f"  stickers: {len(sticker_rows)}")
    print(f"Recognized true RC cards labeled in Base player row: {len(true_rcs)}")
    print("Randy Cunneyworth #63: one VCS card, corrected 63b source retained, ERR/COR omitted")
    print("Sticker * / ** copyright variations: collapsed to one logical sticker per number")
    print("Wax Box Bottom Panels / Singles: EXCLUDED (not pack-issued)")
    print("Expected Product Sets: 2")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Card-level odds in Variant: 0")
    print("Player metadata leakage: 0")
    print("Duplicate RC labels: 0")
    print("Team data: COMPLETE (checklist-card exception allowed)")


if __name__ == "__main__":
    main()
