#!/usr/bin/env python3
"""Generate the 1997 Topps Finest Baseball unreleased Set Factory checklist.

Preserves the three 1997 Finest card-number printing errors, tier-specific
distribution odds and the original successful TCDB request headers. Fail-closed:
never write a partial CSV. Does not connect to the database.
"""
from __future__ import annotations

import argparse
import csv
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/set-factory/1997-finest-baseball.cards.csv"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VCS Set Factory research import)",
    "Accept": "text/html,application/xhtml+xml",
}
CHECKLISTS = (
    ("finest", 922, 350),
    ("refractors", 923, 350),
    ("embossed", 10901, 150),
    ("embossed-refractors", 10902, 150),
)
SETS = {
    ("finest", "BRZ"): ("bronze", 200, "Bronze"),
    ("finest", "SIL"): ("silver", 100, "Silver"),
    ("finest", "GOLD"): ("gold", 50, "Gold"),
    ("refractors", "BRZ"): ("bronze-refractors", 200, "Bronze Refractor"),
    ("refractors", "SIL"): ("silver-refractors", 100, "Silver Refractor"),
    ("refractors", "GOLD"): ("gold-refractors", 50, "Gold Refractor"),
    ("embossed", "SIL"): ("silver-embossed", 100, "Silver Embossed"),
    ("embossed", "GOLD"): ("gold-embossed", 50, "Gold Embossed Die-Cut"),
    ("embossed-refractors", "SIL"): (
        "silver-embossed-refractors", 100, "Silver Embossed Refractor"
    ),
    ("embossed-refractors", "GOLD"): (
        "gold-embossed-refractors", 50, "Gold Embossed Die-Cut Refractor"
    ),
}
ROOKIES = {
    "206": ("Brian Giles", "BRZ"),
    "249": ("Bubba Trammell", "BRZ"),
    "320": ("Hideki Irabu", "SIL"),
    "337": ("Jose Cruz Jr.", "GOLD"),
}
# All 350 physical cards exist, but these three intended printed numbers do not.
# The TCDB 'b' suffix differentiates the genuinely different players printed
# with the SAME 135/155/164 back numbers. We preserve both cards, not errors.
RENUMBERED = {
    "155b": (5, "BRZ"),
    "135b": (115, "SIL"),
    "164b": (172, "GOLD"),
}
BAD_PHYSICAL_NUMBERS = {"5", "115", "172"}
EXPECTED_IDS = ({str(x) for x in range(1, 351)} - BAD_PHYSICAL_NUMBERS) | set(RENUMBERED)
TIER_TAG = re.compile(r"(?<![A-Za-z])(BRZ|SIL|GOLD)(?![A-Za-z])", re.I)
PRINTED_NUMBER = re.compile(r"\d{1,3}(?:[a-zA-Z])?")


class Rows(HTMLParser):
    """Match the table-cell reader from successful 1997 Fleer Set Factory."""
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


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"TCDB HTTP {exc.code} at {url}: cannot validate all "
            "checklists; NO CSV written"
        ) from exc


def normalize(raw: str) -> tuple[str, str]:
    """Remove foil and error commentary; preserve actual player identity."""
    value = " ".join(raw.split()).strip()
    tag = TIER_TAG.search(value)
    if not tag:
        raise SystemExit(f"TCDB card missing BRZ/SIL/GOLD tier tag: {raw!r}")
    tier = tag.group(1).upper()
    player = value[:tag.start()].strip(" ,;")
    # The foil designation is part of the card's tier, not its player name.
    # Everything after it is source commentary, not collectible variants.
    if not player or re.search(r"\b(?:UER|ERR|COR|VAR)\b", player, re.I):
        raise SystemExit(f"TCDB player name not clean: {raw!r} -> {player!r}")
    return player, tier


def expected_tier(number: str) -> str:
    if number in RENUMBERED:
        return RENUMBERED[number][1]
    if number in BAD_PHYSICAL_NUMBERS:
        raise SystemExit(
            f"Nonexistent printed card #{number}: keep real misnumbered cards"
        )
    if not number.isdigit():
        raise SystemExit(f"Unexpected card number suffix {number!r}")
    n = int(number)
    if (1 <= n <= 100) or (176 <= n <= 275):
        return "BRZ"
    if (101 <= n <= 150) or (276 <= n <= 325):
        return "SIL"
    if (151 <= n <= 175) or (326 <= n <= 350):
        return "GOLD"
    raise SystemExit(f"Out-of-range card #{number}")


