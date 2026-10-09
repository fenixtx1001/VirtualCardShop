from __future__ import annotations

import csv
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/set-factory/1997-fleer-football.cards.csv"

# Source and request protocol intentionally match the successful 1997 Metal
# Universe Football Set Factory generator. Do not simplify the headers.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
    "Accept": "text/html,application/xhtml+xml",
}
SOURCES = [
    ("base", 3961, 450),
    ("traditions-crystal", 34307, 450),
    ("traditions-tiffany", 34311, 450),
    ("decade-of-excellence", 3963, 12),
    ("decade-of-excellence-rare-traditions", 299126, 12),
    ("fleer-all-pro", 3962, 24),
    ("game-breakers", 3964, 20),
    ("game-breakers-supreme", 34309, 20),
    ("prospects-97", 3975, 10),
    ("rookie-sensations", 3976, 20),
    ("thrill-seekers", 3977, 12),
]
EXPECTED_ROOKIES = {142, 191, 207, 333, 423, 427, 428, 431, 437, 441, 442}
TAGS = re.compile(
    r"(?:[\s,;]+(?:RC|SS|LL|AP|SBXXXI|CL|UER|ERR|COR|VAR))+\s*(?::\s*.*)?$",
    re.IGNORECASE,
)
SOURCE_NOTES = re.compile(r"\s*;\s*(?:UER|ERR|COR|VAR)\s*:\s*.*$", re.IGNORECASE)
LEAKED_NOTES = re.compile(r"(?:^|[ ,;])(?:UER|ERR|COR|VAR)(?=$|[ ,;:])", re.IGNORECASE)

class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=35) as res:
            return res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"TCDB HTTP {exc.code} at {url}: unable to verify checklist, "
            "no new CSV written"
        ) from exc

def normalize(raw):
    name = " ".join(raw.split()).strip()
    name = SOURCE_NOTES.sub("", name).strip(" ,;")
    for _ in range(4):
        updated = TAGS.sub("", name).strip(" ,;")
        if updated == name:
            break
        name = updated
    if not name or LEAKED_NOTES.search(name):
        raise SystemExit(f"Unable to normalize TCDB subject {raw!r}: {name!r}")
    return name

def fetch_cards(url, expected, label, max_pages=9):
    cards = {}
    for page in range(1, max_pages + 1):
        parser = Rows()
        parser.feed(fetch(f"{url}?PageIndex={page}"))
        added = 0
        parsed_count = 0
        for row in parser.rows:
            values = [v.strip() for v in row if v.strip()]
            for idx, val in enumerate(values):
                if not re.fullmatch(r"\d{1,3}", val) or idx + 1 >= len(values):
                    continue
                number = int(val)
                if number < 1 or number > 450:
                    continue
                raw = values[idx + 1]
                if raw.lower() in ("add", "edit", "options"):
                    continue
                parsed_count += 1
                name = normalize(raw)
                team = values[-1] if idx + 2 < len(values) else ""
                if team == raw:
                    team = ""
                card = (name, team, raw)
                existing = cards.get(number)
                if existing is not None and existing[:2] != card[:2]:
                    raise SystemExit(
                        f"{label} #{number}: printed variants disagree: "
                        f"{existing[:2]!r} versus {card[:2]!r}"
                    )
                if existing is None:
                    cards[number] = card
                    added += 1
                break
        print(f"{label} page {page}: {parsed_count} source rows; +{added}; {len(cards)}/{expected}")
        if len(cards) == expected:
            break
        if page > 1 and parsed_count == 0:
            break
    if len(cards) != expected:
        raise SystemExit(
            f"{label}: expected {expected} unique numbers, got {len(cards)} "
            "(CSV not written)"
        )
    return cards

def subset(name, raw):
    if re.search(r"\bCL\b", raw): return "Checklist"
    if re.search(r"\bSS\b", raw): return "Star Studded"
    if re.search(r"\bSBXXXI\b", raw): return "Super Bowl XXXI"
    if re.search(r"\bAP\b", raw): return "All-Pro"
    if re.search(r"\bLL\b", raw): return "League Leaders"
    return ""

def main():
    rookies = fetch_cards(
        "https://www.tcdb.com/Rookies.cfm/sid/3961/1997-Fleer",
        len(EXPECTED_ROOKIES), "rookies", max_pages=3
    )
    if set(rookies) != EXPECTED_ROOKIES:
        raise SystemExit(
            f"Rookie-index card numbers differ from verified 11: {sorted(rookies)}"
        )

    all_rows = []
    base_cards = None
    for key, sid, expected in SOURCES:
        cards = fetch_cards(
            f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1997-Fleer",
            expected,
            key,
        )
        if key == "base":
            if set(cards) != set(range(1, 451)):
                raise SystemExit("Base checklist missing printed numbers #1-450")
            base_cards = cards
        if key in ("traditions-crystal", "traditions-tiffany"):
            if set(cards) != set(base_cards):
                raise SystemExit(f"{key} not a full 450-card base parallel")
            for number, (name, team, _raw) in cards.items():
                if (name, team) != base_cards[number][:2]:
                    raise SystemExit(
                        f"{key} #{number}: parallel subject/team not equal to base "
                        f"{(name, team)!r} vs {base_cards[number][:2]!r}"
                    )
        for number, (name, team, raw) in sorted(cards.items()):
            if not team and "checklist" in name.lower():
                team = "NFL"
            if not team:
                raise SystemExit(f"{key} #{number} ({name}) has no team")
            if key == "base" and number in EXPECTED_ROOKIES:
                name += " RC"
            variant = ""
            if key == "traditions-crystal":
                variant = "Traditions Crystal"
            elif key == "traditions-tiffany":
                variant = "Traditions Tiffany"
            all_rows.append((key, str(number), name, team,
                            subset(name, raw) if key == "base" else "", variant))

    # This is an actual special-retail insert recorded on TCDB's master
    # inserts page, not an invented parallel or an expired sweepstakes card.
    all_rows.append((
        "emerald-autograph", "AU1", "Reggie White", "Green Bay Packers",
        "", "Emerald Autograph SN80"
    ))

    expected = sum(x[2] for x in SOURCES) + 1
    if len(all_rows) != expected:
        raise SystemExit(f"Expected {expected} total cards; got {len(all_rows)}")
    uniqueness = {(x[0], x[1]) for x in all_rows}
    if len(uniqueness) != len(all_rows):
        raise SystemExit("Duplicate product set/card number")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1997 FLEER FOOTBALL CHECKLIST GENERATED ===")
    print(f"Product Sets: {len(SOURCES)+1}")
    print(f"Cards: {len(all_rows)}")
    print(f"Base true RCs: {len(EXPECTED_ROOKIES)}")
    print("Base/Crystal/Tiffany: each 450")
    print("Contest/redemption game cards: excluded")
    print(f"CSV: {OUT}")
    print("Status: UNRELEASED, pricing/scan and ratio review pending")

if __name__ == "__main__":
    main()
