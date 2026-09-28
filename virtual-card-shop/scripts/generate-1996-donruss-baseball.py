"""Build the reviewed, offline 1996 Donruss Set Factory draft.

Checklist facts were checked against BaseballCardPedia, KeyMan Collectibles,
and the linked TCDB set. This generator never contacts those sites.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
STEM = "1996-donruss-baseball"
NAMES = DATA / f"{STEM}.source-names.json"
INSERTS = DATA / f"{STEM}.inserts.json"
CSV = DATA / f"{STEM}.cards.csv"
BUNDLE = DATA / f"{STEM}.bundle.json"
SET_URL = "https://www.tcdb.com/ViewSet.cfm/sid/654/1996-Donruss"
CHECKLIST_URL = "https://www.tcdb.com/Checklist.cfm/sid/654/1996-Donruss"
INSERTS_URL = "https://www.tcdb.com/Inserts.cfm/sid/654/1996-Donruss"
BCP_URL = "https://baseballcardpedia.com/index.php/1996_Donruss"

TEAM = dict(zip(
    "ANA ARI ATL BAL BOS CHC CHW CIN CLE COL DET FLA HOU KCR LAD MIL MIN MON NYM NYY OAK PHI PIT SDP SEA SFG STL TBD TEX TOR".split(),
    "California Angels|Arizona Diamondbacks|Atlanta Braves|Baltimore Orioles|Boston Red Sox|Chicago Cubs|Chicago White Sox|Cincinnati Reds|Cleveland Indians|Colorado Rockies|Detroit Tigers|Florida Marlins|Houston Astros|Kansas City Royals|Los Angeles Dodgers|Milwaukee Brewers|Minnesota Twins|Montreal Expos|New York Mets|New York Yankees|Oakland Athletics|Philadelphia Phillies|Pittsburgh Pirates|San Diego Padres|Seattle Mariners|San Francisco Giants|St. Louis Cardinals|Tampa Bay Devil Rays|Texas Rangers|Toronto Blue Jays".split("|"),
))

# Card-specific teams resolved from contemporary checklist entries. The same
# player can appear with different clubs in other 1995/96 releases. In
# particular, the 1996 Donruss #399 Kevin Brown team listing has an apparent
# Orioles data error; use his 1996 Marlins club here pending image review.
TEAM_FIXES = """
4 CHC,9 DET,11 PHI,12 COL,14 BOS,15 FLA,16 NYM,22 STL,23 MIN,27 BAL,29 BOS,
42 BAL,43 SEA,48 CHW,49 STL,51 NYY,57 SFG,59 PIT,61 OAK,63 SDP,65 PHI,
68 HOU,69 BAL,82 BAL,89 TOR,95 CHW,99 CHC,103 TOR,108 SEA,113 MIL,
115 HOU,117 KCR,119 BOS,120 SDP,121 NYM,124 CLE,131 ATL,137 MIN,
140 PHI,148 SEA,150 STL,152 SDP,154 FLA,155 OAK,163 TEX,164 KCR,166 SEA,169 TOR,
170 CIN,179 NYY,187 CHW,191 TEX,196 MIN,197 ATL,201 TEX,208 BAL,
209 LAD,211 MON,221 BOS,226 OAK,232 ANA,234 STL,235 SFG,237 BAL,241 NYY,
254 CHC,256 MON,257 ANA,261 NYM,262 BAL,264 PHI,282 STL,287 CIN,299 MIL,
314 SEA,323 TOR,324 ATL,348 PHI,361 ANA,366 FLA,368 MON,369 NYY,
378 CHW,380 MIN,384 CHW,399 FLA,400 COL,402 TEX,406 OAK,414 MIL,
415 CIN,416 SDP,418 NYY,419 TOR,423 TEX,425 CHW,429 CHC,438 SEA,
447 KCR,448 MIL,451 NYM,454 CLE,455 MON,456 HOU,459 SFG,462 SFG,
464 TOR,469 CIN,488 LAD,489 HOU,493 CIN,494 KCR,496 SEA,499 HOU,
506 DET,516 MON,520 KCR,521 BOS,522 ATL,523 CIN,526 MIN,527 MIL,528 SDP,
530 OAK,532 HOU,534 SDP,537 KCR,542 STL,543 LAD,544 NYM,546 LAD,548 OAK
"""
CARD_TEAMS = {}
for item in TEAM_FIXES.replace("\n", "").split(","):
    if item.strip():
        number, code = item.strip().split()
        CARD_TEAMS[int(number)] = TEAM[code]

ROOKIE_NUMBERS = {5, 59, 115, 187, 323, 377, 378, 425, 432, 456, 459, 485, 495}
CHECKLISTS = {110, 220, 325, 330, 440, 490, 550}


def normalize(name: str) -> str:
    name = re.sub(r"(?:\s+(?:RC|RR|CL|FBC))+$", "", name)
    name = re.sub(r"\b(Jr|Sr)\b", "", name)
    return re.sub(r"[^a-z0-9]", "", name.lower())


def is_checklist(player: str, subset: str) -> bool:
    return "checklist" in player.lower() or "checklist" in subset.lower()


def known_teams() -> dict[str, str]:
    """Use only unambiguous names in 1996 Ultra, Bowman, then 1995 bases."""
    result: dict[str, str] = {}
    for filename in (
        "1996-ultra.cards.csv", "1996-bowman-baseball.cards.csv",
        "1995-donruss.cards.csv", "1995-bowman-baseball.cards.csv",
    ):
        grouped: dict[str, set[str]] = defaultdict(set)
        with (DATA / filename).open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if row["setKey"] == "base" and row["team"]:
                    grouped[normalize(row["player"])].add(row["team"])
        for name, teams in grouped.items():
            if len(teams) == 1:
                result.setdefault(name, next(iter(teams)))
    return result


def clean_name(raw: str, number: int | None = None) -> str:
    value = re.sub(r" (RC|RR|CL)$", "", raw)
    value = value.replace("Ken Griffey, Jr.", "Ken Griffey Jr.")
    value = value.replace("Cal Ripken, Jr.", "Cal Ripken Jr.")
    if number == 27:
        value = "Gregg Zaun"  # Correct name; Donruss card itself spells Greg.
    if number == 197:
        value = "David Justice"
    return value


def make_row(key: str, number: str, player: str, team: str, subset: str, variant: str = "") -> dict[str, str]:
    if not team and not is_checklist(player, subset):
        raise ValueError(f"{key} #{number} {player} has no verified team")
    return dict(setKey=key, cardNumber=number, player=player, team=team, subset=subset, variant=variant)


def main() -> None:
    names = json.loads(NAMES.read_text(encoding="utf-8"))
    inserts = json.loads(INSERTS.read_text(encoding="utf-8"))
    if {int(n) for n in names} != set(range(1, 551)):
        raise ValueError("Base checklist is not exactly cards 1-550")
    if len(ROOKIE_NUMBERS) != 13 or len(CHECKLISTS) != 7:
        raise ValueError("Rookie or checklist count changed")

    teams = known_teams()
    base: list[dict[str, str]] = []
    for number in range(1, 551):
        raw = names[str(number)]
        player = clean_name(raw, number)
        if number in CHECKLISTS:
            base.append(make_row("base", str(number), "Checklist", "", "Checklist", f"Featured: {player}"))
            continue
        if number in ROOKIE_NUMBERS:
            player += " RC"
        team = CARD_TEAMS.get(number) or teams.get(normalize(player), "")
        variant = 'Printed name: "Greg" Zaun' if number == 27 else ""
        base.append(make_row("base", str(number), player, team, "Base", variant))

    # Insert team lookup follows the exact base-card club if the player has
    # one in this set; this prevents later releases' trades changing inserts.
    by_player: dict[str, str] = {}
    for card in base:
        if card["team"]:
            by_player.setdefault(normalize(card["player"]), card["team"])
    # The DK checklist is intentionally teamless.
    rows = list(base)
    groups = [
        ("diamond-kings", "Diamond Kings", 31, None, "DK-1 to DK-31; numbered to 10,000. First 14 were Series 1, last 17 Series 2; published Series 2 odds conflict."),
        ("elite-series", "Elite Series", 12, None, "#61-72; numbered to 10,000. Series 1 and 2 had different odds (1:75 and 1:40)."),
        ("freeze-frame", "Freeze Frame", 8, 60, "Series 2; numbered to 5,000; historically 1:60 packs."),
        ("hit-list", "Hit List", 16, None, "Series 1 #1-8 and Series 2 #9-16; numbered to 10,000; odds differ by series."),
        ("long-ball-leaders", "Long Ball Leaders", 8, 96, "Series 1 retail exclusive, historically 1:96 packs."),
        ("power-alley", "Power Alley", 10, 92, "Series 1 hobby exclusive, numbered to 5,000; historically 1:92 packs."),
        ("pure-power", "Pure Power", 8, 80, "Series 2 retail exclusive, historically 1:80 packs."),
        ("round-trippers", "Round Trippers", 10, 55, "Series 2 hobby exclusive, historically 1:55 packs."),
        ("showdown", "Showdown", 8, 105, "Series 1; two players per card, historically 1:105 packs."),
    ]
    product_sets = [dict(
        key="base", id="1996_Donruss_Baseball_Base", name="Base", kind="BASE",
        oddsPerPack=None, defaultGradeability="COMMON", sourceUrl=CHECKLIST_URL,
        expectedCards=550, notes="Complete Series 1 #1-330 and Series 2 #331-550 combined equally in one base pool.",
    ), dict(
        key="press-proofs", id="1996_Donruss_Baseball_Press_Proofs", name="Press Proofs",
        kind="PARALLEL", oddsPerPack=None, defaultGradeability="COMMON",
        sourceUrl="https://www.tcdb.com/Checklist.cfm/sid/56657/1996-Donruss---Press-Proofs",
        expectedCards=550, deriveCardsFrom="base", derivedVariant="Press Proof",
        notes="Full parallel, serial numbered /2000. Series 1 1:12 packs; Series 2 1:10; combined-pack odds require review.",
    )]
    for slug, title, expected, odds, note in groups:
        cards = inserts.get(slug)
        if cards is None or len(cards) != expected or len({x["cardNumber"] for x in cards}) != expected:
            raise ValueError(f"Incomplete or duplicate {title} checklist")
        for card in cards:
            player = clean_name(card["player"])
            if slug == "showdown":
                parts = player.split(" / ")
                clubs = [by_player.get(normalize(p), "") for p in parts]
                team = " / ".join(clubs) if all(clubs) else ""
            elif "checklist" in player.lower():
                player, team = "Checklist", ""
            else:
                team = by_player.get(normalize(player), "")
            variant = "King of Kings" if slug == "diamond-kings" and card["cardNumber"] in {"DK-29", "DK-30"} else ""
            rows.append(make_row(slug, card["cardNumber"], player, team, title, variant))
        product_sets.append(dict(
            key=slug, id="1996_Donruss_Baseball_" + title.replace(" ", "_"),
            name=title, kind="INSERT", oddsPerPack=odds,
            defaultGradeability="COMMON", sourceUrl=INSERTS_URL,
            expectedCards=expected, notes=note,
        ))

    product_sets.insert(8, dict(
        key="power-alley-die-cuts", id="1996_Donruss_Baseball_Power_Alley_Die_Cuts",
        name="Power Alley Die Cuts", kind="PARALLEL", oddsPerPack=None,
        defaultGradeability="COMMON", sourceUrl=INSERTS_URL, expectedCards=10,
        deriveCardsFrom="power-alley", derivedVariant="Die Cut",
        notes="Die-cut copies of the Power Alley checklist; first 500 of each player's 5,000 copies. Independent pack odds unverified.",
    ))

    if len(rows) != 661 or sum(int(s["expectedCards"]) for s in product_sets) != 1221:
        raise ValueError("Set Factory card-count invariant failed")
    with CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["setKey", "cardNumber", "player", "team", "subset", "variant"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    bundle = dict(
        schemaVersion=2, status="DRAFT",
        source=dict(requestedUrl=SET_URL, checklistUrl=CHECKLIST_URL,
                    insertsUrl=INSERTS_URL, distributionReference=BCP_URL,
                    supportingChecklist="https://keymancollectibles.com/baseballcards/donruss/1996donrussbaseballcardchecklist.htm",
                    note="550 numbered base cards in two series; nine insert checklists, Press Proofs, and die-cut Power Alley. Promos excluded."),
        decisions=dict(
            baseStructure="Series 1 #1-330 and Series 2 #331-550 combined into one 550-card base ProductSet, equal base probability.",
            canonicalPackFormat="VCS one standard four-card pack; 36 packs per box follows Series 1 hobby distribution. Series 2 boxes had 18 packs.",
            packChannelAbstraction="Original hobby/retail and two-series insert channels are represented in one VCS pack; historical single-channel odds are recorded where verifiable, mixed-series odds left null.",
            parallelStructure="550 Press Proofs derived from Base; 10 Power Alley Die Cuts derived from the Power Alley insert.",
            trueRookieNaming="Only the 13 TCDB rookie-indexed base card numbers receive RC. Rated Rookie RR alone is not treated as a true RC.",
            checklistHandling="Seven numbered base checklists and Diamond Kings DK-31 use a clean Checklist subject, empty team, and featured subject in Variant where appropriate.",
            teamHandling="Team names checked against contemporary sets and manually resolved for trades and missing names. #399 Kevin Brown uses the 1996 Marlins club instead of an apparent Orioles reference error; images pending review.",
            excludedRelatedItems="Pre-release/promotional sets are omitted; pack-issued inserts and the two relevant parallels are included.",
            releaseSafety="Images and pricing remain pending; historical mixed-series odds require review before release.",
        ),
        product=dict(id="1996_Donruss_Baseball", year=1996, brand="Donruss", sport="Baseball",
                     cardsPerPack=4, packsPerBox=36, packPriceCents=0, autoPackPricing=True,
                     packImageUrl=None, boxImageUrl=None, released=False),
        review=dict(teamData="COMPLETE", rookieData="VERIFIED_AFTER_GENERATION", packImage="PENDING",
                    cardImages="PENDING", pricing="PENDING", release="BLOCKED"),
        cardsFile=CSV.name, productSets=product_sets,
    )
    BUNDLE.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {CSV.name}: {len(rows)} explicit cards, 550 base, {len(product_sets)} ProductSets, 1221 resolved cards")


if __name__ == "__main__":
    main()