def fetch_cards(label: str, sid: int, expected: int) -> dict:
    cards = {}
    for page in range(1, 7):
        parser = Rows()
        parser.feed(fetch(
            f"https://www.tcdb.com/Checklist.cfm/sid/{sid}/1997-Finest"
            f"?PageIndex={page}"
        ))
        source_rows = 0
        added = 0
        for row in parser.rows:
            values = [v.strip() for v in row if v.strip()]
            for idx, val in enumerate(values):
                if not PRINTED_NUMBER.fullmatch(val):
                    continue
                if idx + 1 >= len(values):
                    continue
                num = val.lower()
                # Card identifiers are drawn exclusively from verified
                # physical printing, including three TCDB 'b' disambiguators.
                if num not in EXPECTED_IDS:
                    continue
                raw = values[idx + 1]
                if raw.lower() in ("add", "edit", "options"):
                    continue
                name, tier = normalize(raw)
                if tier != expected_tier(num):
                    raise SystemExit(
                        f"{label} #{num} {name}: foil {tier} disagrees with "
                        f"verified physical tier {expected_tier(num)}"
                    )
                team = values[-1] if idx + 2 < len(values) else ""
                if team == raw:
                    team = ""
                source_rows += 1
                value = (name, team, tier)
                if num in cards:
                    if cards[num] != value:
                        raise SystemExit(
                            f"{label} duplicate #{num}: "
                            f"{cards[num]!r} versus {value!r}"
                        )
                else:
                    cards[num] = value
                    added += 1
                break
        print(
            f"{label} page {page}: parsed {source_rows}; "
            f"+{added}; {len(cards)}/{expected}", flush=True
        )
        if len(cards) == expected:
            break
        if page > 1 and source_rows == 0:
            break
    if len(cards) != expected:
        raise SystemExit(
            f"{label}: expected {expected} collectible entries, "
            f"found {len(cards)}; NO CSV written"
        )
    if label in ("finest", "refractors"):
        required = EXPECTED_IDS
    else:
        required = {n for n in EXPECTED_IDS if expected_tier(n) != "BRZ"}
    if set(cards) != required:
        missing = sorted(required-set(cards))
        extra = sorted(set(cards)-required)
        raise SystemExit(
            f"{label}: wrong numbering; missing {missing[:15]}, "
            f"extra {extra[:15]}; NO CSV written"
        )
    return cards


def verify_rookies(base: dict) -> None:
    """Rookies are eligible on normal base-tier versions only."""
    parser = Rows()
    parser.feed(fetch(
        "https://www.tcdb.com/Rookies.cfm/sid/922/1997-Finest"
    ))
    observed = {}
    for row in parser.rows:
        vals = [v.strip() for v in row if v.strip()]
        for idx, val in enumerate(vals):
            if val not in ROOKIES or idx + 1 >= len(vals):
                continue
            player, tier = normalize(vals[idx+1])
            if val in observed and observed[val] != (player, tier):
                raise SystemExit(f"Conflicting rookie-index card #{val}")
            observed[val] = (player, tier)
            break
    if observed != ROOKIES:
        raise SystemExit(
            f"1997 Finest Rookie index diverged: source={observed!r}, "
            f"expected={ROOKIES!r}; NO CSV written"
        )
    for number, rookie in ROOKIES.items():
        if (base[number][0], base[number][2]) != rookie:
            raise SystemExit(f"Finest Base rookie #{number} identity differs")
    print("True RCs verified: 206 Brian Giles, 249 Bubba Trammell, "
          "320 Hideki Irabu, 337 Jose Cruz Jr.", flush=True)


def sort_key(card_id: str):
    return (int(re.match(r"\d+", card_id).group()),
            1 if card_id.endswith("b") else 0)


