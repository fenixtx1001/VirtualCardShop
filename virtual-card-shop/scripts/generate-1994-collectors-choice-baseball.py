"""Build the 1994 Collector's Choice Baseball draft from a frozen checklist.

Full Signature parallels are generated from Base here so card-specific errors
and the distinct Up Close signature-color bars remain visible in Variant. The
source fixture omits factory-only or print-color variations of a numbered card.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import csv
import re


DATA = Path(__file__).resolve().parents[1] / "data" / "set-factory"
SOURCE = DATA / "1994-collectors-choice-baseball.source.csv"
OUTPUT = DATA / "1994-collectors-choice-baseball.cards.csv"
EXPECTED = {"base": 670, "team-vs-team": 15, "instant-winner": 2}

# TCDB's 32 rookie-index records resolve to 29 distinct base numbers after
# collapsing three white-letter variation entries.
ROOKIES = {
    5, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 42, 97, 173, 188,
    233, 274, 611, 612, 614, 641, 643, 645, 647, 648, 649, 653,
    661, 667,
}


def base_subset(number: int) -> str:
    if 1 <= number <= 20 or 651 <= number <= 670:
        return "Rookie Class"
    if 21 <= number <= 30:
        return "First Draft Picks"
    if 306 <= number <= 315:
        return "Top Performers"
    if 316 <= number <= 327:
        return "Checklist"
    if 328 <= number <= 355:
        return "Team Checklist"
    if 631 <= number <= 640:
        return "Up Close"
    if 641 <= number <= 650:
        return "Future Foundations"
    return "Base"


def main() -> None:
    with SOURCE.open(newline="", encoding="utf-8") as handle:
        source = list(csv.DictReader(handle))
    counts = Counter(row["setKey"] for row in source)
    assert counts == EXPECTED, f"Unexpected checklist counts: {counts}"
    assert {int(row["cardNumber"]) for row in source if row["setKey"] == "base"} == set(range(1, 671))
    assert {row["cardNumber"] for row in source if row["setKey"] == "team-vs-team"} == {
        f"NNO-{index:02}" for index in range(1, 16)
    }
    assert {row["cardNumber"] for row in source if row["setKey"] == "instant-winner"} == {"NNO-01", "NNO-02"}

    cards: list[dict[str, str]] = []
    for row in source:
        key, number, label, team, detail = (row[field].strip() for field in
            ("setKey", "cardNumber", "sourceLabel", "team", "detail"))
        assert label and not re.search(r"\b(?:UER|ERR|COR|VAR|RCL|FRDP|FF)\b", label), (key, number, label)
        if key == "base":
            index = int(number)
            assert team, (key, number, label)
            # The set has two Brian Hunters; the Houston rookie uses his
            # middle initial on the contemporary checklist for disambiguation.
            clean_name = "Brian L. Hunter" if index == 659 else label
            player = f"{clean_name} RC" if index in ROOKIES else clean_name
            subset, variant = base_subset(index), detail
            if subset == "Checklist":
                assert re.fullmatch(r"Checklist: \d+-\d+", variant), (number, variant)
            elif subset == "Top Performers":
                assert variant and not variant.startswith("UER:"), (number, variant)
            elif 631 <= index <= 640:
                assert variant == "Black stripe on lower front", (number, variant)
        elif key == "team-vs-team":
            assert " / " in label and " / " in team
            player, subset, variant = label, "Team vs. Team", "Scratch-off game piece; contest expired"
        else:
            assert key == "instant-winner" and not team and detail
            player, subset = label, "Instant Winner Redemption"
            variant = f"Expired redemption for {detail}"
        cards.append(dict(setKey=key, cardNumber=number, player=player,
                          team=team, subset=subset, variant=variant))

    base_cards = [card for card in cards if card["setKey"] == "base"]
    for key, label, stripe in (
        ("silver-signature", "Silver Signature", "silver"),
        ("gold-signature", "Gold Signature", "gold"),
    ):
        for base_card in base_cards:
            number = int(base_card["cardNumber"])
            extras: list[str] = []
            if 631 <= number <= 640:
                extras.append(f"{stripe.title()} stripe on lower front")
            elif base_card["variant"]:
                extras.append(base_card["variant"])
            if number == 123:
                extras.append("UER: Facsimile autograph belongs to Roland Hemond")
            cards.append({**base_card, "setKey": key,
                          "variant": "; ".join([label, *extras])})

    assert len(cards) == 2027
    assert len({(card["setKey"], card["cardNumber"]) for card in cards}) == len(cards)
    assert sum(card["player"].endswith(" RC") for card in cards) == 87
    assert sum(not card["team"] for card in cards) == 2
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=("setKey", "cardNumber", "player", "team", "subset", "variant"), lineterminator="\n")
        writer.writeheader()
        writer.writerows(cards)
    print(f"Wrote {len(cards)} cards, including 1,340 generated Signature parallels")


if __name__ == "__main__":
    main()
