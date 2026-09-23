from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1992-topps-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/212/1992-Topps"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/212/1992-Topps"
GOLD_URL = "https://www.tcdb.com/Checklist.cfm/sid/10273/1992-Topps-Gold"
MATCH_STATS_URL = "https://www.tcdb.com/Checklist.cfm/sid/104558/1992-Topps-Match-the-Stats-Game"

EXPECTED_BASE = 792
EXPECTED_GOLD = 792
EXPECTED_MATCH_STATS = 52
EXPECTED_TRUE_RCS = 61
EXPECTED_PRODUCT_SETS = 3
EXPECTED_TOTAL = EXPECTED_BASE + EXPECTED_GOLD + EXPECTED_MATCH_STATS

GOLD_CHECKLIST_REPLACEMENTS = {
    131: "Terry Mathews",
    264: "Rod Beck",
    366: "Tony Perezchica",
    527: "Terry McDaniel",
    658: "John Ramos",
    787: "Brian Williams",
}


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
        elif tag == "br" and self.in_td:
            self.cell.append(" ")

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
            found.append((card_number, raw_name, team))
            break

    return found


def normalize_number(raw_number: str) -> str:
    match = re.fullmatch(r"(\d{1,3})[A-Za-z]?", raw_number.strip())
    if not match:
        raise SystemExit(f"Unexpected numbered card identifier: {raw_number!r}")
    return str(int(match.group(1)))


METADATA_TAIL = re.compile(
    r"\s+(?=(?:UER|ERR|COR|VAR)\b)",
    re.IGNORECASE,
)


def clean_player_and_variant(raw_name: str) -> tuple[str, str]:
    raw = " ".join(raw_name.split()).strip()
    pieces = METADATA_TAIL.split(raw, maxsplit=1)
    player = pieces[0].strip(" ,;")
    metadata = pieces[1].strip(" ,;") if len(pieces) > 1 else ""

    variant_tokens: list[str] = []

    # TCDB appends this descriptive note to the six Gold cards that replace
    # base checklist cards. It is source metadata, not part of the player name.
    if re.search(r"\s+Checklist replacement\s*$", player, re.IGNORECASE):
        player = re.sub(
            r"\s+Checklist replacement\s*$",
            "",
            player,
            flags=re.IGNORECASE,
        ).strip(" ,;")
        variant_tokens.append("Checklist replacement")

    # RC comes only from TCDB's dedicated Rookie Cards index.
    player = re.sub(r",?\s+RC\b", "", player, flags=re.IGNORECASE).strip(" ,;")
    player = " ".join(player.split())

    for token in ("UER", "ERR", "COR"):
        if re.search(rf"\b{token}\b", metadata, re.IGNORECASE):
            variant_tokens.append(token)

    return player, "; ".join(dict.fromkeys(variant_tokens))


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def classify_subset(player: str) -> str:
    upper = player.upper()
    if "CHECKLIST" in upper:
        return "Checklist"
    if "TOP PROSPECTS" in upper or re.search(r"\bTP\b", upper):
        return "Top Prospects"
    if re.search(r"\bDPK\b", upper):
        return "Draft Pick"
    if re.search(r"\bRB\b", upper):
        return "Record Breaker"
    if re.search(r"\bMGR\b", upper):
        return "Manager"
    if re.search(r"\bLL\b", upper):
        return "League Leaders"
    if re.search(r"\bAS\b", upper):
        return "All-Star"
    return ""


def validate_team(card_number: str, player: str, team: str, subset: str) -> str:
    clean_team = " ".join(team.split()).strip()
    if not clean_team and not is_checklist_card(player, subset):
        raise SystemExit(f"Card #{card_number} {player} is missing team data")
    return clean_team


