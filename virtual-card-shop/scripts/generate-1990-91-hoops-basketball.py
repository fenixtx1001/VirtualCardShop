"""Build a unified 1990-91 Hoops Basketball Set Factory draft from a frozen checklist.

The companion CSV contains TCDB's 440-numbered-card checklist, its 14 alternate
printings and the unnumbered #13 error. It is not fetched by this generator.
"""

from __future__ import annotations

import csv
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/set-factory"
SOURCE = DATA / "1990-91-hoops-basketball.source.csv"
OUTPUT = DATA / "1990-91-hoops-basketball.cards.csv"
FLAGS = "AS SP UER ERR COR RS RC LP MIP TC CL CO VAR TRIB DFO HC COY MVP BTS SIS".split()
FLAGS_PATTERN = re.compile(r"\s+(" + "|".join(FLAGS) + r")(?:,\s*(" + "|".join(FLAGS) + r"))*$")
TRUE_ROOKIES = {
    34, 53, 57, 60, 66, 71, 98, 102, 113, 115, 121, 123, 130, 132,
    148, 154, 164, 168, 174, 188, 190, 193, 196, 197, 214, 215,
    233, 235, 248, 250, 254, 257, 267, 274, 279, 288, 293, 298,
    299, 336, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400,
}
VARIATION_NOTES = {
    "NNO": "Error; unnumbered All-Star checklist; missing #13",
    "13": "Corrected; numbered #13",
    "169a": "Error; birthplace Athens, Greece",
    "169b": "Corrected; birthplace Beirut, Lebanon",
    "171a": "Error; Billy Thompson numbered #171; Series II",
    "171b": "Corrected; Jon Sundvold numbered #171; Series I",
    "172a": "Error; Jon Sundvold numbered #172; Series II",
    "172b": "Corrected; Billy Thompson numbered #172; Series I",
    "223a": "Laying up; white jersey; Series I",
    "223b": "Dribbling; black jersey; Series II",
    "234a": "Forward on front; Series I",
    "234b": "Guard on front; Series II",
    "238a": "Forward on front; Series II",
    "238b": "Guard on front; Series I",
    "249a": "Error; no NBA logo on back",
    "249b": "Corrected; NBA logo on back",
    "298a": "Error; no rookie star on front",
    "298b": "Corrected; rookie star on front",
    "341a": "Error; no Sports banner on back",
    "341b": "Corrected; Sports banner on back",
    "378a": "Basketball fully visible on front",
    "378b": "Basketball half visible on front",
    "406a": "Error; no position on front",
    "406b": "Corrected; position on front",
    "414a": "Error; no position on front",
    "414b": "Corrected; position on front",
    "421a": "Error; no position on front",
    "421b": "Corrected; position on front",
    "438a": "Error; no position on front",
    "438b": "Corrected; position on front",
}


def parse_label(value: str) -> tuple[str, set[str]]:
    match = FLAGS_PATTERN.search(value)
    if match:
        flags = set(re.findall(r"[A-Z]{2,4}", value[match.start():]))
        name = value[:match.start()].strip()
    else:
        flags = set()
        name = value.strip()
    if not name:
        raise ValueError(f"Missing player or subject in {value!r}")
    return name.strip('"'), flags


def subset_for(number: int, flags: set[str], subject: str) -> str:
    if "Checklist" in subject:
        return "All-Star Checklist" if number == 13 else "Checklist"
    if number <= 26:
        return "All-Star"
    if 305 <= number <= 331 or 343 <= number <= 354:
        return "Coaches"
    if 337 <= number <= 342:
        return "NBA Finals"
    if 355 <= number <= 381:
        return "Team Checklist"
    if 382 <= number <= 389:
        return "Special Features"
    if 390 <= number <= 400:
        return "Lottery Picks"
    if 401 <= number <= 438:
        return "Series II Updates"
    if "RS" in flags or number == 336:
        return "Rookie Stars"
    if "MIP" in flags:
        return "Most Improved Player"
    if "MVP" in flags:
        return "Most Valuable Player"
    if "COY" in flags:
        return "Coach of the Year"
    return ""


def main() -> None:
    with SOURCE.open(encoding="utf-8", newline="") as source:
        snapshot = list(csv.DictReader(source))
    if len(snapshot) != 455:
        raise ValueError(f"Expected 455 checklist printings; found {len(snapshot)}")

    base: dict[int, list[str]] = {}
    alternates: list[list[str]] = []
    seen: set[str] = set()
    rookie_numbers: set[int] = set()
    for item in snapshot:
        source_number = item["number"]
        if source_number in seen:
            raise ValueError(f"Repeated source number: {source_number}")
        seen.add(source_number)
        if not re.fullmatch(r"\d{1,3}[ab]?|NNO", source_number):
            raise ValueError(f"Unexpected source number: {source_number}")
        number = 13 if source_number == "NNO" else int(source_number.rstrip("ab"))
        if not 1 <= number <= 440:
            raise ValueError(f"Out-of-range base number: {source_number}")

        subject, flags = parse_label(item["sourceLabel"])
        if "RC" in flags:
            rookie_numbers.add(number)
        if ("RC" in flags) != (number in TRUE_ROOKIES):
            raise ValueError(f"True RC mismatch: {source_number} {subject}")
        team = item["team"].strip()
        if not team and "Checklist" not in subject:
            raise ValueError(f"Missing team: {source_number} {subject}")
        subset = subset_for(number, flags, subject)
        player = subject
        variant = VARIATION_NOTES.get(source_number, "")
        if subject.startswith("Checklist: "):
            player = "Checklist"
            variant = "; ".join(filter(None, (variant, "Cards " + subject.removeprefix("Checklist: "))))
        if "SP" in flags:
            variant = "; ".join(filter(None, (variant, "Physical short print")))
        if "UER" in flags:
            variant = "; ".join(filter(None, (variant, "Uncorrected error")))

        # Championship headlines are captions; the display subject is the team.
        if 337 <= number <= 342:
            player = "Detroit Pistons" if "Detroit Pistons" in team else "Portland Trail Blazers"
            variant = "; ".join(filter(None, (variant, subject)))
        if number in TRUE_ROOKIES:
            player += " RC"
        row = [str(number), player, team, subset, variant]
        if source_number == "NNO" or source_number.endswith("b"):
            alternates.append([source_number, player, team, subset, variant])
        elif number not in base:
            base[number] = row
        else:
            raise ValueError(f"Duplicate canonical base number: {number}")

    if set(base) != set(range(1, 441)):
        raise ValueError(f"Base must contain precisely #1-440; missing {set(range(1, 441))-set(base)}")
    if len(alternates) != 15 or rookie_numbers != TRUE_ROOKIES:
        raise ValueError("Unexpected alternate printing or rookie count")
    if set(VARIATION_NOTES) != {"NNO", "13", *(str(n) + s for n in (169, 171, 172, 223, 234, 238, 249, 298, 341, 378, 406, 414, 421, 438) for s in "ab")}:
        raise ValueError("Variation detail fixture is incomplete")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(["setKey", "cardNumber", "player", "team", "subset", "variant"])
        writer.writerows([["base", *base[number]] for number in sorted(base)])
        writer.writerows([["variations", *row] for row in alternates])
    print(f"Wrote {len(base)} base cards and {len(alternates)} alternates to {OUTPUT}")


if __name__ == "__main__":
    main()
