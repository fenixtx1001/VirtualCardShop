from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import csv
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1977-topps-baseball.cards.csv"

BASE_URL = "https://www.tcdb.com/Checklist.cfm/sid/79/1977-Topps?PageIndex={}"

# TCDB Rookie Cards index for 1977 Topps. These are true recognized rookie cards;
# do not infer RC status merely from a card/subset containing the word "Rookie".
TRUE_RC_CARDS = {
    13, 16, 67, 83, 89, 91, 103, 104, 118, 131, 132, 136, 137, 142, 144,
    153, 161, 173, 175, 178, 179, 184, 204, 218, 222, 227, 247, 249, 265,
    268, 291, 308, 312, 328, 333, 341, 376, 379, 389, 394, 397, 399, 472,
    473, 474, 475, 476, 477, 478, 479, 487, 488, 489, 490, 491, 492, 493,
    494, 517, 529, 548, 554, 559, 577, 578, 592, 596, 616, 627, 641, 646,
    654, 657,
}

if len(TRUE_RC_CARDS) != 73:
    raise SystemExit(f"Expected 73 TCDB rookie-card records, found {len(TRUE_RC_CARDS)}")


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
            value = " ".join("".join(self.cell).split())
            self.row.append(value)
            self.in_td = False
            self.cell = []
        elif tag == "tr" and self.in_tr:
            if self.row:
                self.rows.append(self.row)
            self.in_tr = False
            self.row = []


def fetch_page(page_index: int) -> str:
    url = BASE_URL.format(page_index)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_cards(html: str) -> list[tuple[int, str, str]]:
    parser = RowParser()
    parser.feed(html)
    found: list[tuple[int, str, str]] = []

    for row in parser.rows:
        vals = [value for value in row if value]
        for i, value in enumerate(vals):
            if not re.fullmatch(r"\d{1,3}", value):
                continue
            number = int(value)
            if not (1 <= number <= 660):
                continue
            if i + 1 >= len(vals):
                continue

            name = vals[i + 1].strip()
            if not name or name.lower() in {"options", "add", "edit"}:
                continue

            team = vals[i + 2].strip() if i + 2 < len(vals) else ""
            # Rows with a checklist card legitimately have no team.
            if name.lower().startswith("checklist"):
                team = ""

            found.append((number, name, team))
            break

    return found


def classify_subset(number: int, name: str) -> str:
    lower = name.lower()
    if 1 <= number <= 8:
        return "League Leaders"
    if 231 <= number <= 234:
        return "Record Breakers"
    if 276 <= number <= 277:
        return "League Championship Series"
    if 411 <= number <= 413:
        return "World Series"
    if 433 <= number <= 437:
        return "Turn Back the Clock"
    if 472 <= number <= 479 or 487 <= number <= 494:
        return "Rookie Prospects"
    if 631 <= number <= 634:
        return "Big League Brothers"
    if lower.startswith("checklist"):
        return "Checklist"
    if " tc" in f" {lower}" or "team" in lower and "checklist" not in lower:
        return "Team Card"
    if " asr" in f" {lower}":
        return "All-Star Rookie"
    if re.search(r"\bAS\b", name):
        return "All-Star"
    return ""


def normalize_name(number: int, raw_name: str) -> tuple[str, str]:
    # Preserve useful printed/checklist descriptors as variant metadata rather than
    # allowing generic "Rookie" wording to create an RC designation.
    name = re.sub(r"\s+RC\s*$", "", raw_name).strip()
    variant_tags: list[str] = []

    for tag in ("UER", "ERR", "COR", "CL", "MGR", "CO", "TC", "LL", "ASR", "AS", "WS"):
        if re.search(rf"(?:^|\s){tag}(?:\s|$)", name):
            variant_tags.append(tag)

    if number in TRUE_RC_CARDS:
        name = f"{name} RC"
        variant_tags.append("RC")

    return name, "; ".join(dict.fromkeys(variant_tags))


def main() -> None:
    cards: dict[int, tuple[str, str]] = {}

    for page_index in range(1, 8):
        html = fetch_page(page_index)
        page_cards = parse_cards(html)
        if not page_cards:
            raise SystemExit(f"No checklist cards parsed from TCDB page {page_index}")
        for number, name, team in page_cards:
            cards[number] = (name, team)
        print(f"Page {page_index}: parsed {len(page_cards)} rows; cumulative unique {len(cards)}")

    missing = [number for number in range(1, 661) if number not in cards]
    if missing:
        raise SystemExit(f"Checklist incomplete; missing {len(missing)} card numbers: {missing[:30]}")
    if len(cards) != 660:
        raise SystemExit(f"Expected exactly 660 unique cards, found {len(cards)}")

    rows: list[list[str]] = []
    rc_count = 0
    for number in range(1, 661):
        raw_name, team = cards[number]
        player, variant = normalize_name(number, raw_name)
        subset = classify_subset(number, raw_name)
        if number in TRUE_RC_CARDS:
            rc_count += 1
        rows.append(["base", str(number), player, team, subset, variant])

    if rc_count != 73:
        raise SystemExit(f"Expected 73 true RC cards, found {rc_count}")

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(rows)

    print("=== 1977 TOPPS BASEBALL CHECKLIST GENERATED ===")
    print(f"Created: {OUT.name}")
    print(f"Base cards: {len(rows)}")
    print(f"Recognized true RC cards labeled in player row: {rc_count}")
    print("Expected Product Sets: 1")
    print("Total resolved cards expected: 660")


if __name__ == "__main__":
    main()
