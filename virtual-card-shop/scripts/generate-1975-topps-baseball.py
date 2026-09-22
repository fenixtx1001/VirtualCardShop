from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1975-topps-baseball.cards.csv"

CHECKLIST_URL = "https://www.tcdb.com/Checklist.cfm/sid/76/1975-Topps?PageIndex={}"
ROOKIES_URL = "https://www.tcdb.com/Rookies.cfm/sid/76/1975-Topps"
EXPECTED_CARDS = 660
EXPECTED_ROOKIES = 64
EXPECTED_PAGES = 7


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
            value = " ".join("".join(self.cell).split())
            self.row.append(value)
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


def parse_numbered_rows(html: str) -> list[tuple[int, str, str]]:
    parser = RowParser()
    parser.feed(html)
    found: list[tuple[int, str, str]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            if not re.fullmatch(r"\d{1,3}", value):
                continue

            number = int(value)
            if not (1 <= number <= EXPECTED_CARDS):
                continue
            if i + 1 >= len(vals):
                continue

            raw_name = vals[i + 1].strip()
            if not raw_name or raw_name.lower() in {"options", "add", "edit"}:
                continue

            # TCDB may include a descriptive error note in the same player/subject
            # cell. Team is still the final populated cell when present.
            team = vals[-1].strip() if len(vals) > i + 2 else ""
            if team == raw_name or re.fullmatch(r"\d{1,3}", team):
                team = ""

            found.append((number, raw_name, team))
            break

    return found


def fetch_true_rookie_numbers() -> set[int]:
    rows = parse_numbered_rows(fetch(ROOKIES_URL))
    rookies = {number for number, _name, _team in rows}

    if len(rookies) != EXPECTED_ROOKIES:
        raise SystemExit(
            f"Expected {EXPECTED_ROOKIES} TCDB rookie-card records, found {len(rookies)}"
        )

    return rookies


def classify_subset(number: int, clean_name: str) -> str:
    lower = clean_name.lower()

    if 1 <= number <= 7:
        return "Highlights"
    if 189 <= number <= 212:
        return "MVPs"
    if 306 <= number <= 313:
        return "League Leaders"
    if 459 <= number <= 466:
        return "Postseason"
    if 614 <= number <= 624:
        return "Rookie Prospects"
    if lower.startswith("checklist"):
        return "Checklist"
    if re.search(r"(?:^|\s)TC(?:,|\s|$)", clean_name):
        return "Team Card"
    if re.search(r"(?:^|\s)ASR(?:,|\s|$)", clean_name):
        return "All-Star Rookie"
    if re.search(r"(?:^|\s)AS(?:,|\s|$)", clean_name):
        return "All-Star"
    return ""


def clean_player_and_variant(
    number: int,
    raw_name: str,
    true_rookies: set[int],
) -> tuple[str, str]:
    source = " ".join(raw_name.split())
    variant_tags: list[str] = []

    # Preserve only compact error status outside the display-facing Player field.
    for tag in ("UER", "ERR", "COR"):
        if re.search(rf"(?:^|[\s,]){tag}(?:[\s,:]|$)", source):
            variant_tags.append(tag)

    # TCDB error descriptions may be appended after UER/ERR/COR in the same cell.
    # Remove the marker and everything after it from Player.
    name = re.split(r"\s+(?:UER|ERR|COR)\b", source, maxsplit=1)[0].strip()

    # RC status comes only from the dedicated TCDB Rookie Cards index.
    name = re.sub(r",?\s+RC\s*$", "", name).strip()

    # Keep checklist ranges out of Player; the range is useful metadata instead.
    checklist_match = re.fullmatch(r"(Checklist\s+#\d+)\s+(\d+-\d+)", name, flags=re.I)
    if checklist_match:
        name = checklist_match.group(1)
        variant_tags.append(f"Cards {checklist_match.group(2)}")

    # Normalize stray punctuation left behind by removing RC/error markers.
    name = re.sub(r"\s+,", ",", name)
    name = re.sub(r",\s*$", "", name).strip()
    name = " ".join(name.split())

    if number in true_rookies:
        name = f"{name} RC"

    return name, "; ".join(dict.fromkeys(variant_tags))


def is_checklist_card(player: str, subset: str = "") -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def main() -> None:
    true_rookies = fetch_true_rookie_numbers()
    cards: dict[int, tuple[str, str]] = {}

    for page_index in range(1, EXPECTED_PAGES + 1):
        url = CHECKLIST_URL.format(page_index)
        page_cards = parse_numbered_rows(fetch(url))
        if not page_cards:
            raise SystemExit(f"No checklist cards parsed from TCDB page {page_index}")

        for number, raw_name, team in page_cards:
            cards[number] = (raw_name, team)

        print(
            f"Page {page_index}: parsed {len(page_cards)} rows; "
            f"cumulative unique {len(cards)}"
        )

    missing = [number for number in range(1, EXPECTED_CARDS + 1) if number not in cards]
    if missing:
        raise SystemExit(
            f"Checklist incomplete; missing {len(missing)} card numbers: {missing[:30]}"
        )
    if len(cards) != EXPECTED_CARDS:
        raise SystemExit(f"Expected exactly {EXPECTED_CARDS} unique cards, found {len(cards)}")

    rows: list[list[str]] = []
    rc_count = 0
    error_variant_count = 0

    for number in range(1, EXPECTED_CARDS + 1):
        raw_name, team = cards[number]
        player, variant = clean_player_and_variant(number, raw_name, true_rookies)
        subset = classify_subset(number, player)

        if number in true_rookies:
            rc_count += 1
        if any(tag in variant.split("; ") for tag in ("UER", "ERR", "COR")):
            error_variant_count += 1

        if not team and not is_checklist_card(player, subset):
            raise SystemExit(f"Card #{number} {player} is missing team data")

        # Forward-looking Set Factory cleanliness guards.
        if re.search(r"(?:^|[\s,])(UER|ERR|COR)(?:[\s,:]|$)", player):
            raise SystemExit(f"Card #{number} leaked error metadata into Player: {player}")
        if re.search(r"\b1:\d+\b", variant):
            raise SystemExit(f"Card #{number} leaked odds into Variant: {variant}")

        rows.append(["base", str(number), player, team, subset, variant])

    if rc_count != EXPECTED_ROOKIES:
        raise SystemExit(
            f"Expected {EXPECTED_ROOKIES} true RC cards, found {rc_count}"
        )

    key_rookies = {
        223: "Robin Yount",
        228: "George Brett",
        616: "Jim Rice",
        620: "Gary Carter",
        622: "Fred Lynn",
        623: "Keith Hernandez",
    }
    by_number = {int(row[1]): row for row in rows}
    for number, expected_name in key_rookies.items():
        player = by_number[number][2]
        if expected_name not in player or not player.endswith("RC"):
            raise SystemExit(
                f"Key rookie guard failed for #{number}: expected {expected_name} with RC, got {player}"
            )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(rows)

    print("=== 1975 TOPPS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Base cards: {len(rows)}")
    print(f"Recognized true RC cards labeled in Player: {rc_count}")
    print(f"Cards with compact error status moved to Variant: {error_variant_count}")
    print("Expected Product Sets: 1")
    print("Total resolved cards expected: 660")
    print("VCS pack format: 4 cards per pack, 36 packs per box")
    print("Excluded related issues: Topps Mini, O-Pee-Chee, mail-in Team Checklists, Topps Vault File Copy")


if __name__ == "__main__":
    main()