def fetch_logical_numbered_set(
    url: str,
    expected: int,
    label: str,
    *,
    max_pages: int = 12,
) -> dict[int, tuple[str, str, str]]:
    grouped: dict[int, list[tuple[str, str, str]]] = {}

    print(f"{label}:")
    for page_index in range(1, max_pages + 1):
        parsed = parse_rows(fetch(page_url(url, page_index)), r"\d{1,3}[A-Za-z]?")
        before = len(grouped)

        for source_number, raw_name, raw_team in parsed:
            logical = int(normalize_number(source_number))
            if not (1 <= logical <= expected):
                continue
            grouped.setdefault(logical, []).append((source_number, raw_name, raw_team))

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(grouped) - before}; logical cards {len(grouped)}"
        )

        if len(grouped) == expected:
            break
        if page_index > 1 and not parsed:
            break

    required = set(range(1, expected + 1))
    if set(grouped) != required:
        missing = sorted(required - set(grouped))
        extra = sorted(set(grouped) - required)
        raise SystemExit(
            f"{label}: numbering mismatch; missing={missing[:30]}, extra={extra[:30]}, "
            f"found={len(grouped)} expected={expected}"
        )

    result: dict[int, tuple[str, str, str]] = {}
    for number in range(1, expected + 1):
        versions = grouped[number]
        cleaned_versions: list[tuple[str, str, str]] = []
        for _source_number, raw_name, raw_team in versions:
            player, variant = clean_player_and_variant(raw_name)
            subset = classify_subset(player)
            team = validate_team(str(number), player, raw_team, subset)
            cleaned_versions.append((player, team, variant))

        subjects = {(player, team) for player, team, _variant in cleaned_versions}
        if len(subjects) != 1:
            raise SystemExit(
                f"{label} #{number}: print variations resolve to different subjects/teams: "
                f"{sorted(subjects)!r}"
            )

        player, team, variant = cleaned_versions[0]
        result[number] = (player, team, variant)

    return result


def load_true_rc_numbers() -> set[int]:
    print("rookie-index:")
    seen: set[int] = set()

    for page_index in range(1, 4):
        parsed = parse_rows(fetch(page_url(ROOKIES_URL, page_index)), r"\d{1,3}")
        before = len(seen)
        for number, _raw_name, _team in parsed:
            value = int(number)
            if 1 <= value <= EXPECTED_BASE:
                seen.add(value)
        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{len(seen) - before}; unique RC numbers {len(seen)}"
        )
        if len(seen) == EXPECTED_TRUE_RCS:
            break
        if page_index > 1 and not parsed:
            break

    if len(seen) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"Expected {EXPECTED_TRUE_RCS} TCDB true rookie cards, found {len(seen)}"
        )
    return seen


def build_numbered_rows(
    key: str,
    cards: dict[int, tuple[str, str, str]],
    true_rcs: set[int],
) -> list[list[str]]:
    rows: list[list[str]] = []
    for number in range(1, len(cards) + 1):
        player, team, variant = cards[number]
        if number in true_rcs:
            player = f"{player} RC"
        subset = classify_subset(player)
        rows.append([key, str(number), player, team, subset, variant])
    return rows


def build_match_stats_rows() -> list[list[str]]:
    print("match-the-stats:")
    unique: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    # TCDB exposes white/gray-back manufacturing variants for the same 52
    # physical NNO subjects. VCS intentionally collapses those variants.
    for page_index in range(1, 4):
        parsed = parse_rows(fetch(page_url(MATCH_STATS_URL, page_index)), r"NNO")
        added = 0
        for _number, raw_name, raw_team in parsed:
            player, _variant = clean_player_and_variant(raw_name)
            team = validate_team("NNO", player, raw_team, "Match the Stats Game")
            key = (player, team)
            if key in seen:
                continue
            seen.add(key)
            unique.append(key)
            added += 1

        print(
            f"  page {page_index}: parsed {len(parsed)} rows; "
            f"+{added}; logical subjects {len(unique)}"
        )
        if len(unique) == EXPECTED_MATCH_STATS:
            break
        if page_index > 1 and not parsed:
            break

    if len(unique) != EXPECTED_MATCH_STATS:
        raise SystemExit(
            f"Match the Stats expected {EXPECTED_MATCH_STATS} logical subjects, found {len(unique)}"
        )

    return [
        [
            "match-the-stats",
            str(index),
            player,
            team,
            "Match the Stats Game",
            "Physical NNO",
        ]
        for index, (player, team) in enumerate(unique, start=1)
    ]


