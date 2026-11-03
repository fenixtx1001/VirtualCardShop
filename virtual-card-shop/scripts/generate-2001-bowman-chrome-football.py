"""Build the 2001 Bowman Chrome Football Set Factory CSV from a frozen source fixture.

The source file records the TCDB checklist as researched. This script performs no
network requests, so the result is reproducible during review and import.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import csv
import re


ROOT = Path(__file__).resolve().parents[1] / "data" / "set-factory"
SOURCE = ROOT / "2001-bowman-chrome-football.source.csv"
OUTPUT = ROOT / "2001-bowman-chrome-football.cards.csv"
EXPECTED = {
    "base": 255,
    "1996-rookies": 15,
    "autographs": 28,
    "draft-day-relics": 12,
    "mini-helmet-redemptions": 10,
    "rookie-relics": 23,
    "rookie-reprints": 16,
    "pack-checklist": 1,
}
SUBSETS = {
    "1996-rookies": "1996 Rookies Refractor",
    "autographs": "Autographs",
    "draft-day-relics": "Draft Day Relics",
    "mini-helmet-redemptions": "Mini Helmet Autographs Redemption",
    "rookie-relics": "Rookie Relics",
    "rookie-reprints": "Rookie Reprints",
    "pack-checklist": "Checklist",
}
REPRINT_NAMES = {
    "Y.A. Tittle, Jr.": "Y.A. Tittle",
    "Charles (Chucking) Conerly": "Charles Conerly",
    "Samuel (Slingin' Sam) Baugh": "Sammy Baugh",
    "Clyde (Bulldog) Turner": "Clyde Turner",
}


def main() -> None:
    with SOURCE.open(newline="", encoding="utf-8") as handle:
        source = list(csv.DictReader(handle))

    counts = Counter(row["setKey"] for row in source)
    assert counts == EXPECTED, f"Checklist counts differ: {counts}"
    assert len(source) == 360
    base_numbers = {row["cardNumber"] for row in source if row["setKey"] == "base"}
    assert base_numbers == {str(number) for number in range(1, 256)}

    seen: set[tuple[str, str]] = set()
    cards: list[dict[str, str]] = []
    rookie_numbers: set[int] = set()
    for row in source:
        key, number, label, team, detail = (row[field].strip() for field in
            ("setKey", "cardNumber", "sourceLabel", "team", "detail"))
        assert (key, number) not in seen, f"Duplicate {key} #{number}"
        seen.add((key, number))
        assert label and (team or key == "pack-checklist"), (key, number)
        subset = SUBSETS.get(key, "Base")
        variant = ""

        if key == "base":
            if int(number) >= 111:
                # TCDB's rookie-card index recognizes exactly this #111-255 run.
                assert label.endswith(" RC, SN1999"), (number, label)
                player = label.removesuffix(" RC, SN1999") + " RC"
                subset = "Rookie Refractors"
                variant = "Refractor; SN1999"
                rookie_numbers.add(int(number))
            else:
                assert not re.search(r"\b(?:RC|SN\d+)\b", label), (number, label)
                player = label
        elif key == "1996-rookies":
            player = label
            variant = "Refractor"
        elif key == "autographs":
            assert label.endswith(" AU")
            player = label.removesuffix(" AU")
            variant = "Autograph"
        elif key == "draft-day-relics":
            assert label.endswith(" MEM") and detail.lower() in {"hat", "jersey"}
            assert number.startswith("DH-") == (detail.lower() == "hat")
            player = label.removesuffix(" MEM")
            variant = f"Draft day worn {detail.lower()}"
        elif key == "mini-helmet-redemptions":
            assert label.endswith(" EXCH")
            player = label.removesuffix(" EXCH")
            variant = "Expired redemption for autographed mini helmet"
        elif key == "rookie-relics":
            assert label.endswith(" MEM")
            player = label.removesuffix(" MEM")
            variant = "Event-worn jersey"
        elif key == "rookie-reprints":
            player = REPRINT_NAMES.get(label, label)
            variant = "Historical rookie-card reprint"
        else:
            assert key == "pack-checklist" and number == "NNO" and label == "Checklist CL"
            player = "Checklist"

        assert not re.search(r"\b(?:AU|MEM|EXCH|SN\d+|UER|ERR|COR)\b", player), (key, number, player)
        cards.append(dict(setKey=key, cardNumber=number, player=player,
                          team=team, subset=subset, variant=variant))

    assert rookie_numbers == set(range(111, 256))
    assert len(cards) == 360
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=("setKey", "cardNumber", "player", "team", "subset", "variant"), lineterminator="\n")
        writer.writeheader()
        writer.writerows(cards)
    print(f"Wrote {len(cards)} explicit cards to {OUTPUT}; 510 parallel cards derive from Base")


if __name__ == "__main__":
    main()
