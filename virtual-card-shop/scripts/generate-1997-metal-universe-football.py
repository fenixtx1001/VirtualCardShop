from __future__ import annotations

import csv
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/set-factory/1997-metal-universe-football.cards.csv"

SOURCES = [
    ("base", 3986, 200),
    ("pmg-red", 34325, 198),
    ("pmg-green", 34326, 198),
    ("body-shop", 3988, 15),
    ("gold-universe", 3989, 10),
    ("iron-rookies", 3990, 15),
    ("marvel-metal-universe", 3991, 20),
    ("platinum-portraits", 3992, 10),
    ("titanium", 3993, 20),
]
ROOKIE_URL = "https://www.tcdb.com/Rookies.cfm/sid/3986/1997-Metal-Universe"
EXPECTED_ROOKIES = set(range(174, 199))
SOURCE_SUFFIX = re.compile(
    r"\s+(?:(?:RC|ROO|UER|ERR|COR|VAR|SN\d+|PR\d+|AU|MEM)(?:[,;\s]+|$))+$",
    re.I,
)
ANNOTATION = re.compile(r"\s+(?:SN\d+|PR\d+|RC|ROO|UER|ERR|COR|VAR)\b.*$", re.I)

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
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
        "Accept": "text/html,application/xhtml+xml"
    })
    with urllib.request.urlopen(req, timeout=35) as res:
        return res.read().decode("utf-8", errors="replace")

def collect(url, expected, label):
    cards = {}
    for page in range(1, 8):
        parsed = Rows()
        parsed.feed(fetch(url + ("&" if "?" in url else "?") + f"PageIndex={page}"))
        additions = 0
        for row in parsed.rows:
            cells = [c for c in row if c]
            for i, val in enumerate(cells):
                if not re.fullmatch(r"\d{1,3}", val) or i+1 >= len(cells):
                    continue
                number = int(val)
                if not (1 <= number <= 200):
                    continue
                raw = cells[i+1]
                if raw.lower() in ("options", "add", "edit"):
                    continue
                name = ANNOTATION.sub("", raw).strip(" ,;")
                name = SOURCE_SUFFIX.sub("", name).strip(" ,;")
                team = cells[-1] if i+2 < len(cells) else ""
                if team == raw:
                    team = ""
                if not name:
                    raise SystemExit(f"{label} #{number} has empty subject: {raw!r}")
                entry = (name, team)
                if number in cards:
                    if cards[number] != entry:
                        raise SystemExit(
                            f"{label} duplicate #{number}: {cards[number]!r} vs {entry!r}"
                        )
                else:
                    cards[number] = entry
                    additions += 1
                break
        print(f"{label} page {page}: +{additions} ({len(cards)}/{expected})")
        if len(cards) == expected:
            break
        if page > 1 and additions == 0:
            break
    if len(cards) != expected:
        raise SystemExit(f"{label}: expected {expected}, parsed {len(cards)}; refuse incomplete import")
    return cards

def main():
    rookies = collect(ROOKIE_URL, 25, "rookies")
    if set(rookies) != EXPECTED_ROOKIES:
        raise SystemExit(f"Unexpected true rookie numbers: {sorted(rookies)}")

    all_rows = []
    base_lookup = None
    pmg_numbers = None
    for key, sid, expected in SOURCES:
        cards = collect(
            f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1997-Metal-Universe",
            expected, key
        )
        if key == "base":
            if set(cards) != set(range(1, 201)):
                raise SystemExit("Base checklist #1-200 incomplete")
            base_lookup = cards
        if key in ("pmg-red", "pmg-green"):
            if pmg_numbers is not None and set(cards) != pmg_numbers:
                raise SystemExit("PMG red and green checklist numbering differs")
            pmg_numbers = set(cards)
            for number, (player, team) in list(cards.items()):
                if number not in base_lookup:
                    raise SystemExit(f"{key} #{number} has no base counterpart")
                base_player, base_team = base_lookup[number]
                if (player, team) != (base_player, base_team):
                    # TCDB source discrepancy: PMG #191 lists Tyrus McCloud
                    # under Arizona Cardinals; its Base #191 lists Baltimore Ravens.
                    # Preserve canonical base affiliation for VCS parallel inheritance.
                    if number == 191 and player == "Tyrus McCloud" and team == "Arizona Cardinals" and base_team == "Baltimore Ravens":
                        print(f"{key} #191: TCDB team mismatch (Arizona Cardinals); inheriting base Baltimore Ravens")
                        cards[number] = (base_player, base_team)
                    else:
                        raise SystemExit(
                            f"{key} #{number} source mismatch: PMG {(player, team)!r} vs Base {(base_player, base_team)!r}"
                        )

        for number, (name, team) in sorted(cards.items()):
            if key == "base" and number in (199, 200):
                if not name.lower().startswith("checklist"):
                    raise SystemExit(f"Expected base checklist at #{number}: {name!r}")
                team = "NFL"
            if not team:
                raise SystemExit(f"{key} #{number} {name} is missing team")
            if key == "base" and number in EXPECTED_ROOKIES:
                name += " RC"
            # Rookie indicators belong to the flagship base cards, not inserted
            # cards that feature already-established subjects from the same year.
            variant = ""
            if key == "pmg-red":
                variant = "Precious Metal Gems Red SN150"
            elif key == "pmg-green":
                variant = "Precious Metal Gems Green SN150"
            all_rows.append((key, str(number), name, team, "", variant))

    total_expected = sum(item[2] for item in SOURCES)
    if len(all_rows) != total_expected:
        raise SystemExit(f"Expected {total_expected} cards, got {len(all_rows)}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows(all_rows)

    print("=== 1997 METAL UNIVERSE FOOTBALL CHECKLIST GENERATED ===")
    print(f"ProductSets: {len(SOURCES)}; explicit cards: {len(all_rows)}")
    print("Verified flagship RCs: 25 (#174-198)")
    print(f"CSV: {OUT}")
    print("Draft: UNRELEASED. Pricing/images and PMG pack odds remain pending.")

if __name__ == "__main__":
    main()