def main() -> None:
    true_rcs = load_true_rc_numbers()
    base_cards = fetch_logical_numbered_set(BASE_URL, EXPECTED_BASE, "base")
    gold_cards = fetch_logical_numbered_set(GOLD_URL, EXPECTED_GOLD, "gold")

    base_rows = build_numbered_rows("base", base_cards, true_rcs)
    gold_rows = build_numbered_rows("gold", gold_cards, true_rcs)
    match_rows = build_match_stats_rows()
    all_rows = base_rows + gold_rows + match_rows

    if len(all_rows) != EXPECTED_TOTAL:
        raise SystemExit(f"Expected {EXPECTED_TOTAL} rows, found {len(all_rows)}")

    base_rcs = [row for row in base_rows if row[2].endswith(" RC")]
    gold_rcs = [row for row in gold_rows if row[2].endswith(" RC")]
    if len(base_rcs) != EXPECTED_TRUE_RCS or len(gold_rcs) != EXPECTED_TRUE_RCS:
        raise SystemExit(
            f"RC audit failed: base={len(base_rcs)}, gold={len(gold_rcs)}, "
            f"expected={EXPECTED_TRUE_RCS} each"
        )

    # Gold must preserve Topps' six replacement subjects instead of silently
    # deriving those rows from the flagship checklist. TCDB appends the text
    # 'Checklist replacement'; that descriptor belongs in Variant, not Player.
    for number, expected_player in GOLD_CHECKLIST_REPLACEMENTS.items():
        base_player = base_cards[number][0]
        gold_player, gold_team, gold_variant = gold_cards[number]

        if not is_checklist_card(base_player, "Checklist"):
            raise SystemExit(
                f"Expected Base #{number} to be a checklist card: {base_player!r}"
            )
        if gold_player != expected_player:
            raise SystemExit(
                f"Gold #{number} replacement mismatch: expected {expected_player!r}, "
                f"found {gold_player!r}"
            )
        if not gold_team:
            raise SystemExit(f"Gold #{number} {gold_player} is missing team data")
        if "Checklist replacement" not in gold_variant.split("; "):
            raise SystemExit(
                f"Gold #{number} did not preserve checklist-replacement metadata: "
                f"{gold_variant!r}"
            )

    # High-value guards and clean display-facing metadata checks.
    spot_checks = {
        ("base", "1"): ("Nolan Ryan", "Texas Rangers"),
        ("base", "156"): ("Manny Ramirez DPK RC", "Cleveland Indians"),
        ("base", "186"): ("Cliff Floyd DPK RC", "Montreal Expos"),
        ("base", "768"): ("Jim Thome", "Cleveland Indians"),
        ("gold", "1"): ("Nolan Ryan", "Texas Rangers"),
        ("gold", "658"): ("John Ramos", "New York Yankees"),
    }
    lookup = {(row[0], row[1]): row for row in all_rows}
    for key, (expected_player, expected_team) in spot_checks.items():
        row = lookup.get(key)
        if not row or row[2] != expected_player or row[3] != expected_team:
            raise SystemExit(
                f"Spot validation failed for {key}: {row}; "
                f"expected ({expected_player!r}, {expected_team!r})"
            )

    dirty_players = [
        row
        for row in all_rows
        if re.search(r"\b(?:UER|ERR|COR|VAR|SN\d+|PR\d+)\b", row[2], re.IGNORECASE)
        or "checklist replacement" in row[2].lower()
    ]
    if dirty_players:
        raise SystemExit(f"Collector metadata leaked into Player: {dirty_players[:5]}")

    bad_odds = [
        row
        for row in all_rows
        if re.search(r"\b1\s*:\s*\d+\b", row[5] or "")
    ]
    if bad_odds:
        raise SystemExit(f"Card-level odds leaked into Variant: {bad_odds[:5]}")

    missing_teams = [
        row
        for row in all_rows
        if not row[3].strip() and not is_checklist_card(row[2], row[4])
    ]
    if missing_teams:
        raise SystemExit(f"Unexpected missing team data: {missing_teams[:5]}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1992 TOPPS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Base cards: {len(base_rows)}")
    print(f"Gold cards: {len(gold_rows)}")
    print(f"Match the Stats cards: {len(match_rows)}")
    print(f"Verified true RC cards: {len(base_rcs)}")
    print(f"Explicit CSV rows: {len(all_rows)}")
    print(f"Expected Product Sets: {EXPECTED_PRODUCT_SETS}")
    print(f"Total resolved cards expected: {EXPECTED_TOTAL}")
    print("Pack configuration: 15 cards per pack, 36 packs per box")


if __name__ == "__main__":
    main()