def self_test():
    if len(EXPECTED_IDS) != 350:
        raise SystemExit("Expected 350 genuine base subjects")
    for number, (_, foil) in RENUMBERED.items():
        if expected_tier(number) != foil:
            raise SystemExit(f"Misnumbered #{number} tier regression")
    if any(number in EXPECTED_IDS for number in BAD_PHYSICAL_NUMBERS):
        raise SystemExit("Fictitious printed card number regression")
    if normalize("Barry Bonds BRZ") != ("Barry Bonds", "BRZ"):
        raise SystemExit("Bronze tier parser regression")
    if normalize(
        "Ken Caminiti SIL, UER UER: #135 on back, should be #115"
    ) != ("Ken Caminiti", "SIL"):
        raise SystemExit("Silver numbering-error parser regression")
    if normalize(
        "Jay Buhner GOLD, UER UER: #164 on back, was supposed to be #172"
    ) != ("Jay Buhner", "GOLD"):
        raise SystemExit("Gold numbering-error parser regression")
    if sum(entry[1] for entry in SETS.values()) != 1000:
        raise SystemExit("Bundle counts must total 1000")
    if len(SETS) != 10:
        raise SystemExit("Expected ten tier-specific ProductSets")
    print("Finest 1997 self-tests passed (tiers, errors, odds pools, counts)")


def main():
    self_test()
    collections = {}
    for label, sid, expected in CHECKLISTS:
        collections[label] = fetch_cards(label, sid, expected)
    base = collections["finest"]
    verify_rookies(base)

    # Different team names are normalized only after verifying that the
    # printed number, player's name and foil tier match the true base card.
    mismatches = []
    team_updates = []
    for label, cards in collections.items():
        if label == "finest":
            continue
        for number, (player, team, foil) in list(cards.items()):
            base_player, base_team, base_foil = base[number]
            if (player, foil) != (base_player, base_foil):
                mismatches.append((
                    label,number,player,foil,base_player,base_foil
                ))
                continue
            if team != base_team:
                team_updates.append((label,number,player,team,base_team))
                cards[number] = (base_player, base_team, foil)
    if mismatches:
        for mismatch in sorted(mismatches):
            print("PARALLEL PLAYER MISMATCH:", mismatch)
        raise SystemExit(
            f"{len(mismatches)} unexpected parallel identities; "
            "NO CSV written"
        )
    if len(team_updates)>25:
        raise SystemExit(
            f"{len(team_updates)} parallel team mismatches "
            "need source review; NO CSV written"
        )
    for label,number,player,old,new in team_updates:
        print(f"{label} #{number} {player}: TCDB team {old!r} -> {new!r}")
    print(f"Parallel subject checks passed; {len(team_updates)} team corrections")

    counts = {key: 0 for key,_,_ in SETS.values()}
    rows=[]
    for family,cards in collections.items():
        for number in sorted(cards, key=sort_key):
            player, team, foil=cards[number]
            if not team:
                raise SystemExit(
                    f"{family} #{number} {player} missing team; "
                    "NO CSV written"
                )
            set_key, _count, finish=SETS[(family, foil)]
            counts[set_key]+=1
            if family=="finest" and number in ROOKIES:
                player+=" RC"
            rows.append((set_key,number,player,team,"",finish))

    for (family,tier),(key,count,finish) in SETS.items():
        if counts[key] != count:
            raise SystemExit(
                f"{key}: expected {count} cards, got {counts[key]}; "
                "NO CSV written"
            )
    if len(rows)!=1000:
        raise SystemExit(f"Expected 1000 collectible cards; got {len(rows)}")
    if len(set((r[0],r[1]) for r in rows))!=len(rows):
        raise SystemExit("Duplicate ProductSet/cardNumber keys")

    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    with OUTPUT.open("w",encoding="utf-8",newline="") as file:
        writer=csv.writer(file,lineterminator="\n")
        writer.writerow(
            ["setKey","cardNumber","player","team","subset","variant"]
        )
        writer.writerows(rows)
    print("=== 1997 FINEST BASEBALL GENERATED ===")
    print(f"Product Sets: {len(SETS)}; collectible cards: {len(rows)}")
    for key in counts:
        print(f"  {key}: {counts[key]}")
    print("Base rookie names: four TCDB-confirmed individual true RCs")
    print("Three 1997 printing errors preserved as distinct b-suffix keys")
    print("Excluded five promotional sample refractors")
    print(f"CSV: {OUTPUT}")
    print("Status: UNRELEASED; completion/odds, images and prices need QA")


if __name__ == "__main__":
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument("--self-test",action="store_true",
                      help="offline regression tests only; no requests")
    options=args.parse_args()
    if options.self_test:
        self_test()
    else:
        main()
