"""Generate the 1991-92 Topps Hockey Set Factory draft from an offline fixture.

The checked-in source is the 528-card Topps and 21-card scoring-leader
checklist published by Hobby Insider, cross-checked with TCDB's set, rookie,
and insert summaries. Generation performs no network requests.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
STEM = "1991-92-topps-hockey"
SOURCE = DATA / f"{STEM}.source.json"
CSV = DATA / f"{STEM}.cards.csv"
BUNDLE = DATA / f"{STEM}.bundle.json"

ROOKIES = {
    24, 26, 28, 36, 116, 122, 209, 230, 246, 355, 380, 400,
    414, 431, 437, 450, 461, 471, 473, 478, 501, 506, 509, 513,
}
CHECKLIST_RANGES = {132: "1-132", 264: "133-264", 396: "265-396", 528: "397-528"}
SOURCE_MARKERS = "RC|SR|TP|UER|TR|AS|AW|HL|LL|TC|CL|FN"
MARKER_SUFFIX = re.compile(rf"(?:\s+(?:{SOURCE_MARKERS})|,\s*(?:{SOURCE_MARKERS}))+$")
ERROR_DETAILS = {
    8: 'Last name printed "Federov" on front and in statistics',
    526: 'Back incorrectly identifies the future Lightning arena as "Tampa Coliseum"',
}


def row(key: str, number: int, player: str, team: str, subset: str, variant: str = "") -> dict[str, str]:
    if not player or (not team and "checklist" not in (player + " " + subset).lower()):
        raise ValueError(f"Missing subject/team for {key} #{number}: {player!r} / {team!r}")
    return dict(setKey=key, cardNumber=str(number), player=player, team=team,
                subset=subset, variant=variant)


def clean_subject(raw: str) -> str:
    return MARKER_SUFFIX.sub("", raw).strip()


def base_card(number: int, source: list[str]) -> dict[str, str]:
    raw, team, category = source
    subject = clean_subject(raw)
    subset = category or "Base"
    variant = ERROR_DETAILS.get(number, "")
    if category == "Checklist":
        subject = "Checklist"
        variant = f"Cards {CHECKLIST_RANGES[number]}"
    elif category == "Team Checklist":
        subject = f"{team} Checklist"
    if number in ROOKIES:
        subject += " RC"
    return row("base", number, subject, team, subset, variant)


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    base = source["base"]
    leaders = source["teamScoringLeaders"]
    if {int(n) for n in base} != set(range(1, 529)):
        raise ValueError("Base checklist must contain #1-528 with no gaps")
    if {int(n) for n in leaders} != set(range(1, 22)):
        raise ValueError("Team Scoring Leaders must contain #1-21 with no gaps")
    if len(ROOKIES) != 24:
        raise ValueError("Rookie index changed")
    rows = [base_card(n, base[str(n)]) for n in range(1, 529)]
    for number in range(1, 22):
        raw, team = leaders[str(number)]
        variant = 'Back prints last name "Fluery"' if number == 14 else ""
        rows.append(row("team-scoring-leaders", number, clean_subject(raw), team,
                        "Team Scoring Leaders", variant))
    counts = Counter(card["setKey"] for card in rows)
    if counts != {"base": 528, "team-scoring-leaders": 21}:
        raise ValueError(f"Unexpected card counts: {counts}")

    bundle = {
        "schemaVersion": 2,
        "status": "DRAFT",
        "source": {
            "requestedUrl": "https://www.tcdb.com/ViewSet.cfm/sid/4882/1991-92-Topps",
            "checklistUrl": "https://www.tcdb.com/Checklist.cfm/sid/4882/1991-92-Topps",
            "rookiesUrl": "https://www.tcdb.com/Rookies.cfm/sid/4882/1991-92-Topps",
            "insertsUrl": "https://www.tcdb.com/Inserts.cfm/sid/4882/1991-92-Topps",
            "researchReferences": [
                "https://www.hobbyinsider.net/forum/threads/checklist-1991-92-o-pee-chee-topps.436750/",
                "https://www.beckett.com/hockey/1991-92/topps/",
                "https://www.beckett.com/hockey/1991-92/topps-team-scoring-leaders/",
            ],
            "note": "Offline checklist fixture; no automated TCDB extraction or image copying.",
        },
        "decisions": {
            "baseStructure": "One complete #1-528 Base ProductSet, with equal base-card availability.",
            "canonicalPackFormat": "Four collectible cards per VCS pack and 36 packs per box. Original standard wax was 14 base plus one glossy insert.",
            "teamScoringLeaders": "The 21-card glossy Team Scoring Leaders checklist appears at 1:1 standard-pack odds; the VCS pack fills its remaining three slots from Base.",
            "rookieNaming": "Only the 24 unique numbers in the TCDB rookie index receive an RC suffix. Super Rookie and Top Prospect alone do not imply RC.",
            "subjectCleanup": "Checklist abbreviations and UER notes are excluded from Player. Named subsets and pertinent printing details remain in Subset/Variant.",
            "variationHandling": "Team Scoring Leaders A*/B* copyright print codes are collapsed to one card per printed number. The four base checklists remain part of Base.",
            "excludedRelatedItems": "Pre-production samples, the promotional sheet, and blank-back promotional copies are excluded from the ordinary pack product.",
            "releaseSafety": "Product remains unreleased until card/pack images and pricing are reviewed.",
        },
        "product": {
            "id": "1991_92_Topps_Hockey",
            "year": 1991,
            "brand": "Topps",
            "sport": "Hockey",
            "cardsPerPack": 4,
            "packsPerBox": 36,
            "packPriceCents": 0,
            "autoPackPricing": True,
            "packImageUrl": None,
            "boxImageUrl": None,
            "released": False,
        },
        "review": {
            "teamData": "COMPLETE",
            "rookieData": "VERIFIED_AFTER_GENERATION",
            "packImage": "PENDING",
            "cardImages": "PENDING",
            "pricing": "PENDING",
            "release": "BLOCKED",
        },
        "cardsFile": CSV.name,
        "productSets": [
            {
                "key": "base",
                "id": "1991_92_Topps_Hockey_Base",
                "name": "Base",
                "kind": "BASE",
                "oddsPerPack": None,
                "defaultGradeability": "COMMON",
                "sourceUrl": "https://www.tcdb.com/Checklist.cfm/sid/4882/1991-92-Topps",
                "expectedCards": 528,
                "notes": "Complete #1-528 base checklist, including four numbered checklists and 24 team checklist cards.",
            },
            {
                "key": "team-scoring-leaders",
                "id": "1991_92_Topps_Hockey_Team_Scoring_Leaders",
                "name": "Team Scoring Leaders",
                "kind": "INSERT",
                "oddsPerPack": 1,
                "defaultGradeability": "COMMON",
                "sourceUrl": "https://www.tcdb.com/Checklist.cfm/sid/8785/1991-92-Topps---Team-Scoring-Leaders",
                "expectedCards": 21,
                "notes": "21 glossy cards, one per standard pack. A*/B* print codes are collapsed.",
            },
        ],
    }
    with CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=("setKey", "cardNumber", "player", "team", "subset", "variant"),
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    BUNDLE.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {CSV.name} ({len(rows)} cards) and {BUNDLE.name}")


if __name__ == "__main__":
    main()
