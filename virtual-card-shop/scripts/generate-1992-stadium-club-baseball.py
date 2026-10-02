"""Generate the 1992 Stadium Club Baseball Set Factory CSV from a frozen checklist.

The source fixture records one collector slot for each of the 900 intended base
numbers. Minor copyright-letter print variants are collapsed. The Members' Choice
card intended as #597 has its printed #370 documented separately.
"""

from __future__ import annotations

from pathlib import Path
import csv
import re


DATA = Path(__file__).resolve().parents[1] / "data" / "set-factory"
SOURCE = DATA / "1992-stadium-club-baseball.source.csv"
OUTPUT = DATA / "1992-stadium-club-baseball.cards.csv"

# Independently checked against the TCDB Rookie Cards index. Its 132 listings
# represent 67 numbered subjects, mostly repeated for copyright-letter variants.
ROOKIES = {
    61, 65, 124, 127, 166, 247, 274, 288, 308, 336, 342, 352, 374, 385,
    402, 408, 411, 435, 438, 448, 462, 465, 481, 492, 498, 504, 508, 512,
    515, 543, 546, 553, 563, 569, 583, 611, 612, 615, 629, 637, 647, 676,
    681, 686, 689, 692, 714, 725, 733, 734, 742, 748, 757, 763, 775, 790,
    799, 802, 839, 847, 852, 853, 866, 878, 881, 891, 895,
}
CHECKLISTS = {298, 299, 300, 588, 589, 590, 898, 899, 900}
ERROR_DETAILS = {
    1: 'UER: Last name misspelled "Ripkin" on back',
    40: 'UER: Incorrect birth date on back; should read 9-22-61',
    58: 'UER: Wrong BARS chart on back',
    118: 'UER: Home city should read Tampa',
    198: 'UER: Career totals are lower than the 1991 totals',
    262: 'UER: Reversed photo image',
    309: 'UER: Height should read 5 feet 11 inches',
    596: 'UER: Rankings heading should read NL Rank',
    597: 'Printed #370; intended #597',
    628: 'UER: Birth date should read 11-12-68',
    682: 'UER: Rookie card is listed as 1983 Topps Traded but pictured as 1984 Topps',
    801: 'UER: Rookie card should be 1985 Topps',
    834: 'UER: Kentucky misspelled "Kentucy" on back',
}


def main() -> None:
    with SOURCE.open(newline="", encoding="utf-8") as handle:
        source = list(csv.DictReader(handle))

    assert len(source) == 903, f"Expected 903 source rows, got {len(source)}"
    base = [row for row in source if row["setKey"] == "base"]
    draft_picks = [row for row in source if row["setKey"] == "draft-picks"]
    assert len(base) == 900 and len(draft_picks) == 3
    assert {int(row["cardNumber"]) for row in base} == set(range(1, 901))
    assert {row["cardNumber"] for row in draft_picks} == {"1", "2", "3"}
    assert {int(row["cardNumber"]) for row in base if row["sourceLabel"].startswith("Checklist:")} == CHECKLISTS
    assert all(row["printedNumber"] == ("370" if row["cardNumber"] == "597" else "") for row in base)

    cards: list[dict[str, str]] = []
    for row in source:
        key, number, name, team = (row[field].strip() for field in
            ("setKey", "cardNumber", "sourceLabel", "team"))
        assert key in {"base", "draft-picks"} and name
        variant = ""
        if key == "base":
            index = int(number)
            subset = ("Checklist" if index in CHECKLISTS else
                      "Member's Choice" if 591 <= index <= 610 else "Base")
            if index in CHECKLISTS:
                assert not team
                match = re.fullmatch(r"Checklist: (\d+-\d+) CL", name)
                assert match, (number, name)
                player = "Checklist"
                variant = f"Covers #{match.group(1)}"
            else:
                assert team and not name.endswith(" RC"), (number, name, team)
                player = f"{name} RC" if index in ROOKIES else name
            if index in ERROR_DETAILS:
                variant = "; ".join(part for part in (variant, ERROR_DETAILS[index]) if part)
        else:
            assert team and not row["printedNumber"], (number, name)
            player, subset = name, "#1 Draft Picks of the '90s"

        assert not re.search(r"\b(?:UER|ERR|COR|VAR)\b", player), (number, player)
        cards.append(dict(setKey=key, cardNumber=number, player=player,
                          team=team, subset=subset, variant=variant))

    assert len({(card["setKey"], card["cardNumber"]) for card in cards}) == 903
    assert sum(card["player"].endswith(" RC") for card in cards) == 67
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=("setKey", "cardNumber", "player", "team", "subset", "variant"), lineterminator="\n")
        writer.writeheader()
        writer.writerows(cards)
    print(f"Wrote {len(cards)} cards to {OUTPUT}")


if __name__ == "__main__":
    main()
